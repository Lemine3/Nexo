import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeContext } from '../common/interfaces/authenticated-user.interface';
import { PermissionEffect, ScopeType } from '@prisma/client';

/**
 * Implements the authorization algorithm from docs/srs/02-users-rbac.md §2.5.3:
 *
 *   1. Owner (isOwner=true) bypasses all checks (§2.2.2).
 *   2. Union of grants from all role *assignments* (StaffUserRole), each of
 *      which carries the concrete store/branch it was granted at.
 *   3. A grant applies if the role's permission scope tier (GLOBAL/STORE/
 *      BRANCH/SELF) is satisfied by the assignment's concrete scope
 *      containing the request's target scope.
 *   4. user_permission_overrides are applied last; an explicit DENY always
 *      wins over any GRANT, at any level; unexpired GRANT overrides can
 *      allow something no role otherwise grants.
 *   5. Rank rule (§2.2.2/§2.3): a principal can never manage a staff user
 *      whose best (lowest-numbered) role rank is <= their own, except Owner.
 */
@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async can(staffUserId: string, resource: string, action: string, context: ScopeContext = {}): Promise<boolean> {
    const staffUser = await this.prisma.staffUser.findUnique({
      where: { id: staffUserId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        overrides: { include: { permission: true } },
      },
    });

    if (!staffUser) return false;
    if (staffUser.isOwner) return true;

    let allowed = false;

    for (const assignment of staffUser.roles) {
      for (const rolePermission of assignment.role.permissions) {
        if (
          rolePermission.permission.resource === resource &&
          rolePermission.permission.action === action &&
          this.assignmentSatisfiesContext(rolePermission.scopeType, assignment, context, staffUserId)
        ) {
          allowed = true;
        }
      }
    }

    const now = new Date();
    for (const override of staffUser.overrides) {
      if (override.permission.resource !== resource || override.permission.action !== action) continue;
      if (override.expiresAt && override.expiresAt < now) continue;
      if (!this.overrideMatchesContext(override.scopeType, override.scopeId, context, staffUserId)) continue;

      if (override.effect === PermissionEffect.DENY) {
        return false; // explicit deny always wins
      }
      if (override.effect === PermissionEffect.GRANT) {
        allowed = true;
      }
    }

    return allowed;
  }

  async assert(staffUserId: string, resource: string, action: string, context: ScopeContext = {}): Promise<void> {
    const allowed = await this.can(staffUserId, resource, action, context);
    if (!allowed) {
      throw new ForbiddenException(`Missing permission ${resource}:${action}`);
    }
  }

  /** Lower number = higher privilege. */
  private async getBestRank(staffUserId: string): Promise<number | null> {
    const roles = await this.prisma.staffUserRole.findMany({
      where: { staffUserId },
      include: { role: true },
    });
    if (roles.length === 0) return null;
    return Math.min(...roles.map((r) => r.role.rank));
  }

  /**
   * Can `actorId` manage (assign roles to / suspend / delete) `targetId`?
   * Enforces docs/srs/02 §2.2.2: no role may act upon a peer or superior
   * rank; only the Owner is exempt.
   */
  async canManageStaffUser(actorId: string, targetId: string): Promise<boolean> {
    if (actorId === targetId) return false;

    const actor = await this.prisma.staffUser.findUnique({ where: { id: actorId } });
    if (!actor) return false;
    if (actor.isOwner) return true;

    const target = await this.prisma.staffUser.findUnique({ where: { id: targetId } });
    if (!target) return false;
    if (target.isOwner) return false; // nobody but the Owner can act on the Owner

    const actorRank = await this.getBestRank(actorId);
    const targetRank = await this.getBestRank(targetId);

    if (actorRank === null) return false;
    if (targetRank === null) return true; // target has no roles yet

    return actorRank < targetRank;
  }

  private assignmentSatisfiesContext(
    scopeType: ScopeType,
    assignment: { storeId: string | null; branchId: string | null },
    context: ScopeContext,
    staffUserId: string,
  ): boolean {
    switch (scopeType) {
      case ScopeType.GLOBAL:
        return true;
      case ScopeType.STORE:
        return !!assignment.storeId && assignment.storeId === context.storeId;
      case ScopeType.BRANCH:
        return !!assignment.branchId && assignment.branchId === context.branchId;
      case ScopeType.SELF:
        return !!context.selfId && context.selfId === staffUserId;
      default:
        return false;
    }
  }

  private overrideMatchesContext(
    scopeType: ScopeType,
    scopeId: string | null,
    context: ScopeContext,
    staffUserId: string,
  ): boolean {
    switch (scopeType) {
      case ScopeType.GLOBAL:
        return true;
      case ScopeType.STORE:
        return !!scopeId && scopeId === context.storeId;
      case ScopeType.BRANCH:
        return !!scopeId && scopeId === context.branchId;
      case ScopeType.SELF:
        return !!context.selfId && context.selfId === staffUserId;
      default:
        return false;
    }
  }
}
