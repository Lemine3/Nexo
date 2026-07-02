import { Injectable } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSION_CATALOG } from './permission-catalog';
import { DEFAULT_ROLES } from './default-roles';

/** Idempotently seeds the global permission catalog and per-tenant system roles. */
@Injectable()
export class RbacProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async ensurePermissionCatalog(): Promise<void> {
    for (const p of PERMISSION_CATALOG) {
      await this.prisma.permission.upsert({
        where: { resource_action: { resource: p.resource, action: p.action } },
        update: { description: p.description },
        create: p,
      });
    }
  }

  async provisionSystemRolesForTenant(tenantId: string): Promise<void> {
    await this.ensurePermissionCatalog();

    for (const roleDef of DEFAULT_ROLES) {
      const existing = await this.prisma.role.findFirst({
        where: { tenantId, name: roleDef.name, isSystem: true },
      });
      const role =
        existing ??
        (await this.prisma.role.create({
          data: { tenantId, name: roleDef.name, rank: roleDef.rank, isSystem: true },
        }));

      for (const grant of roleDef.grants) {
        const permission = await this.prisma.permission.findUniqueOrThrow({
          where: { resource_action: { resource: grant.resource, action: grant.action } },
        });
        await this.prisma.rolePermission.upsert({
          where: {
            roleId_permissionId_scopeType: {
              roleId: role.id,
              permissionId: permission.id,
              scopeType: grant.scope as ScopeType,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id,
            scopeType: grant.scope as ScopeType,
          },
        });
      }
    }
  }
}
