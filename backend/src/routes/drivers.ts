import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { redis, geoKeyFor } from "../lib/redis";
import { asyncH, HttpError } from "../middleware/error";
import { requireAuth, requireRole } from "../middleware/auth";

export const driversRouter = Router();
driversRouter.use(requireAuth, requireRole("DRIVER"));

driversRouter.get(
  "/me",
  asyncH(async (req, res) => {
    const profile = await prisma.driverProfile.findUnique({
      where: { userId: req.user!.id },
      include: { user: { select: { name: true, phone: true, avatarUrl: true, walletBalance: true, status: true } } },
    });
    if (!profile) throw new HttpError(404, "Driver profile not found");
    res.json({
      profile: {
        ...profile,
        totalEarnings: Number(profile.totalEarnings),
        user: { ...profile.user, walletBalance: Number(profile.user.walletBalance) },
      },
    });
  }),
);

// Online/Offline toggle — "متاح للعمل".
driversRouter.post(
  "/availability",
  asyncH(async (req, res) => {
    const { online, lat, lng } = z
      .object({ online: z.boolean(), lat: z.number().optional(), lng: z.number().optional() })
      .parse(req.body);
    const profile = await prisma.driverProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw new HttpError(404, "Driver profile not found");
    if (online && profile.approvalStatus !== "APPROVED") {
      throw new HttpError(403, "Account pending admin approval");
    }

    await prisma.driverProfile.update({
      where: { userId: req.user!.id },
      data: { online, ...(lat != null && lng != null ? { lastLat: lat, lastLng: lng, lastLocationAt: new Date() } : {}) },
    });
    if (online && lat != null && lng != null) {
      await redis.geoadd(geoKeyFor(profile.vehicleType), lng, lat, req.user!.id);
    } else if (!online) {
      await redis.zrem(geoKeyFor(profile.vehicleType), req.user!.id);
    }
    res.json({ online });
  }),
);

// Update documents / vehicle info (re-submits for approval if rejected).
driversRouter.put(
  "/me",
  asyncH(async (req, res) => {
    const body = z
      .object({
        plateNumber: z.string().min(2).max(20).optional(),
        licenseImageUrl: z.string().url().optional(),
        idCardImageUrl: z.string().url().optional(),
        vehicleImageUrl: z.string().url().optional(),
        vehicleType: z.enum(["MOTO", "TRUCK"]).optional(),
      })
      .parse(req.body);
    const profile = await prisma.driverProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw new HttpError(404, "Driver profile not found");
    const updated = await prisma.driverProfile.update({
      where: { userId: req.user!.id },
      data: {
        ...body,
        ...(profile.approvalStatus === "REJECTED" ? { approvalStatus: "PENDING", rejectionReason: null } : {}),
      },
    });
    res.json({ profile: { ...updated, totalEarnings: Number(updated.totalEarnings) } });
  }),
);

// Earnings summary: today / this week / this month + recent trips.
driversRouter.get(
  "/earnings",
  asyncH(async (req, res) => {
    const driverId = req.user!.id;
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sumSince = async (since: Date) => {
      const agg = await prisma.order.aggregate({
        where: { driverId, status: "DELIVERED", deliveredAt: { gte: since } },
        _sum: { driverEarning: true },
        _count: true,
      });
      return { amount: Number(agg._sum.driverEarning ?? 0), trips: agg._count };
    };

    const [today, week, month, profile, recent] = await Promise.all([
      sumSince(startOfDay),
      sumSince(startOfWeek),
      sumSince(startOfMonth),
      prisma.driverProfile.findUnique({ where: { userId: driverId } }),
      prisma.order.findMany({
        where: { driverId, status: "DELIVERED" },
        orderBy: { deliveredAt: "desc" },
        take: 20,
        select: { id: true, code: true, deliveredAt: true, driverEarning: true, distanceKm: true, pickupAddress: true, dropoffAddress: true },
      }),
    ]);
    const wallet = await prisma.user.findUniqueOrThrow({
      where: { id: driverId },
      select: { walletBalance: true },
    });

    res.json({
      today, week, month,
      totalEarnings: Number(profile?.totalEarnings ?? 0),
      walletBalance: Number(wallet.walletBalance),
      recentTrips: recent.map((t) => ({ ...t, driverEarning: Number(t.driverEarning) })),
    });
  }),
);

// ── Withdrawals ───────────────────────────────────────────────

driversRouter.post(
  "/withdrawals",
  asyncH(async (req, res) => {
    const body = z
      .object({
        amount: z.number().positive(),
        method: z.enum(["BANKILY", "MASRIVI", "CASH"]).default("BANKILY"),
        accountNumber: z.string().min(4).max(30),
      })
      .parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (Number(user.walletBalance) < body.amount) {
      throw new HttpError(402, "Withdrawal exceeds wallet balance");
    }
    const pending = await prisma.withdrawalRequest.findFirst({
      where: { driverId: req.user!.id, status: "PENDING" },
    });
    if (pending) throw new HttpError(409, "You already have a pending withdrawal request");

    const wd = await prisma.withdrawalRequest.create({
      data: { driverId: req.user!.id, amount: body.amount, method: body.method, accountNumber: body.accountNumber },
    });
    res.status(201).json({ withdrawal: { ...wd, amount: Number(wd.amount) } });
  }),
);

driversRouter.get(
  "/withdrawals",
  asyncH(async (req, res) => {
    const list = await prisma.withdrawalRequest.findMany({
      where: { driverId: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ withdrawals: list.map((w) => ({ ...w, amount: Number(w.amount) })) });
  }),
);

// Ratings received by this driver.
driversRouter.get(
  "/ratings",
  asyncH(async (req, res) => {
    const ratings = await prisma.rating.findMany({
      where: { driverId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { customer: { select: { name: true } }, order: { select: { code: true } } },
    });
    res.json({ ratings });
  }),
);
