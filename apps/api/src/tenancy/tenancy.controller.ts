import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { TenancyService } from './tenancy.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { CreateBranchDto } from './dto/create-branch.dto';

@Controller('admin/stores')
@UseGuards(PermissionsGuard)
export class TenancyController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Get()
  // No @RequirePermission: this endpoint applies row-level RBAC filtering
  // itself (see TenancyService.listAccessibleStores), since "which stores
  // can I see" is a scope-resolving query rather than a single-resource check.
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tenancyService.listAccessibleStores(user.tenantId, user.staffUserId);
  }

  @Post()
  @RequirePermission('store', 'create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStoreDto) {
    return this.tenancyService.createStore(user.tenantId, user.staffUserId, dto);
  }

  @Get(':storeId')
  @RequirePermission('store', 'view')
  get(@CurrentUser() user: AuthenticatedUser, @Param('storeId') storeId: string) {
    return this.tenancyService.getStore(user.tenantId, storeId);
  }

  @Patch(':storeId')
  @RequirePermission('store', 'update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.tenancyService.updateStore(user.tenantId, user.staffUserId, storeId, dto);
  }

  @Post(':storeId/branches')
  @RequirePermission('branch', 'create')
  createBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storeId') storeId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.tenancyService.createBranch(user.tenantId, user.staffUserId, storeId, dto);
  }

  @Get(':storeId/branches')
  @RequirePermission('branch', 'view')
  listBranches(@CurrentUser() user: AuthenticatedUser, @Param('storeId') storeId: string) {
    return this.tenancyService.listBranches(user.tenantId, storeId);
  }
}
