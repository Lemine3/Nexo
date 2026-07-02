import { ConflictException } from '@nestjs/common';

/**
 * Thrown when a reservation would oversell available stock
 * (docs/srs/05-catalog-inventory-warehouse.md §5.2.3).
 */
export class InventoryConflictException extends ConflictException {
  constructor(productVariantId: string, branchId: string) {
    super({
      error: 'INVENTORY_CONFLICT',
      message: `Insufficient available stock for variant ${productVariantId} at branch ${branchId}`,
    });
  }
}
