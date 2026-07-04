import { PrismaClient, ScopeType, StockMovementType } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSION_CATALOG } from '../src/rbac/permission-catalog';
import { DEFAULT_ROLES } from '../src/rbac/default-roles';

const prisma = new PrismaClient();

const OWNER_EMAIL = 'owner@nexo.dev';
const OWNER_PASSWORD = 'OwnerPass123!';
const MANAGER_EMAIL = 'manager@nexo.dev';
const MANAGER_PASSWORD = 'ManagerPass123!';

async function ensurePermissionCatalog() {
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { resource_action: { resource: p.resource, action: p.action } },
      update: { description: p.description },
      create: p,
    });
  }
}

async function provisionSystemRoles(tenantId: string) {
  const roleIdByName = new Map<string, string>();

  for (const roleDef of DEFAULT_ROLES) {
    const role = await prisma.role.create({
      data: { tenantId, name: roleDef.name, rank: roleDef.rank, isSystem: true },
    });
    roleIdByName.set(roleDef.name, role.id);

    for (const grant of roleDef.grants) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { resource_action: { resource: grant.resource, action: grant.action } },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id, scopeType: grant.scope as ScopeType },
      });
    }
  }

  return roleIdByName;
}

async function main() {
  const existingOwner = await prisma.staffUser.findFirst({ where: { email: OWNER_EMAIL } });
  if (existingOwner) {
    // eslint-disable-next-line no-console
    console.log('Seed data already present (owner@nexo.dev exists) — skipping.');
    return;
  }

  await ensurePermissionCatalog();

  const tenant = await prisma.tenant.create({ data: { name: 'Nexo Demo Tenant' } });

  const ownerPasswordHash = await argon2.hash(OWNER_PASSWORD);
  const owner = await prisma.staffUser.create({
    data: {
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      passwordHash: ownerPasswordHash,
      isOwner: true,
      status: 'ACTIVE',
    },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { ownerStaffUserId: owner.id } });

  const roleIdByName = await provisionSystemRoles(tenant.id);

  const store = await prisma.store.create({
    data: {
      tenantId: tenant.id,
      name: 'Demo Store',
      slug: 'demo-store',
      defaultCountry: 'SA',
      defaultCurrency: 'SAR',
      defaultLanguage: 'ar',
      baseCurrency: 'SAR',
    },
  });

  const branch = await prisma.branch.create({
    data: {
      storeId: store.id,
      name: 'Main Warehouse',
      type: 'WAREHOUSE',
      countryCode: 'SA',
      city: 'Riyadh',
      timezone: 'Asia/Riyadh',
    },
  });

  const managerPasswordHash = await argon2.hash(MANAGER_PASSWORD);
  const manager = await prisma.staffUser.create({
    data: {
      tenantId: tenant.id,
      email: MANAGER_EMAIL,
      passwordHash: managerPasswordHash,
      status: 'ACTIVE',
    },
  });
  await prisma.staffUserRole.create({
    data: {
      staffUserId: manager.id,
      roleId: roleIdByName.get('Manager')!,
      storeId: store.id,
      branchId: branch.id,
    },
  });

  const brand = await prisma.brand.create({
    data: { tenantId: tenant.id, storeId: store.id, name: 'Acme', slug: 'acme' },
  });
  const category = await prisma.category.create({
    data: { tenantId: tenant.id, storeId: store.id, name: 'Electronics', slug: 'electronics' },
  });

  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      storeId: store.id,
      brandId: brand.id,
      type: 'SIMPLE',
      status: 'ACTIVE',
      name: 'Wireless Mouse',
      slug: 'wireless-mouse',
      description: 'A demo product seeded for local development and e2e tests.',
      basePriceMinorUnits: 2500,
      currency: 'SAR',
      taxRatePercent: 15,
      categories: { create: [{ categoryId: category.id }] },
    },
  });

  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: 'MOUSE-001' },
  });

  await prisma.inventory.create({
    data: { productVariantId: variant.id, branchId: branch.id, quantityOnHand: 100, reorderPoint: 10 },
  });
  await prisma.stockMovement.create({
    data: {
      productVariantId: variant.id,
      branchId: branch.id,
      quantityDelta: 100,
      type: StockMovementType.INITIAL,
      reason: 'Seed data initial stock',
    },
  });

  // eslint-disable-next-line no-console
  console.log(`
Seed complete.

Tenant:   ${tenant.id} (${tenant.name})
Store:    ${store.id} (${store.slug})
Branch:   ${branch.id} (${branch.name})
Product:  ${product.id} / variant ${variant.id} (SKU ${variant.sku})

Owner login:   ${OWNER_EMAIL} / ${OWNER_PASSWORD}
Manager login: ${MANAGER_EMAIL} / ${MANAGER_PASSWORD} (scoped to the branch above)
`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
