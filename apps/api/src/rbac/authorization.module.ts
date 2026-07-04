import { Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';

/**
 * Split out from RbacModule to avoid a circular dependency: AuditModule's
 * controller needs PermissionsGuard (which needs AuthorizationService), and
 * RbacModule itself depends on AuditModule for audit logging — so
 * AuthorizationService lives in its own leaf module both can import.
 */
@Module({
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
