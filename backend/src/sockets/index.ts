import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { redis, geoKeyFor } from "../lib/redis";
import { etaMinutes } from "../utils/geo";
import type { Role, VehicleType } from "@prisma/client";

let io: Server | null = null;

export function getIo(): Server {
  if (!io) throw new Error("Socket.io not initialised");
  return io;
}

interface SocketUser {
  id: string;
  role: Role;
}

// Rooms:
//   user:{id}   — private channel (offers, status pushes)
//   order:{id}  — live tracking + chat for one order
//   admins      — live operations map (all driver locations)
export function initSockets(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: config.corsOrigins, methods: ["GET", "POST"] },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("auth required"));
    try {
      const payload = jwt.verify(token, config.jwt.accessSecret) as jwt.JwtPayload;
      (socket.data as { user: SocketUser }).user = {
        id: payload.sub as string,
        role: payload.role as Role,
      };
      next();
    } catch {
      next(new Error("invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket.data as { user: SocketUser }).user;
    socket.join(`user:${user.id}`);
    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") socket.join("admins");

    registerDriverHandlers(socket, user);
    registerCustomerHandlers(socket, user);
    registerChatHandlers(socket, user);

    socket.on("disconnect", async () => {
      // Drivers who drop the connection are removed from the live GEO index
      // so customers never see ghost drivers on the map. Their DB `online`
      // flag stays until they explicitly toggle off or the staleness sweep
      // catches them.
      if (user.role === "DRIVER") {
        await redis.zrem(geoKeyFor("MOTO"), user.id).catch(() => {});
        await redis.zrem(geoKeyFor("TRUCK"), user.id).catch(() => {});
      }
    });
  });

  return io;
}

function registerDriverHandlers(socket: Socket, user: SocketUser) {
  if (user.role !== "DRIVER") return;

  socket.on(
    "location:update",
    async (payload: { lat: number; lng: number; heading?: number }) => {
      const { lat, lng, heading } = payload ?? {};
      if (typeof lat !== "number" || typeof lng !== "number") return;

      const profile = await prisma.driverProfile.findUnique({ where: { userId: user.id } });
      if (!profile || profile.approvalStatus !== "APPROVED" || !profile.online) return;

      await redis.geoadd(geoKeyFor(profile.vehicleType), lng, lat, user.id);
      await prisma.driverProfile.update({
        where: { userId: user.id },
        data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date() },
      });

      const point = {
        driverId: user.id,
        lat,
        lng,
        heading: heading ?? null,
        vehicleType: profile.vehicleType,
        at: Date.now(),
      };

      // Live ops map for admins.
      getIo().to("admins").emit("driver:location", point);

      // Live tracking for the customer of the driver's active order.
      const activeOrder = await prisma.order.findFirst({
        where: {
          driverId: user.id,
          status: { in: ["ACCEPTED", "ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT"] },
        },
        select: { id: true },
      });
      if (activeOrder) getIo().to(`order:${activeOrder.id}`).emit("driver:location", point);
    },
  );
}

function registerCustomerHandlers(socket: Socket, user: SocketUser) {
  // "Nearby drivers on the map the moment the order screen opens".
  socket.on(
    "drivers:nearby",
    async (
      payload: { lat: number; lng: number; vehicleType?: VehicleType; radiusKm?: number },
      ack?: (drivers: unknown[]) => void,
    ) => {
      try {
        const { lat, lng } = payload ?? {};
        if (typeof lat !== "number" || typeof lng !== "number") return ack?.([]);
        const radius = Math.min(payload.radiusKm ?? config.dispatch.searchRadiusKm, 20);
        const types: VehicleType[] = payload.vehicleType ? [payload.vehicleType] : ["MOTO", "TRUCK"];

        const results: unknown[] = [];
        for (const vt of types) {
          const found = (await redis.geosearch(
            geoKeyFor(vt),
            "FROMLONLAT", lng, lat,
            "BYRADIUS", radius, "km",
            "ASC", "COUNT", 20,
            "WITHCOORD",
          )) as [string, [string, string]][];
          if (!found.length) continue;

          const ids = found.map(([id]) => id);
          const profiles = await prisma.driverProfile.findMany({
            where: { userId: { in: ids }, online: true, approvalStatus: "APPROVED" },
            include: { user: { select: { name: true, avatarUrl: true } } },
          });
          const byId = new Map(profiles.map((p) => [p.userId, p]));
          for (const [id, [lngS, latS]] of found) {
            const p = byId.get(id);
            if (!p) continue;
            const dLat = parseFloat(latS);
            const dLng = parseFloat(lngS);
            results.push({
              driverId: id,
              name: p.user.name,
              avatarUrl: p.user.avatarUrl,
              rating: p.ratingAvg,
              ratingCount: p.ratingCount,
              vehicleType: vt,
              lat: dLat,
              lng: dLng,
              etaMin: etaMinutes(dLat, dLng, lat, lng, vt),
            });
          }
        }
        ack?.(results);
      } catch (err) {
        console.error("[socket drivers:nearby]", err);
        ack?.([]);
      }
    },
  );

  socket.on("order:subscribe", async (payload: { orderId: string }, ack?: (ok: boolean) => void) => {
    const orderId = payload?.orderId;
    if (!orderId) return ack?.(false);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    const allowed =
      !!order &&
      (order.customerId === user.id ||
        order.driverId === user.id ||
        user.role === "ADMIN" ||
        user.role === "SUPER_ADMIN");
    if (allowed) socket.join(`order:${orderId}`);
    ack?.(allowed);
  });
}

function registerChatHandlers(socket: Socket, user: SocketUser) {
  socket.on(
    "chat:send",
    async (payload: { orderId: string; text: string }, ack?: (ok: boolean) => void) => {
      try {
        const { orderId, text } = payload ?? {};
        if (!orderId || !text?.trim()) return ack?.(false);
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order || (order.customerId !== user.id && order.driverId !== user.id)) {
          return ack?.(false);
        }
        const msg = await prisma.chatMessage.create({
          data: { orderId, senderId: user.id, text: text.trim().slice(0, 1000) },
        });
        getIo().to(`order:${orderId}`).emit("chat:message", {
          id: msg.id,
          orderId,
          senderId: user.id,
          text: msg.text,
          createdAt: msg.createdAt,
        });
        ack?.(true);
      } catch (err) {
        console.error("[socket chat:send]", err);
        ack?.(false);
      }
    },
  );
}

// Helper used by REST routes to broadcast order lifecycle changes.
export function emitOrderUpdate(orderId: string, event: string, data: unknown) {
  getIo().to(`order:${orderId}`).emit(event, data);
  getIo().to("admins").emit("orders:changed", { orderId, event, data });
}

export function emitToUser(userId: string, event: string, data: unknown) {
  getIo().to(`user:${userId}`).emit(event, data);
}
