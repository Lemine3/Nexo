import { prisma } from "../lib/prisma";
import { estimateDurationMin, estimateRouteKm } from "./geo";

export interface Quote {
  vehicleType: "MOTO" | "TRUCK";
  distanceKm: number;
  durationMin: number;
  price: number; // MRU
  commission: number;
  driverEarning: number;
  tariffId: string;
}

// Round to the nearest 10 MRU — cash-friendly amounts for the local market.
const roundMru = (v: number) => Math.max(0, Math.round(v / 10) * 10);

export async function quoteOrder(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  vehicleType: "MOTO" | "TRUCK",
): Promise<Quote> {
  const tariff = await prisma.tariff.findFirst({
    where: { vehicleType, active: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!tariff) throw Object.assign(new Error("No active tariff for vehicle type"), { status: 409 });

  const distanceKm = estimateRouteKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const durationMin = estimateDurationMin(distanceKm, vehicleType);

  const raw =
    Number(tariff.baseFare) +
    Number(tariff.perKm) * distanceKm +
    Number(tariff.perMin) * durationMin;
  const price = roundMru(Math.max(raw, Number(tariff.minFare)));
  const commission = roundMru((price * tariff.commissionPct) / 100);

  return {
    vehicleType,
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMin: Math.round(durationMin),
    price,
    commission,
    driverEarning: price - commission,
    tariffId: tariff.id,
  };
}
