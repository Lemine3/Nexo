import "dotenv/config";

const required = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${key}`);
  return v;
};

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgresql://meshily:meshily@localhost:5432/meshily"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET", "dev-access-secret-change-me"),
    refreshSecret: required("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me"),
    accessTtl: process.env.JWT_ACCESS_TTL ?? "30m",
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
  },
  otp: {
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 5),
    // In development OTP is returned in the API response; in production it is
    // sent via the configured SMS gateway (see services/sms.ts).
    devMode: (process.env.OTP_DEV_MODE ?? "true") === "true",
  },
  dispatch: {
    searchRadiusKm: Number(process.env.DISPATCH_RADIUS_KM ?? 7),
    maxDriversNotified: Number(process.env.DISPATCH_MAX_DRIVERS ?? 8),
    acceptTimeoutSec: Number(process.env.DISPATCH_ACCEPT_TIMEOUT_SEC ?? 25),
  },
  firebase: {
    // Path to a Firebase service-account JSON file. If unset, push
    // notifications are logged instead of sent (safe for local dev).
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  },
  payments: {
    bankily: {
      apiUrl: process.env.BANKILY_API_URL,
      merchantId: process.env.BANKILY_MERCHANT_ID,
      apiKey: process.env.BANKILY_API_KEY,
    },
    masrivi: {
      apiUrl: process.env.MASRIVI_API_URL,
      merchantId: process.env.MASRIVI_MERCHANT_ID,
      apiKey: process.env.MASRIVI_API_KEY,
    },
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),
};
