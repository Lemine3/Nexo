import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { InventoryConflictException } from '../src/inventory/inventory-conflict.exception';

/**
 * Proves the oversell-prevention claim in docs/srs/05-catalog-inventory-
 * warehouse.md §5.2.3: two concurrent reservations against the last unit of
 * stock must never both succeed. Runs against a real Postgres instance
 * (not mocked) because the guarantee comes from `SELECT ... FOR UPDATE`
 * row locking, which an in-memory mock cannot exercise meaningfully.
 */
describe('Inventory reservation concurrency (real Postgres)', () => {
  const prisma = new PrismaClient();
  const auditLogService = new AuditLogService(prisma as unknown as PrismaService);
  const inventoryService = new InventoryService(prisma as unknown as PrismaService, auditLogService);

  let tenantId: string;
  let storeId: string;
  let branchId: string;
  let productId: string;
  let variantId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Concurrency Test Tenant' } });
    tenantId = tenant.id;
    const store = await prisma.store.create({ data: { tenantId, name: 'CT Store', slug: `ct-store-${Date.now()}` } });
    storeId = store.id;
    const branch = await prisma.branch.create({ data: { storeId, name: 'CT Branch' } });
    branchId = branch.id;
    const product = await prisma.product.create({
      data: {
        tenantId,
        storeId,
        name: 'Concurrency Test Product',
        slug: `ct-product-${Date.now()}`,
        basePriceMinorUnits: 1000,
      },
    });
    productId = product.id;
    const variant = await prisma.productVariant.create({ data: { productId, sku: `CT-SKU-${Date.now()}` } });
    variantId = variant.id;

    // Exactly one unit in stock — the crux of the test.
    await prisma.inventory.create({ data: { productVariantId: variantId, branchId, quantityOnHand: 1 } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows exactly one of two concurrent reservations for the last unit to succeed', async () => {
    const attempt = () => prisma.$transaction((tx) => inventoryService.reserveStock(tx, variantId, branchId, 1));

    const results = await Promise.allSettled([attempt(), attempt()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InventoryConflictException);

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId_branchId: { productVariantId: variantId, branchId } },
    });
    expect(inventory.quantityReserved).toBe(1);
    expect(inventory.quantityOnHand - inventory.quantityReserved).toBe(0);
  });

  it('rejects a third reservation once stock is exhausted', async () => {
    await expect(
      prisma.$transaction((tx) => inventoryService.reserveStock(tx, variantId, branchId, 1)),
    ).rejects.toBeInstanceOf(InventoryConflictException);
  });
});
