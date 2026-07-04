import Redis from "ioredis";
import { config } from "../config";

// Redis is used for: live driver locations (GEO set), OTP rate limiting,
// and dispatch offer bookkeeping. The app degrades gracefully if Redis is
// briefly unavailable (lazyConnect + retries).
export const redis = new Redis(config.redisUrl, {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => {
  console.error("[redis] error:", err.message);
});

export const GEO_KEY_MOTO = "drivers:geo:MOTO";
export const GEO_KEY_TRUCK = "drivers:geo:TRUCK";

export const geoKeyFor = (vehicleType: "MOTO" | "TRUCK") =>
  vehicleType === "MOTO" ? GEO_KEY_MOTO : GEO_KEY_TRUCK;
