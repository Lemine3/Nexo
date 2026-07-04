import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { config } from "../config";
import type { OtpPurpose } from "@prisma/client";

// SMS delivery: plug the local SMS gateway (Mattel / Chinguitel / Mauritel)
// here. In dev mode the code is returned to the client for easy testing.
async function sendSms(phone: string, text: string) {
  console.log(`[sms → ${phone}] ${text}`);
}

export async function issueOtp(phone: string, purpose: OtpPurpose): Promise<string | undefined> {
  // Rate limit: max 3 OTPs per phone per 10 minutes.
  const rlKey = `otp:rl:${phone}`;
  const count = await redis.incr(rlKey);
  if (count === 1) await redis.expire(rlKey, 600);
  if (count > 3) throw Object.assign(new Error("Too many OTP requests, try later"), { status: 429 });

  const code = crypto.randomInt(100000, 999999).toString();
  await prisma.otpCode.create({
    data: {
      phone,
      code,
      purpose,
      expiresAt: new Date(Date.now() + config.otp.ttlMinutes * 60_000),
    },
  });
  await sendSms(phone, `Meshily code: ${code} — رمز التحقق الخاص بك في مشيلي`);
  return config.otp.devMode ? code : undefined;
}

export async function verifyOtp(phone: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.code !== code) return false;
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });
  return true;
}
