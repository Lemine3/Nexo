import { prisma } from "../lib/prisma";
import type { Prisma } from "@prisma/client";

// Every administrative action is recorded so the owner can always answer
// "who did what, and when" (سجل كامل لكل العمليات).
export async function audit(
  actorId: string | null,
  action: string,
  entity?: string,
  entityId?: string,
  meta?: Prisma.InputJsonValue,
  ip?: string,
) {
  try {
    await prisma.auditLog.create({
      data: { actorId, action, entity, entityId, meta, ip },
    });
  } catch (err) {
    console.error("[audit] failed to write log:", err);
  }
}
