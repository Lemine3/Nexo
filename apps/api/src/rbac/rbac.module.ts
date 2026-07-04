import { Module } from '@nestjs/common';
import { AuthorizationModule } from './authorization.module';
import { RbacProvisioningService } from './rbac-provisioning.service';
import { StaffUsersService } from './staff-users.service';
import { StaffUsersController } from './staff-users.controller';
import { RolesController } from './roles.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthorizationModule, AuditModule],
  providers: [RbacProvisioningService, StaffUsersService],
  controllers: [StaffUsersController, RolesController],
  exports: [AuthorizationModule, RbacProvisioningService],
})
export class RbacModule {}
