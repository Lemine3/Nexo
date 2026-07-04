import { Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, ScopeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { CreateBranchDto } from './dto/create-branch.dto';

@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createStore(tenantId: string, actorId: string, dto: CreateStoreDto) {
    const store = await this.prisma.store.create({
      data: {
        tenantId,
        name: dto.name,
        slug: dto.slug,
        defaultCountry: dto.defaultCountry,
        defaultCurrency: dto.defaultCurrency ?? 'USD',
        defaultLanguage: dto.defaultLanguage ?? 'en',
        baseCurrency: dto.baseCurrency ?? dto.defaultCurrency ?? 'USD',
      },
    });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'store.create',
      resourceType: 'store',
      resourceId: store.id,
      after: store,
    });

    return store;
  }

  /**
   * Row-level RBAC filtering (docs/srs/02 §2.5.3): a GLOBAL-scoped role sees
   * every store in the tenant; a STORE-scoped role sees only the stores it
   * was explicitly assigned to. Distinct from single-resource endpoints
   * where the target scope is already known from the route param.
   */
  async listAccessibleStores(tenantId: string, staffUserId: string) {
    const staffUser = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: staffUserId },
      include: { roles: true },
    });
    if (staffUser.isOwner) {
      return this.prisma.store.findMany({ where: { tenantId } });
    }

    const hasGlobalRole = await this.prisma.staffUserRole.findFirst({
      where: {
        staffUserId,
        storeId: null,
        role: { permissions: { some: { scopeType: ScopeType.GLOBAL, permission: { resource: 'store', action: 'view' } } } },
      },
    });
    if (hasGlobalRole) {
      return this.prisma.store.findMany({ where: { tenantId } });
    }

    const storeIds = staffUser.roles.map((r) => r.storeId).filter((id): id is string => !!id);
    if (storeIds.length === 0) return [];
    return this.prisma.store.findMany({ where: { tenantId, id: { in: storeIds } } });
  }

  async getStore(tenantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async updateStore(tenantId: string, actorId: string, storeId: string, dto: UpdateStoreDto) {
    await this.getStore(tenantId, storeId);
    const store = await this.prisma.store.update({ where: { id: storeId }, data: dto });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'store.update',
      resourceType: 'store',
      resourceId: storeId,
      after: dto,
    });

    return store;
  }

  async createBranch(tenantId: string, actorId: string, storeId: string, dto: CreateBranchDto) {
    await this.getStore(tenantId, storeId);
    const branch = await this.prisma.branch.create({
      data: {
        storeId,
        name: dto.name,
        type: dto.type ?? 'RETAIL',
        countryCode: dto.countryCode,
        city: dto.city,
        timezone: dto.timezone ?? 'UTC',
      },
    });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'branch.create',
      resourceType: 'branch',
      resourceId: branch.id,
      after: branch,
    });

    return branch;
  }

  async listBranches(tenantId: string, storeId: string) {
    await this.getStore(tenantId, storeId);
    return this.prisma.branch.findMany({ where: { storeId } });
  }
}
