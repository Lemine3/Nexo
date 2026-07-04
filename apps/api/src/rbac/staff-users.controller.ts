import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { StaffUsersService } from './staff-users.service';
import { InviteStaffUserDto } from './dto/invite-staff-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@Controller('admin/staff-users')
@UseGuards(PermissionsGuard)
export class StaffUsersController {
  constructor(private readonly staffUsersService: StaffUsersService) {}

  @Get()
  @RequirePermission('employee', 'view')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.staffUsersService.list(user.tenantId);
  }

  @Post()
  @RequirePermission('employee', 'create')
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteStaffUserDto) {
    return this.staffUsersService.invite(user.tenantId, dto.email, user.staffUserId);
  }

  @Post(':id/roles')
  @RequirePermission('employee', 'update')
  assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') targetId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.staffUsersService.assignRole(user.tenantId, user.staffUserId, targetId, dto);
  }
}
