import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ActorType, OrderStatus, Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateOrderDto } from './dto/create-order.dto';

/**
 * SIMPLIFICATION of docs/srs/06-orders-checkout-shipping-tax-payments.md:
 * flat placeholder shipping fee instead of the full zone/carrier rate
 * engine (§6.4), and tax computed from Product.taxRatePercent instead of
 * the full jurisdiction-based tax engine (§6.3). Both are drop-in
 * replaceable behind the same OrdersService API surface.
 */
const FLAT_SHIPPING_FEE_MINOR_UNITS = 500;

// docs/srs/06 §6.1 order lifecycle state machine (CANCELLED handled
// separately by cancelOrder(), which also releases inventory).
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED'],
  CONFIRMED: ['PROCESSING'],
  PROCESSING: ['PARTIALLY_SHIPPED', 'SHIPPED'],
  PARTIALLY_SHIPPED: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['COMPLETED', 'REFUNDED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Checkout saga (docs/srs/06 §6.2.1, docs/srs/01 §1.7): reservation and
   * order creation happen atomically in one DB transaction, so a stock
   * conflict never leaves a partially-created order behind. Idempotency-Key
   * is honored per docs/srs/12 §12.1.2 — a retried request with the same
   * key returns the original order rather than creating a duplicate.
   */
  async createOrder(
    tenantId: string,
    actorId: string | undefined,
    storeId: string,
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (existing) return existing.responseJson;
    }

    const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, storeId } });
    if (!branch) throw new NotFoundException('Branch not found for this store');

    const order = await this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let tax = 0;
      const orderItemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

      for (const item of dto.items) {
        const variant = await tx.productVariant.findFirst({
          where: { id: item.productVariantId, product: { storeId } },
          include: { product: true },
        });
        if (!variant) throw new NotFoundException(`Product variant ${item.productVariantId} not found in this store`);

        await this.inventoryService.reserveStock(tx, variant.id, dto.branchId, item.quantity);

        const unitPrice = variant.priceOverrideMinorUnits ?? variant.product.basePriceMinorUnits;
        const lineSubtotal = unitPrice * item.quantity;
        const lineTax = Math.round((lineSubtotal * Number(variant.product.taxRatePercent)) / 100);
        subtotal += lineSubtotal;
        tax += lineTax;

        orderItemsData.push({
          productVariantId: variant.id,
          skuSnapshot: variant.sku,
          nameSnapshot: variant.product.name,
          quantity: item.quantity,
          unitPriceMinorUnits: unitPrice,
          taxMinorUnits: lineTax,
          totalMinorUnits: lineSubtotal + lineTax,
        });
      }

      const shipping = subtotal > 0 ? FLAT_SHIPPING_FEE_MINOR_UNITS : 0;
      const total = subtotal + tax + shipping;

      const order = await tx.order.create({
        data: {
          tenantId,
          storeId,
          branchId: dto.branchId,
          customerId: dto.customerId,
          orderNumber: this.generateOrderNumber(),
          status: OrderStatus.CONFIRMED,
          subtotalMinorUnits: subtotal,
          taxMinorUnits: tax,
          shippingMinorUnits: shipping,
          totalMinorUnits: total,
          createdByStaffUserId: actorId,
          items: { createMany: { data: orderItemsData } },
          statusHistory: { create: { toStatus: OrderStatus.CONFIRMED, changedByStaffUserId: actorId, note: 'Order created' } },
        },
        include: { items: true },
      });

      if (idempotencyKey) {
        await tx.idempotencyKey.create({
          data: { key: idempotencyKey, tenantId, responseJson: order as unknown as Prisma.InputJsonValue },
        });
      }

      return order;
    });

    await this.auditLogService.record({
      tenantId,
      actorType: actorId ? ActorType.STAFF : ActorType.CUSTOMER,
      actorId,
      action: 'order.create',
      resourceType: 'order',
      resourceId: order.id,
      after: { orderNumber: order.orderNumber, totalMinorUnits: order.totalMinorUnits },
    });

    return order;
  }

  async getOrder(storeId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: { items: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async listOrders(storeId: string) {
    return this.prisma.order.findMany({ where: { storeId }, orderBy: { placedAt: 'desc' }, include: { items: true } });
  }

  /**
   * docs/srs/06 §6.1: cancellation releases the inventory reservation
   * atomically with the status change. Allowed from PENDING/CONFIRMED/
   * PROCESSING only — matches the state machine's cancellable states.
   */
  async cancelOrder(tenantId: string, actorId: string, storeId: string, orderId: string, note?: string) {
    const order = await this.getOrder(storeId, orderId);
    if (!['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status)) {
      throw new BadRequestException(`Cannot cancel an order in status ${order.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await this.inventoryService.releaseReservation(tx, item.productVariantId, order.branchId, item.quantity);
      }
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
      await tx.orderStatusHistory.create({
        data: { orderId, fromStatus: order.status, toStatus: OrderStatus.CANCELLED, changedByStaffUserId: actorId, note },
      });
    });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'order.cancel',
      resourceType: 'order',
      resourceId: orderId,
      before: { status: order.status },
      after: { status: 'CANCELLED', note },
    });

    return this.getOrder(storeId, orderId);
  }

  /**
   * Forward status transitions (docs/srs/06 §6.1). On the PROCESSING/
   * PARTIALLY_SHIPPED -> SHIPPED transition, the reservation is converted
   * into an actual stock decrement (docs/srs/05 §5.2.2 step 3).
   */
  async updateStatus(tenantId: string, actorId: string, storeId: string, orderId: string, toStatus: OrderStatus, note?: string) {
    const order = await this.getOrder(storeId, orderId);
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(`Cannot transition order from ${order.status} to ${toStatus}`);
    }

    await this.prisma.$transaction(async (tx) => {
      if (toStatus === OrderStatus.SHIPPED) {
        for (const item of order.items) {
          await tx.inventory.update({
            where: { productVariantId_branchId: { productVariantId: item.productVariantId, branchId: order.branchId } },
            data: {
              quantityOnHand: { decrement: item.quantity },
              quantityReserved: { decrement: item.quantity },
            },
          });
          await tx.stockMovement.create({
            data: {
              productVariantId: item.productVariantId,
              branchId: order.branchId,
              quantityDelta: -item.quantity,
              type: StockMovementType.SALE,
              referenceType: 'order',
              referenceId: orderId,
              performedByStaffUserId: actorId,
            },
          });
        }
      }

      await tx.order.update({ where: { id: orderId }, data: { status: toStatus } });
      await tx.orderStatusHistory.create({
        data: { orderId, fromStatus: order.status, toStatus, changedByStaffUserId: actorId, note },
      });
    });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'order.update_status',
      resourceType: 'order',
      resourceId: orderId,
      before: { status: order.status },
      after: { status: toStatus, note },
    });

    return this.getOrder(storeId, orderId);
  }

  private generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = randomBytes(3).toString('hex').toUpperCase();
    return `ORD-${timestamp}-${random}`;
  }
}
