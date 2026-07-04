import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuditLogService } from './audit-log.service';

@Controller('admin/audit-logs')
@UseGuards(PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermission('audit_log', 'view')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.auditLogService.findForTenant(user.tenantId);
  }
}
