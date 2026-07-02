import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Controller('admin/stores/:storeId/orders')
@UseGuards(PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermission('order', 'create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ordersService.createOrder(user.tenantId, user.staffUserId, storeId, dto, idempotencyKey);
  }

  @Get()
  @RequirePermission('order', 'view')
  list(@Param('storeId') storeId: string) {
    return this.ordersService.listOrders(storeId);
  }

  @Get(':orderId')
  @RequirePermission('order', 'view')
  get(@Param('storeId') storeId: string, @Param('orderId') orderId: string) {
    return this.ordersService.getOrder(storeId, orderId);
  }

  @Post(':orderId/cancel')
  @RequirePermission('order', 'cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Body('note') note?: string,
  ) {
    return this.ordersService.cancelOrder(user.tenantId, user.staffUserId, storeId, orderId, note);
  }

  @Post(':orderId/status')
  @RequirePermission('order', 'update_status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(user.tenantId, user.staffUserId, storeId, orderId, dto.status, dto.note);
  }
}
