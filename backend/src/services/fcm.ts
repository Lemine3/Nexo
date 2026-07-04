import { config } from "../config";
import { prisma } from "../lib/prisma";

let messaging: import("firebase-admin/messaging").Messaging | null = null;

async function getMessaging() {
  if (messaging) return messaging;
  if (!config.firebase.serviceAccountPath) return null;
  const admin = await import("firebase-admin/app");
  const { getMessaging: gm } = await import("firebase-admin/messaging");
  const { readFileSync } = await import("fs");
  const creds = JSON.parse(readFileSync(config.firebase.serviceAccountPath, "utf8"));
  const app = admin.getApps().length
    ? admin.getApps()[0]
    : admin.initializeApp({ credential: admin.cert(creds) });
  messaging = gm(app);
  return messaging;
}

// Sends a push notification and stores it in the in-app notification feed.
// Without Firebase credentials the push is logged only — the in-app feed and
// socket events still work, so local development needs no Firebase project.
export async function pushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  await prisma.notification.create({
    data: { userId, audience: "USER", title, body },
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
  if (!user?.fcmToken) return;
  const m = await getMessaging();
  if (!m) {
    console.log(`[fcm:dev → ${userId}] ${title}: ${body}`);
    return;
  }
  try {
    await m.send({ token: user.fcmToken, notification: { title, body }, data });
  } catch (err) {
    console.error("[fcm] send failed:", err);
  }
}

export async function pushBroadcast(
  audience: "ALL" | "CUSTOMERS" | "DRIVERS",
  title: string,
  body: string,
  isPromo = false,
) {
  await prisma.notification.create({ data: { audience, title, body, isPromo } });
  const roleFilter =
    audience === "CUSTOMERS" ? { role: "CUSTOMER" as const } :
    audience === "DRIVERS" ? { role: "DRIVER" as const } : {};
  const users = await prisma.user.findMany({
    where: { ...roleFilter, fcmToken: { not: null }, status: "ACTIVE" },
    select: { fcmToken: true },
  });
  const m = await getMessaging();
  if (!m) {
    console.log(`[fcm:dev broadcast ${audience}] ${title} (${users.length} recipients)`);
    return;
  }
  const tokens = users.map((u) => u.fcmToken!).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 500) {
    await m.sendEachForMulticast({
      tokens: tokens.slice(i, i + 500),
      notification: { title, body },
    }).catch((err) => console.error("[fcm] multicast failed:", err));
  }
}
