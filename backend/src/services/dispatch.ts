import { prisma } from "../lib/prisma";
import { redis, geoKeyFor } from "../lib/redis";
import { config } from "../config";
import { emitToUser, emitOrderUpdate } from "../sockets";
import { pushToUser } from "./fcm";
import { etaMinutes } from "../utils/geo";

// ─────────────────────────────────────────────────────────────
// Dispatch — matching an order with the nearest available drivers.
//
// Strategy: broadcast the offer to the closest N approved & online drivers
// of the right vehicle type; the first driver to call POST /orders/:id/accept
// wins (the accept is an atomic conditional update, so two drivers can never
// both get the order). If nobody accepts within the timeout we retry with a
// wider radius, up to 3 rounds, then inform the customer.
// ─────────────────────────────────────────────────────────────

const MAX_ROUNDS = 3;

export async function findNearbyDriverIds(
  lat: number,
  lng: number,
  vehicleType: "MOTO" | "TRUCK",
  radiusKm: number,
  count: number,
  exclude: Set<string> = new Set(),
): Promise<string[]> {
  const found = (await redis.geosearch(
    geoKeyFor(vehicleType),
    "FROMLONLAT", lng, lat,
    "BYRADIUS", radiusKm, "km",
    "ASC", "COUNT", count + exclude.size,
  )) as string[];
  if (!found.length) return [];

  // Confirm against the DB — Redis only knows who recently sent a location.
  const profiles = await prisma.driverProfile.findMany({
    where: {
      userId: { in: found.filter((id) => !exclude.has(id)) },
      online: true,
      approvalStatus: "APPROVED",
      vehicleType,
    },
    select: { userId: true },
  });
  const valid = new Set(profiles.map((p) => p.userId));
  return found.filter((id) => valid.has(id)).slice(0, count);
}

export async function dispatchOrder(orderId: string, round = 1): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDING" || order.driverId) return;

  const radius = config.dispatch.searchRadiusKm * round; // widen each round
  const notifiedKey = `dispatch:notified:${orderId}`;
  const alreadyNotified = new Set(await redis.smembers(notifiedKey));

  const driverIds = await findNearbyDriverIds(
    order.pickupLat,
    order.pickupLng,
    order.vehicleType,
    radius,
    config.dispatch.maxDriversNotified,
    alreadyNotified,
  );

  if (driverIds.length > 0) {
    await redis.sadd(notifiedKey, ...driverIds);
    await redis.expire(notifiedKey, 3600);

    const offer = {
      orderId: order.id,
      code: order.code,
      vehicleType: order.vehicleType,
      pickup: { lat: order.pickupLat, lng: order.pickupLng, address: order.pickupAddress },
      dropoff: { lat: order.dropoffLat, lng: order.dropoffLng, address: order.dropoffAddress },
      distanceKm: order.distanceKm,
      price: Number(order.price),
      driverEarning: Number(order.driverEarning),
      packageType: order.packageType,
      paymentMethod: order.paymentMethod,
      expiresInSec: config.dispatch.acceptTimeoutSec,
    };
    for (const driverId of driverIds) {
      emitToUser(driverId, "order:offer", offer);
      const profile = await prisma.driverProfile.findUnique({ where: { userId: driverId } });
      if (profile?.lastLat != null && profile.lastLng != null) {
        void pushToUser(
          driverId,
          "طلب توصيل جديد قريب منك 🛵",
          `${order.pickupAddress} → ${order.dropoffAddress} — ${Number(order.price)} MRU (وصول خلال ~${etaMinutes(profile.lastLat, profile.lastLng, order.pickupLat, order.pickupLng, order.vehicleType)} د)`,
          { type: "order_offer", orderId: order.id },
        );
      }
    }
  }

  // Schedule the next round / final "no driver" notice.
  setTimeout(async () => {
    const fresh = await prisma.order.findUnique({ where: { id: orderId } });
    if (!fresh || fresh.status !== "PENDING") return;
    if (round < MAX_ROUNDS) {
      await dispatchOrder(orderId, round + 1);
    } else {
      emitOrderUpdate(orderId, "order:no_driver", { orderId });
      await pushToUser(
        fresh.customerId,
        "لا يوجد سائق متاح حاليًا",
        "نعتذر، لم نجد سائقًا قريبًا. حاول مجددًا بعد قليل أو غيّر نوع المركبة.",
        { type: "no_driver", orderId },
      );
    }
  }, config.dispatch.acceptTimeoutSec * 1000);
}
