import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from './authorization.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AssignRoleDto } from './dto/assign-role.dto';

@Injectable()
export class StaffUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(tenantId: string) {
    return this.prisma.staffUser.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        isOwner: true,
        status: true,
        createdAt: true,
        roles: { include: { role: true } },
      },
    });
  }

  /**
   * MVP simplification of docs/srs/15-user-flows-workflows.md §15.5: returns
   * a temporary password directly instead of dispatching an email invite
   * link (email delivery is Chapter 10 scope, not yet implemented), and
   * activates the account immediately rather than modeling a separate
   * "accept invite" step — the Admin/Super Admin is expected to relay the
   * temporary password to the employee out of band.
   */
  async invite(tenantId: string, email: string, invitedByStaffUserId: string) {
    const existing = await this.prisma.staffUser.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });
    if (existing) throw new ConflictException('A staff user with this email already exists in this tenant');

    const temporaryPassword = randomBytes(9).toString('base64url');
    const passwordHash = await argon2.hash(temporaryPassword);

    const staffUser = await this.prisma.staffUser.create({
      data: { tenantId, email, passwordHash, status: 'ACTIVE' },
    });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId: invitedByStaffUserId,
      action: 'employee.invite',
      resourceType: 'staff_user',
      resourceId: staffUser.id,
      after: { email },
    });

    return { id: staffUser.id, email: staffUser.email, temporaryPassword };
  }

  async assignRole(tenantId: string, actorId: string, targetStaffUserId: string, dto: AssignRoleDto) {
    const target = await this.prisma.staffUser.findFirst({ where: { id: targetStaffUserId, tenantId } });
    if (!target) throw new NotFoundException('Staff user not found');

    const canManage = await this.authorizationService.canManageStaffUser(actorId, targetStaffUserId);
    if (!canManage) {
      throw new ForbiddenException(
        'Cannot manage a staff user whose role is equal to or higher-ranked than your own',
      );
    }

    const role = await this.prisma.role.findFirst({ where: { id: dto.roleId, tenantId } });
    if (!role) throw new NotFoundException('Role not found');

    const assignment = await this.prisma.staffUserRole.create({
      data: {
        staffUserId: targetStaffUserId,
        roleId: dto.roleId,
        storeId: dto.storeId,
        branchId: dto.branchId,
      },
    });

    await this.auditLogService.record({
      tenantId,
      actorType: ActorType.STAFF,
      actorId,
      action: 'employee.assign_role',
      resourceType: 'staff_user',
      resourceId: targetStaffUserId,
      after: { roleId: dto.roleId, roleName: role.name, storeId: dto.storeId, branchId: dto.branchId },
    });

    return assignment;
  }

  async listRoles(tenantId: string) {
    return this.prisma.role.findMany({ where: { tenantId }, orderBy: { rank: 'asc' } });
  }
}
