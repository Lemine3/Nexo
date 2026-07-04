import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH, HttpError } from "../middleware/error";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth";
import { audit } from "../services/audit";
import { pushToUser, pushBroadcast } from "../services/fcm";
import { creditWallet } from "../services/payments";
import { Prisma } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const num = (v: unknown) => Number(v);

// ── Dashboard stats ───────────────────────────────────────────

adminRouter.get(
  "/stats",
  asyncH(async (_req, res) => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const [customers, drivers, pendingDrivers, ordersToday, ordersMonth, activeOrders, revenueMonth, pendingWithdrawals] =
      await Promise.all([
        prisma.user.count({ where: { role: "CUSTOMER" } }),
        prisma.user.count({ where: { role: "DRIVER" } }),
        prisma.driverProfile.count({ where: { approvalStatus: "PENDING" } }),
        prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
        prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
        prisma.order.count({ where: { status: { in: ["PENDING", "ACCEPTED", "ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT"] } } }),
        prisma.order.aggregate({
          where: { status: "DELIVERED", deliveredAt: { gte: startOfMonth } },
          _sum: { price: true, commission: true },
        }),
        prisma.withdrawalRequest.count({ where: { status: "PENDING" } }),
      ]);

    // Busiest pickup areas this month (top zones by order count).
    const topAreas = await prisma.$queryRaw<{ address: string; count: bigint }[]>`
      SELECT "pickupAddress" AS address, COUNT(*)::bigint AS count
      FROM "Order" WHERE "createdAt" >= ${startOfMonth}
      GROUP BY "pickupAddress" ORDER BY count DESC LIMIT 8
    `;

    res.json({
      customers, drivers, pendingDrivers, ordersToday, ordersMonth, activeOrders,
      revenueMonth: num(revenueMonth._sum.price ?? 0),
      commissionMonth: num(revenueMonth._sum.commission ?? 0),
      pendingWithdrawals,
      topAreas: topAreas.map((a) => ({ address: a.address, count: Number(a.count) })),
    });
  }),
);

// ── Driver management ─────────────────────────────────────────

adminRouter.get(
  "/drivers",
  asyncH(async (req, res) => {
    const approval = typeof req.query.approval === "string" ? req.query.approval : undefined;
    const drivers = await prisma.driverProfile.findMany({
      where: approval ? { approvalStatus: approval as never } : {},
      include: { user: { select: { id: true, name: true, phone: true, email: true, status: true, createdAt: true, walletBalance: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({
      drivers: drivers.map((d) => ({
        ...d,
        totalEarnings: num(d.totalEarnings),
        user: { ...d.user, walletBalance: num(d.user.walletBalance) },
      })),
    });
  }),
);

adminRouter.post(
  "/drivers/:userId/approve",
  asyncH(async (req, res) => {
    const profile = await prisma.driverProfile.update({
      where: { userId: req.params.userId },
      data: { approvalStatus: "APPROVED", rejectionReason: null },
    });
    await prisma.user.update({ where: { id: req.params.userId }, data: { status: "ACTIVE" } });
    await audit(req.user!.id, "DRIVER_APPROVED", "DriverProfile", req.params.userId, undefined, req.ip);
    void pushToUser(req.params.userId, "تمت الموافقة على حسابك ✅", "مرحبًا بك في مشيلي! يمكنك الآن تفعيل حالة \"متاح\" واستقبال الطلبات.", { type: "driver_approved" });
    res.json({ profile: { ...profile, totalEarnings: num(profile.totalEarnings) } });
  }),
);

adminRouter.post(
  "/drivers/:userId/reject",
  asyncH(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(2).max(300) }).parse(req.body);
    const profile = await prisma.driverProfile.update({
      where: { userId: req.params.userId },
      data: { approvalStatus: "REJECTED", rejectionReason: reason, online: false },
    });
    await audit(req.user!.id, "DRIVER_REJECTED", "DriverProfile", req.params.userId, { reason }, req.ip);
    void pushToUser(req.params.userId, "لم تتم الموافقة على حسابك", `السبب: ${reason}. يمكنك تحديث وثائقك وإعادة المحاولة.`, { type: "driver_rejected" });
    res.json({ profile: { ...profile, totalEarnings: num(profile.totalEarnings) } });
  }),
);

adminRouter.post(
  "/drivers/:userId/disable",
  asyncH(async (req, res) => {
    await prisma.driverProfile.update({ where: { userId: req.params.userId }, data: { online: false } });
    await prisma.user.update({ where: { id: req.params.userId }, data: { status: "BLOCKED" } });
    await audit(req.user!.id, "DRIVER_DISABLED", "User", req.params.userId, undefined, req.ip);
    res.json({ ok: true });
  }),
);

// ── Customer management ───────────────────────────────────────

adminRouter.get(
  "/customers",
  asyncH(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const customers = await prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
      },
      select: {
        id: true, name: true, phone: true, email: true, status: true, createdAt: true,
        walletBalance: true, _count: { select: { customerOrders: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ customers: customers.map((c) => ({ ...c, walletBalance: num(c.walletBalance) })) });
  }),
);

adminRouter.post(
  "/users/:id/block",
  asyncH(async (req, res) => {
    const { blocked } = z.object({ blocked: z.boolean() }).parse(req.body);
    const target = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
    if (target.role === "SUPER_ADMIN") throw new HttpError(403, "Cannot block a super admin");
    await prisma.user.update({
      where: { id: req.params.id },
      data: { status: blocked ? "BLOCKED" : "ACTIVE" },
    });
    await audit(req.user!.id, blocked ? "USER_BLOCKED" : "USER_UNBLOCKED", "User", req.params.id, undefined, req.ip);
    res.json({ ok: true });
  }),
);

// ── Orders & live operations map ──────────────────────────────

adminRouter.get(
  "/orders",
  asyncH(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const take = Math.min(100, Number(req.query.limit ?? 30));
    const where: Prisma.OrderWhereInput = {};
    if (typeof req.query.status === "string" && req.query.status) where.status = req.query.status as OrderStatus;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true } },
          driver: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.order.count({ where }),
    ]);
    res.json({
      orders: orders.map((o) => ({ ...o, price: num(o.price), commission: num(o.commission), driverEarning: num(o.driverEarning) })),
      total, page,
    });
  }),
);

// Snapshot for the Live Operations Map: all online drivers + active orders.
adminRouter.get(
  "/live",
  asyncH(async (_req, res) => {
    const [drivers, orders] = await Promise.all([
      prisma.driverProfile.findMany({
        where: { online: true, approvalStatus: "APPROVED", lastLat: { not: null } },
        include: { user: { select: { name: true, phone: true } } },
      }),
      prisma.order.findMany({
        where: { status: { in: ["PENDING", "ACCEPTED", "ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT"] } },
        include: {
          customer: { select: { name: true, phone: true } },
          driver: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({
      drivers: drivers.map((d) => ({
        driverId: d.userId, name: d.user.name, phone: d.user.phone,
        vehicleType: d.vehicleType, lat: d.lastLat, lng: d.lastLng,
        lastLocationAt: d.lastLocationAt, rating: d.ratingAvg,
      })),
      orders: orders.map((o) => ({ ...o, price: num(o.price), commission: num(o.commission), driverEarning: num(o.driverEarning) })),
    });
  }),
);

// ── Tariffs ───────────────────────────────────────────────────

adminRouter.get(
  "/tariffs",
  asyncH(async (_req, res) => {
    const tariffs = await prisma.tariff.findMany({ orderBy: [{ vehicleType: "asc" }, { createdAt: "desc" }] });
    res.json({
      tariffs: tariffs.map((t) => ({
        ...t, baseFare: num(t.baseFare), perKm: num(t.perKm), perMin: num(t.perMin), minFare: num(t.minFare),
      })),
    });
  }),
);

const tariffSchema = z.object({
  vehicleType: z.enum(["MOTO", "TRUCK"]),
  name: z.string().min(2).max(80),
  baseFare: z.number().nonnegative(),
  perKm: z.number().nonnegative(),
  perMin: z.number().nonnegative().default(0),
  minFare: z.number().nonnegative(),
  commissionPct: z.number().min(0).max(50).default(15),
  active: z.boolean().default(true),
});

adminRouter.post(
  "/tariffs",
  asyncH(async (req, res) => {
    const body = tariffSchema.parse(req.body);
    const tariff = await prisma.tariff.create({ data: body });
    await audit(req.user!.id, "TARIFF_CREATED", "Tariff", tariff.id, body, req.ip);
    res.status(201).json({ tariff });
  }),
);

adminRouter.put(
  "/tariffs/:id",
  asyncH(async (req, res) => {
    const body = tariffSchema.partial().parse(req.body);
    const tariff = await prisma.tariff.update({ where: { id: req.params.id }, data: body });
    await audit(req.user!.id, "TARIFF_UPDATED", "Tariff", tariff.id, body, req.ip);
    res.json({ tariff });
  }),
);

// ── Withdrawal requests ───────────────────────────────────────

adminRouter.get(
  "/withdrawals",
  asyncH(async (req, res) => {
    const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: status ? { status: status as never } : {},
      include: { driver: { select: { name: true, phone: true, walletBalance: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({
      withdrawals: withdrawals.map((w) => ({
        ...w, amount: num(w.amount),
        driver: { ...w.driver, walletBalance: num(w.driver.walletBalance) },
      })),
    });
  }),
);

adminRouter.post(
  "/withdrawals/:id/decide",
  asyncH(async (req, res) => {
    const { decision, note } = z
      .object({ decision: z.enum(["APPROVED", "REJECTED", "PAID"]), note: z.string().max(300).optional() })
      .parse(req.body);
    const wd = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (wd.status === "PAID" || wd.status === "REJECTED") throw new HttpError(409, "Request already finalised");

    // Funds leave the driver wallet only when the payout is marked PAID.
    if (decision === "PAID") {
      const driver = await prisma.user.findUniqueOrThrow({ where: { id: wd.driverId } });
      if (Number(driver.walletBalance) < Number(wd.amount)) {
        throw new HttpError(409, "Driver balance is below the requested amount");
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: wd.driverId },
          data: { walletBalance: { decrement: wd.amount } },
        }),
        prisma.walletTransaction.create({
          data: { userId: wd.driverId, type: "WITHDRAWAL", amount: -Number(wd.amount), reference: wd.id, note },
        }),
      ]);
    }

    const updated = await prisma.withdrawalRequest.update({
      where: { id: wd.id },
      data: { status: decision, processedById: req.user!.id, processedAt: new Date(), note },
    });
    await audit(req.user!.id, `WITHDRAWAL_${decision}`, "WithdrawalRequest", wd.id, { amount: Number(wd.amount) }, req.ip);
    const msg =
      decision === "PAID" ? "تم تحويل أرباحك بنجاح 💰" :
      decision === "APPROVED" ? "تمت الموافقة على طلب السحب وسيُحوَّل قريبًا" :
      `رُفض طلب السحب${note ? `: ${note}` : ""}`;
    void pushToUser(wd.driverId, "طلب سحب الأرباح", msg, { type: "withdrawal", id: wd.id });
    res.json({ withdrawal: { ...updated, amount: num(updated.amount) } });
  }),
);

// ── Notifications & promos ────────────────────────────────────

adminRouter.post(
  "/notifications/broadcast",
  asyncH(async (req, res) => {
    const body = z
      .object({
        audience: z.enum(["ALL", "CUSTOMERS", "DRIVERS"]),
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(500),
        isPromo: z.boolean().default(false),
      })
      .parse(req.body);
    await pushBroadcast(body.audience, body.title, body.body, body.isPromo);
    await audit(req.user!.id, "BROADCAST_SENT", "Notification", undefined, body, req.ip);
    res.status(201).json({ ok: true });
  }),
);

// ── Wallet adjustment (support/compensation) ──────────────────

adminRouter.post(
  "/users/:id/wallet-adjust",
  requireRole("SUPER_ADMIN"),
  asyncH(async (req, res) => {
    const { amount, note } = z
      .object({ amount: z.number(), note: z.string().min(2).max(300) })
      .parse(req.body);
    await creditWallet(req.params.id, amount, "ADJUSTMENT", undefined, note);
    await audit(req.user!.id, "WALLET_ADJUSTED", "User", req.params.id, { amount, note }, req.ip);
    res.json({ ok: true });
  }),
);

// ── Audit log ─────────────────────────────────────────────────

adminRouter.get(
  "/audit-log",
  asyncH(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const take = Math.min(100, Number(req.query.limit ?? 50));
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { actor: { select: { name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.auditLog.count(),
    ]);
    res.json({ logs, total, page });
  }),
);

// ── Admin account management (super admin only) ───────────────

adminRouter.post(
  "/admins",
  requireRole("SUPER_ADMIN"),
  asyncH(async (req, res) => {
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    const user = await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN", status: "ACTIVE" } });
    await audit(req.user!.id, "ADMIN_GRANTED", "User", userId, undefined, req.ip);
    res.json({ user: { id: user.id, name: user.name, role: user.role } });
  }),
);
