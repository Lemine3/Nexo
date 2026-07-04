import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { asyncH } from "../middleware/error";
import { requireAuth } from "../middleware/auth";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get(
  "/me",
  asyncH(async (req, res) => {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      include: { driverProfile: true },
    });
    res.json({
      user: {
        id: u.id, phone: u.phone, email: u.email, name: u.name, role: u.role,
        status: u.status, language: u.language, avatarUrl: u.avatarUrl,
        walletBalance: Number(u.walletBalance), twoFactorEnabled: u.twoFactorEnabled,
        driverProfile: u.driverProfile
          ? { ...u.driverProfile, totalEarnings: Number(u.driverProfile.totalEarnings) }
          : null,
      },
    });
  }),
);

usersRouter.put(
  "/me",
  asyncH(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).max(80).optional(),
        email: z.string().email().optional(),
        language: z.enum(["ar", "fr", "en"]).optional(),
        avatarUrl: z.string().url().optional(),
        password: z.string().min(6).max(100).optional(),
      })
      .parse(req.body);
    const { password, ...rest } = body;
    const u = await prisma.user.update({
      where: { id: req.user!.id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
    });
    res.json({ user: { id: u.id, name: u.name, email: u.email, language: u.language, avatarUrl: u.avatarUrl } });
  }),
);

// Device token registration for push notifications.
usersRouter.post(
  "/me/fcm-token",
  asyncH(async (req, res) => {
    const { token } = z.object({ token: z.string().min(10).max(500) }).parse(req.body);
    await prisma.user.update({ where: { id: req.user!.id }, data: { fcmToken: token } });
    res.json({ ok: true });
  }),
);

// In-app notification feed (personal + broadcasts for my role).
usersRouter.get(
  "/me/notifications",
  asyncH(async (req, res) => {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const audiences = ["ALL", me.role === "DRIVER" ? "DRIVERS" : "CUSTOMERS"];
    const notifications = await prisma.notification.findMany({
      where: { OR: [{ userId: me.id }, { userId: null, audience: { in: audiences } }] },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ notifications });
  }),
);
