import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Controller('admin/branches/:branchId/inventory')
@UseGuards(PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermission('inventory', 'view')
  list(@Param('branchId') branchId: string) {
    return this.inventoryService.listForBranch(branchId);
  }

  @Post(':variantId/adjust')
  @RequirePermission('stock_adjustment', 'create')
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId') branchId: string,
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStock(user.tenantId, user.staffUserId, branchId, variantId, dto.delta, dto.reason);
  }
}
