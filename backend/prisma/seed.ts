// Seed: tariffs, Nouakchott neighborhoods, app settings, and the first
// SUPER ADMIN account.
//
// ⚠️ Security: the super-admin credentials are NEVER hardcoded. They are read
// from environment variables (SUPER_ADMIN_PHONE / SUPER_ADMIN_EMAIL /
// SUPER_ADMIN_PASSWORD) that the project owner sets privately on the server.
// The login form is the same standard form for everyone — the dashboard
// unlocks based on the `role` column, and 2FA can be enabled from the panel.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const NOUAKCHOTT_NEIGHBORHOODS: [string, string, number, number][] = [
  // [nameAr, nameFr, lat, lng]
  ["تفرغ زينة", "Tevragh Zeina", 18.0973, -15.9758],
  ["لكصر", "Ksar", 18.0989, -15.9530],
  ["السبخة", "Sebkha", 18.0755, -15.9724],
  ["عرفات", "Arafat", 18.0503, -15.9390],
  ["توجنين", "Toujounine", 18.1023, -15.8905],
  ["الميناء", "El Mina", 18.0469, -15.9758],
  ["دار النعيم", "Dar Naim", 18.1356, -15.9243],
  ["تيارت", "Teyarett", 18.1265, -15.9481],
  ["الرياض", "Riyadh", 18.0339, -15.9109],
  ["عين الطلح", "Ain Talh", 18.1450, -15.8960],
  ["سوكوجيم", "Socogim", 18.1080, -15.9640],
  ["المطار القديم", "Ancien Aéroport", 18.0960, -15.9470],
  ["كرفور مدريد", "Carrefour Madrid", 18.0868, -15.9330],
  ["ملتقى البمبي", "Carrefour Bamby", 18.0660, -15.9410],
  ["سوق العاصمة", "Marché Capitale", 18.0885, -15.9605],
  ["المستشفى الوطني", "Hôpital National", 18.0935, -15.9560],
  ["جامعة نواكشوط", "Université de Nouakchott", 18.0790, -15.9130],
  ["حي الشفاء (عرفات)", "El Chifa (Arafat)", 18.0430, -15.9500],
  ["بوحديدة", "Bouhdida", 18.1180, -15.8790],
  ["الترحيل", "Tarhil", 18.0250, -15.9020],
];

async function main() {
  // ── Tariffs (MRU) ─────────────────────────────────────────
  const motoTariff = await prisma.tariff.findFirst({ where: { vehicleType: "MOTO" } });
  if (!motoTariff) {
    await prisma.tariff.create({
      data: {
        vehicleType: "MOTO",
        name: "Nouakchott — Moto",
        baseFare: 50,
        perKm: 20,
        perMin: 0,
        minFare: 100,
        commissionPct: 15,
      },
    });
  }
  const truckTariff = await prisma.tariff.findFirst({ where: { vehicleType: "TRUCK" } });
  if (!truckTariff) {
    await prisma.tariff.create({
      data: {
        vehicleType: "TRUCK",
        name: "Nouakchott — Camion",
        baseFare: 300,
        perKm: 60,
        perMin: 0,
        minFare: 500,
        commissionPct: 15,
      },
    });
  }

  // ── Neighborhoods ─────────────────────────────────────────
  const count = await prisma.neighborhood.count();
  if (count === 0) {
    await prisma.neighborhood.createMany({
      data: NOUAKCHOTT_NEIGHBORHOODS.map(([nameAr, nameFr, lat, lng]) => ({
        city: "Nouakchott",
        nameAr,
        nameFr,
        lat,
        lng,
      })),
    });
  }

  // ── App settings ──────────────────────────────────────────
  for (const [key, value] of [
    ["dispatch.radiusKm", "7"],
    ["dispatch.acceptTimeoutSec", "25"],
    ["support.phone", "+22200000000"],
  ]) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // ── Super admin (from env — never hardcoded) ──────────────
  const phone = process.env.SUPER_ADMIN_PHONE;
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (phone && password) {
    const existing = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
    if (!existing) {
      await prisma.user.create({
        data: {
          phone,
          email,
          name: process.env.SUPER_ADMIN_NAME ?? "Meshily Admin",
          passwordHash: await bcrypt.hash(password, 12),
          role: "SUPER_ADMIN",
          status: "ACTIVE",
        },
      });
      console.log(`Super admin created for ${phone}. Enable 2FA from the dashboard on first login.`);
    } else {
      console.log("Super admin already exists — skipping.");
    }
  } else {
    console.log("SUPER_ADMIN_PHONE / SUPER_ADMIN_PASSWORD not set — no super admin created.");
  }

  console.log("Seed complete ✔");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
