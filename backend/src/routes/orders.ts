import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH, HttpError } from "../middleware/error";
import { requireAuth, requireRole } from "../middleware/auth";
import { quoteOrder } from "../utils/pricing";
import { dispatchOrder } from "../services/dispatch";
import { emitOrderUpdate, emitToUser } from "../sockets";
import { pushToUser } from "../services/fcm";
import { chargeWallet, creditWallet, initiatePayment } from "../services/payments";
import type { OrderStatus, Prisma } from "@prisma/client";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(2).max(200),
});

const orderInclude = {
  driver: {
    select: {
      id: true, name: true, phone: true, avatarUrl: true,
      driverProfile: { select: { vehicleType: true, plateNumber: true, ratingAvg: true, ratingCount: true, lastLat: true, lastLng: true } },
    },
  },
  customer: { select: { id: true, name: true, phone: true, avatarUrl: true } },
  rating: true,
} satisfies Prisma.OrderInclude;

function serializeOrder(o: { price: unknown; commission: unknown; driverEarning: unknown } & Record<string, unknown>) {
  return { ...o, price: Number(o.price), commission: Number(o.commission), driverEarning: Number(o.driverEarning) };
}

async function generateOrderCode(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.order.count({
    where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
  });
  return `MD-${today}-${String(count + 1).padStart(4, "0")}`;
}

// ── Quote (price preview before ordering) ─────────────────────

ordersRouter.post(
  "/quote",
  asyncH(async (req, res) => {
    const body = z
      .object({
        pickup: pointSchema.pick({ lat: true, lng: true }),
        dropoff: pointSchema.pick({ lat: true, lng: true }),
        vehicleType: z.enum(["MOTO", "TRUCK"]).optional(),
      })
      .parse(req.body);
    const types = body.vehicleType ? [body.vehicleType] : (["MOTO", "TRUCK"] as const);
    const quotes = await Promise.all(
      types.map((vt) => quoteOrder(body.pickup.lat, body.pickup.lng, body.dropoff.lat, body.dropoff.lng, vt)),
    );
    res.json({ quotes });
  }),
);

// ── Create order ──────────────────────────────────────────────

ordersRouter.post(
  "/",
  requireRole("CUSTOMER", "ADMIN", "SUPER_ADMIN"),
  asyncH(async (req, res) => {
    const body = z
      .object({
        pickup: pointSchema,
        dropoff: pointSchema,
        vehicleType: z.enum(["MOTO", "TRUCK"]),
        paymentMethod: z.enum(["CASH", "BANKILY", "MASRIVI", "WALLET"]).default("CASH"),
        packageType: z.string().max(80).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);

    const quote = await quoteOrder(
      body.pickup.lat, body.pickup.lng, body.dropoff.lat, body.dropoff.lng, body.vehicleType,
    );

    const order = await prisma.order.create({
      data: {
        code: await generateOrderCode(),
        customerId: req.user!.id,
        vehicleType: body.vehicleType,
        packageType: body.packageType,
        notes: body.notes,
        pickupLat: body.pickup.lat,
        pickupLng: body.pickup.lng,
        pickupAddress: body.pickup.address,
        dropoffLat: body.dropoff.lat,
        dropoffLng: body.dropoff.lng,
        dropoffAddress: body.dropoff.address,
        distanceKm: quote.distanceKm,
        durationMin: quote.durationMin,
        price: quote.price,
        commission: quote.commission,
        driverEarning: quote.driverEarning,
        paymentMethod: body.paymentMethod,
        events: { create: { status: "PENDING", byUserId: req.user!.id } },
      },
    });

    // WALLET is charged upfront; BANKILY/MASRIVI return payment instructions;
    // CASH settles at delivery.
    let payment: Awaited<ReturnType<typeof initiatePayment>> = { status: "PENDING" };
    if (body.paymentMethod === "WALLET") {
      await chargeWallet(req.user!.id, quote.price, order.id);
      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID" } });
      payment = { status: "PAID" };
    } else if (body.paymentMethod === "BANKILY" || body.paymentMethod === "MASRIVI") {
      const customer = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      payment = await initiatePayment(body.paymentMethod, order.id, quote.price, customer.phone);
    }

    void dispatchOrder(order.id);
    res.status(201).json({ order: serializeOrder(order), payment });
  }),
);

// ── Listing & detail ──────────────────────────────────────────

ordersRouter.get(
  "/",
  asyncH(async (req, res) => {
    const { role, id } = req.user!;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const take = Math.min(50, Number(req.query.limit ?? 20));
    const where: Prisma.OrderWhereInput =
      role === "DRIVER" ? { driverId: id } :
      role === "CUSTOMER" ? { customerId: id } : {};
    if (typeof req.query.status === "string") where.status = req.query.status as OrderStatus;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where, include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take, take,
      }),
      prisma.order.count({ where }),
    ]);
    res.json({ orders: orders.map(serializeOrder), total, page });
  }),
);

ordersRouter.get(
  "/:id",
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { ...orderInclude, events: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) throw new HttpError(404, "Order not found");
    const { role, id } = req.user!;
    if (role !== "ADMIN" && role !== "SUPER_ADMIN" && order.customerId !== id && order.driverId !== id) {
      throw new HttpError(403, "Forbidden");
    }
    res.json({ order: serializeOrder(order) });
  }),
);

ordersRouter.get(
  "/:id/messages",
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.customerId !== req.user!.id && order.driverId !== req.user!.id) {
      throw new HttpError(403, "Forbidden");
    }
    const messages = await prisma.chatMessage.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    res.json({ messages });
  }),
);

// ── Driver: accept ────────────────────────────────────────────

ordersRouter.post(
  "/:id/accept",
  requireRole("DRIVER"),
  asyncH(async (req, res) => {
    const driverId = req.user!.id;
    const profile = await prisma.driverProfile.findUnique({ where: { userId: driverId } });
    if (!profile || profile.approvalStatus !== "APPROVED" || !profile.online) {
      throw new HttpError(403, "Driver not available");
    }
    const busy = await prisma.order.findFirst({
      where: { driverId, status: { in: ["ACCEPTED", "ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT"] } },
    });
    if (busy) throw new HttpError(409, "You already have an active order");

    // Atomic claim: only succeeds if the order is still unassigned.
    const claimed = await prisma.order.updateMany({
      where: { id: req.params.id, status: "PENDING", driverId: null },
      data: { driverId, status: "ACCEPTED", acceptedAt: new Date() },
    });
    if (claimed.count === 0) throw new HttpError(409, "Order already taken");

    await prisma.orderEvent.create({
      data: { orderId: req.params.id, status: "ACCEPTED", byUserId: driverId },
    });
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: req.params.id },
      include: orderInclude,
    });

    emitOrderUpdate(order.id, "order:status", { orderId: order.id, status: "ACCEPTED", driver: order.driver });
    emitToUser(order.customerId, "order:accepted", { orderId: order.id, driver: order.driver });
    void pushToUser(order.customerId, "تم قبول طلبك ✅", `السائق ${order.driver?.name} في الطريق إليك.`, { type: "order_status", orderId: order.id });
    res.json({ order: serializeOrder(order) });
  }),
);

// ── Driver: advance status ────────────────────────────────────

const STATUS_FLOW: Record<string, OrderStatus[]> = {
  ACCEPTED: ["ARRIVED_PICKUP", "PICKED_UP"],
  ARRIVED_PICKUP: ["PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT", "DELIVERED"],
  IN_TRANSIT: ["DELIVERED"],
};

const STATUS_PUSH: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  ARRIVED_PICKUP: { title: "السائق وصل إلى نقطة الاستلام 📍", body: "السائق ينتظر عند نقطة الانطلاق." },
  PICKED_UP: { title: "تم استلام طلبك 📦", body: "السائق استلم الشحنة وهو متجه إلى الوجهة." },
  IN_TRANSIT: { title: "طلبك في الطريق 🚚", body: "تابع موقع السائق مباشرة على الخريطة." },
  DELIVERED: { title: "تم التسليم بنجاح 🎉", body: "شكرًا لاستخدامك مشيلي! قيّم تجربتك مع السائق." },
};

ordersRouter.post(
  "/:id/status",
  requireRole("DRIVER"),
  asyncH(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]) })
      .parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.driverId !== req.user!.id) throw new HttpError(403, "Not your order");
    if (!STATUS_FLOW[order.status]?.includes(status)) {
      throw new HttpError(409, `Cannot move from ${order.status} to ${status}`);
    }

    const data: Prisma.OrderUpdateInput = { status };
    if (status === "PICKED_UP") data.pickedUpAt = new Date();
    if (status === "DELIVERED") {
      data.deliveredAt = new Date();
      // Cash is settled hand-to-hand at delivery.
      if (order.paymentMethod === "CASH") data.paymentStatus = "PAID";
    }

    const updated = await prisma.order.update({ where: { id: order.id }, data });
    await prisma.orderEvent.create({ data: { orderId: order.id, status, byUserId: req.user!.id } });

    if (status === "DELIVERED") {
      // Settle driver earnings into the driver wallet (withdrawable later).
      await creditWallet(req.user!.id, Number(order.driverEarning), "EARNING", order.id, `Order ${order.code}`);
      await prisma.walletTransaction.create({
        data: { userId: req.user!.id, type: "COMMISSION", amount: -0, orderId: order.id, note: `Platform commission ${Number(order.commission)} MRU (deducted from fare)` },
      });
      await prisma.driverProfile.update({
        where: { userId: req.user!.id },
        data: { totalEarnings: { increment: order.driverEarning } },
      });
    }

    emitOrderUpdate(order.id, "order:status", { orderId: order.id, status });
    const push = STATUS_PUSH[status];
    if (push) void pushToUser(order.customerId, push.title, push.body, { type: "order_status", orderId: order.id });
    res.json({ order: serializeOrder(updated) });
  }),
);

// ── Cancel ────────────────────────────────────────────────────

ordersRouter.post(
  "/:id/cancel",
  asyncH(async (req, res) => {
    const { reason } = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new HttpError(404, "Order not found");
    const { id, role } = req.user!;
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
    if (order.customerId !== id && !isAdmin) throw new HttpError(403, "Forbidden");
    if (!["PENDING", "ACCEPTED", "ARRIVED_PICKUP"].includes(order.status)) {
      throw new HttpError(409, "Order can no longer be cancelled");
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelReason: reason, cancelledAt: new Date() },
    });
    await prisma.orderEvent.create({
      data: { orderId: order.id, status: "CANCELLED", byUserId: id, note: reason },
    });
    // Refund upfront wallet payments.
    if (order.paymentMethod === "WALLET" && order.paymentStatus === "PAID") {
      await creditWallet(order.customerId, Number(order.price), "REFUND", order.id);
      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } });
    }

    emitOrderUpdate(order.id, "order:status", { orderId: order.id, status: "CANCELLED" });
    if (order.driverId) {
      void pushToUser(order.driverId, "تم إلغاء الطلب", `الطلب ${order.code} أُلغي من طرف الزبون.`, { type: "order_status", orderId: order.id });
    }
    res.json({ ok: true });
  }),
);

// ── Rating ────────────────────────────────────────────────────

ordersRouter.post(
  "/:id/rate",
  requireRole("CUSTOMER"),
  asyncH(async (req, res) => {
    const { stars, comment } = z
      .object({ stars: z.number().int().min(1).max(5), comment: z.string().max(500).optional() })
      .parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { rating: true } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.customerId !== req.user!.id) throw new HttpError(403, "Forbidden");
    if (order.status !== "DELIVERED" || !order.driverId) throw new HttpError(409, "Order not delivered yet");
    if (order.rating) throw new HttpError(409, "Order already rated");

    await prisma.rating.create({
      data: { orderId: order.id, customerId: req.user!.id, driverId: order.driverId, stars, comment },
    });
    // Recompute the driver's aggregate rating.
    const agg = await prisma.rating.aggregate({
      where: { driverId: order.driverId },
      _avg: { stars: true },
      _count: true,
    });
    await prisma.driverProfile.update({
      where: { userId: order.driverId },
      data: { ratingAvg: Math.round((agg._avg.stars ?? 0) * 100) / 100, ratingCount: agg._count },
    });
    res.status(201).json({ ok: true });
  }),
);

// ── One-tap reorder ───────────────────────────────────────────

ordersRouter.post(
  "/:id/reorder",
  requireRole("CUSTOMER"),
  asyncH(async (req, res) => {
    const prev = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!prev || prev.customerId !== req.user!.id) throw new HttpError(404, "Order not found");

    const quote = await quoteOrder(prev.pickupLat, prev.pickupLng, prev.dropoffLat, prev.dropoffLng, prev.vehicleType);
    const order = await prisma.order.create({
      data: {
        code: await generateOrderCode(),
        customerId: req.user!.id,
        vehicleType: prev.vehicleType,
        packageType: prev.packageType,
        notes: prev.notes,
        pickupLat: prev.pickupLat,
        pickupLng: prev.pickupLng,
        pickupAddress: prev.pickupAddress,
        dropoffLat: prev.dropoffLat,
        dropoffLng: prev.dropoffLng,
        dropoffAddress: prev.dropoffAddress,
        distanceKm: quote.distanceKm,
        durationMin: quote.durationMin,
        price: quote.price,
        commission: quote.commission,
        driverEarning: quote.driverEarning,
        paymentMethod: prev.paymentMethod === "WALLET" ? "CASH" : prev.paymentMethod,
        events: { create: { status: "PENDING", byUserId: req.user!.id } },
      },
    });
    void dispatchOrder(order.id);
    res.status(201).json({ order: serializeOrder(order) });
  }),
);
