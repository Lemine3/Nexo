import { BadRequestException, Injectable } from '@nestjs/common';
import { ActorType, Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryConflictException } from './inventory-conflict.exception';

type Tx = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listForBranch(branchId: string) {
    return this.prisma.inventory.findMany({
      where: { branchId },
      include: { productVariant: { include: { product: true } } },
    });
  }

  /**
   * Manual stock adjustment — always requires a reason code, never a bare
   * quantity edit (docs/srs/05 §5.2.3). Writes an immutable ledger entry.
   */
  async adjustStock(tenantId: string, actorId: string, branchId: string, productVariantId: string, delta: number, reason: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const inventory = await this.lockInventoryRow(tx, productVariantId, branchId);
      const newQuantity = (inventory?.quantityOnHand ?? 0) + delta;
      if (newQuantity < 0) {
        throw new BadRequestException('Adjustment would result in negative stock on hand');
      }

      const updated = await tx.inventory.upsert({
        where: { productVariantId_branchId: { productVariantId, branchId } },
        update: { quantityOnHand: { increment: delta } },
        create: { productVariantId, branchId, quantityOnHand: delta },
      });

      await tx.stockMovement.create({
        data: {
          productVariantId,
          branchId,
          quantityDelta: delta,
          type: StockMovementType.ADJUSTMENT,
          reason,
          performedByStaffUserId: actorId,
        },
      });

      return updated;
    });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'inventory.adjust',
      resourceType: 'inventory',
      resourceId: `${productVariantId}:${branchId}`,
      after: { delta, reason },
    });

    return result;
  }

  /**
   * Row-locked reservation (docs/srs/05 §5.2.2/§5.2.3): must run inside the
   * same transaction as order creation. Uses SELECT ... FOR UPDATE so two
   * concurrent checkouts for the last unit cannot both succeed.
   */
  async reserveStock(tx: Tx, productVariantId: string, branchId: string, quantity: number): Promise<void> {
    const inventory = await this.lockInventoryRow(tx, productVariantId, branchId);
    const availableToSell = (inventory?.quantityOnHand ?? 0) - (inventory?.quantityReserved ?? 0);

    if (availableToSell < quantity) {
      throw new InventoryConflictException(productVariantId, branchId);
    }

    await tx.inventory.update({
      where: { productVariantId_branchId: { productVariantId, branchId } },
      data: { quantityReserved: { increment: quantity } },
    });
  }

  /** Releases a reservation on order cancellation (docs/srs/05 §5.2.2 step 4). */
  async releaseReservation(tx: Tx, productVariantId: string, branchId: string, quantity: number): Promise<void> {
    await this.lockInventoryRow(tx, productVariantId, branchId);
    await tx.inventory.update({
      where: { productVariantId_branchId: { productVariantId, branchId } },
      data: { quantityReserved: { decrement: quantity } },
    });
    await tx.stockMovement.create({
      data: {
        productVariantId,
        branchId,
        quantityDelta: 0,
        type: StockMovementType.RELEASE,
        reason: 'Order cancelled — reservation released',
      },
    });
  }

  private async lockInventoryRow(tx: Tx, productVariantId: string, branchId: string) {
    const rows = await tx.$queryRaw<
      Array<{ productVariantId: string; branchId: string; quantityOnHand: number; quantityReserved: number }>
    >(Prisma.sql`
      SELECT "productVariantId", "branchId", "quantityOnHand", "quantityReserved"
      FROM "inventory"
      WHERE "productVariantId" = ${productVariantId} AND "branchId" = ${branchId}
      FOR UPDATE
    `);
    return rows[0];
  }
}
