import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authenticator } from "otplib";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { asyncH, HttpError } from "../middleware/error";
import { requireAuth, requireAdmin, signAccessToken } from "../middleware/auth";
import { issueOtp, verifyOtp } from "../utils/otp";
import { audit } from "../services/audit";
import type { Role, User } from "@prisma/client";

export const authRouter = Router();

const phoneSchema = z.string().regex(/^\+?[0-9]{8,15}$/, "Invalid phone number");

async function issueTokens(user: Pick<User, "id" | "role">) {
  const accessToken = signAccessToken({ id: user.id, role: user.role });
  const refreshToken = crypto.randomBytes(48).toString("hex");
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 86_400_000),
    },
  });
  return { accessToken, refreshToken };
}

function publicUser(u: User) {
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    language: u.language,
    avatarUrl: u.avatarUrl,
    walletBalance: Number(u.walletBalance),
    twoFactorEnabled: u.twoFactorEnabled,
  };
}

// ── Registration ──────────────────────────────────────────────

authRouter.post(
  "/register/request-otp",
  asyncH(async (req, res) => {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing && existing.status !== "PENDING") {
      throw new HttpError(409, "Phone already registered");
    }
    const devCode = await issueOtp(phone, "REGISTER");
    res.json({ sent: true, ...(devCode ? { devCode } : {}) });
  }),
);

const driverFieldsSchema = z.object({
  vehicleType: z.enum(["MOTO", "TRUCK"]),
  plateNumber: z.string().min(2).max(20),
  licenseImageUrl: z.string().url().optional(),
  idCardImageUrl: z.string().url().optional(),
  vehicleImageUrl: z.string().url().optional(),
});

authRouter.post(
  "/register/verify",
  asyncH(async (req, res) => {
    const body = z
      .object({
        phone: phoneSchema,
        code: z.string().length(6),
        name: z.string().min(2).max(80),
        password: z.string().min(6).max(100),
        email: z.string().email().optional(),
        language: z.enum(["ar", "fr", "en"]).default("ar"),
        role: z.enum(["CUSTOMER", "DRIVER"]).default("CUSTOMER"),
        driver: driverFieldsSchema.optional(),
      })
      .parse(req.body);

    const ok = await verifyOtp(body.phone, body.code, "REGISTER");
    if (!ok) throw new HttpError(400, "Invalid or expired OTP code");
    if (body.role === "DRIVER" && !body.driver) {
      throw new HttpError(400, "Driver registration requires vehicle details");
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    // Customers are active immediately after OTP; drivers stay PENDING until
    // an admin reviews their documents (per the driver onboarding flow).
    const status = body.role === "CUSTOMER" ? "ACTIVE" : "PENDING";

    const user = await prisma.user.upsert({
      where: { phone: body.phone },
      update: { name: body.name, passwordHash, email: body.email, role: body.role, status, language: body.language },
      create: {
        phone: body.phone,
        name: body.name,
        passwordHash,
        email: body.email,
        role: body.role,
        status,
        language: body.language,
      },
    });

    if (body.role === "DRIVER" && body.driver) {
      await prisma.driverProfile.upsert({
        where: { userId: user.id },
        update: { ...body.driver },
        create: { userId: user.id, ...body.driver },
      });
    }

    const tokens = await issueTokens(user);
    res.status(201).json({ user: publicUser(user), ...tokens });
  }),
);

// ── Login ─────────────────────────────────────────────────────

// Standard login form. The SAME endpoint serves customers, drivers and
// admins: what unlocks the admin dashboard is the `role` stored in the
// database (never a hardcoded email/password in the source code). Admins
// with 2FA enabled must additionally supply a TOTP code.
authRouter.post(
  "/login",
  asyncH(async (req, res) => {
    const body = z
      .object({
        identifier: z.string().min(3), // phone or email
        password: z.string().min(1),
        totp: z.string().optional(),
      })
      .parse(req.body);

    const user = await prisma.user.findFirst({
      where: { OR: [{ phone: body.identifier }, { email: body.identifier }] },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid credentials");
    }
    if (user.status === "BLOCKED") throw new HttpError(403, "Account blocked");

    if (user.twoFactorEnabled) {
      if (!body.totp) return res.status(200).json({ requiresTotp: true });
      if (!user.twoFactorSecret || !authenticator.verify({ token: body.totp, secret: user.twoFactorSecret })) {
        throw new HttpError(401, "Invalid 2FA code");
      }
    }

    const tokens = await issueTokens(user);
    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
      await audit(user.id, "ADMIN_LOGIN", "User", user.id, undefined, req.ip);
    }
    res.json({ user: publicUser(user), ...tokens });
  }),
);

authRouter.post(
  "/login/otp/request",
  asyncH(async (req, res) => {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) throw new HttpError(404, "No account with this phone");
    if (user.status === "BLOCKED") throw new HttpError(403, "Account blocked");
    const devCode = await issueOtp(phone, "LOGIN");
    res.json({ sent: true, ...(devCode ? { devCode } : {}) });
  }),
);

authRouter.post(
  "/login/otp/verify",
  asyncH(async (req, res) => {
    const { phone, code } = z.object({ phone: phoneSchema, code: z.string().length(6) }).parse(req.body);
    const ok = await verifyOtp(phone, code, "LOGIN");
    if (!ok) throw new HttpError(400, "Invalid or expired OTP code");
    const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
    const tokens = await issueTokens(user);
    res.json({ user: publicUser(user), ...tokens });
  }),
);

// Google Sign-In: the app sends the Google ID token; we verify it against
// Google's tokeninfo endpoint and link/create the account by email.
authRouter.post(
  "/google",
  asyncH(async (req, res) => {
    const { idToken } = z.object({ idToken: z.string().min(10) }).parse(req.body);
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!resp.ok) throw new HttpError(401, "Invalid Google token");
    const info = (await resp.json()) as { email?: string; name?: string; picture?: string; email_verified?: string };
    if (!info.email || info.email_verified !== "true") throw new HttpError(401, "Google email not verified");

    let user = await prisma.user.findUnique({ where: { email: info.email } });
    if (!user) {
      // Google accounts have no phone yet; a placeholder keeps the unique
      // constraint satisfied until the user adds their phone in the profile.
      user = await prisma.user.create({
        data: {
          email: info.email,
          phone: `g:${crypto.randomBytes(6).toString("hex")}`,
          name: info.name ?? info.email.split("@")[0],
          avatarUrl: info.picture,
          role: "CUSTOMER",
          status: "ACTIVE",
        },
      });
    }
    if (user.status === "BLOCKED") throw new HttpError(403, "Account blocked");
    const tokens = await issueTokens(user);
    res.json({ user: publicUser(user), ...tokens });
  }),
);

// ── Tokens ────────────────────────────────────────────────────

authRouter.post(
  "/refresh",
  asyncH(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new HttpError(401, "Invalid refresh token");
    }
    // Rotate: revoke the old token, issue a new pair.
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
    const tokens = await issueTokens(stored.user);
    res.json({ user: publicUser(stored.user), ...tokens });
  }),
);

authRouter.post(
  "/logout",
  asyncH(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    await prisma.refreshToken.updateMany({ where: { token: refreshToken }, data: { revoked: true } });
    res.json({ ok: true });
  }),
);

// ── 2FA for admin accounts ────────────────────────────────────

authRouter.post(
  "/2fa/setup",
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: req.user!.id }, data: { twoFactorSecret: secret } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const otpauth = authenticator.keyuri(user.email ?? user.phone, "Meshily Admin", secret);
    res.json({ secret, otpauth });
  }),
);

authRouter.post(
  "/2fa/enable",
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!user.twoFactorSecret || !authenticator.verify({ token: code, secret: user.twoFactorSecret })) {
      throw new HttpError(400, "Invalid 2FA code");
    }
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await audit(user.id, "ADMIN_2FA_ENABLED", "User", user.id);
    res.json({ ok: true });
  }),
);
