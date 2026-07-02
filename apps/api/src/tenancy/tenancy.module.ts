import { Module } from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { TenancyController } from './tenancy.controller';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [AuditModule, RbacModule],
  providers: [TenancyService],
  controllers: [TenancyController],
  exports: [TenancyService],
})
export class TenancyModule {}
