import { Injectable } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogEntryInput {
  tenantId: string | null;
  actorType: ActorType;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Append-only audit trail (docs/srs/11-analytics-audit-monitoring.md §11.3).
 * Rows are never updated or deleted by application code — there is
 * deliberately no update()/delete() method on this service.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntryInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        beforeJson: entry.before as any,
        afterJson: entry.after as any,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  }

  async findForTenant(tenantId: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
