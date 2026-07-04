import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { StaffUsersService } from './staff-users.service';

@Controller('admin/roles')
@UseGuards(PermissionsGuard)
export class RolesController {
  constructor(private readonly staffUsersService: StaffUsersService) {}

  @Get()
  @RequirePermission('role', 'view')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.staffUsersService.listRoles(user.tenantId);
  }
}
