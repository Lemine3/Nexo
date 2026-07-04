import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../../rbac/authorization.service';
import { PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';
import { AuthenticatedUser, ScopeContext } from '../interfaces/authenticated-user.interface';

/**
 * Resolves the target scope from route params/body (storeId/branchId) and
 * delegates to AuthorizationService — the same engine used everywhere else,
 * so there is exactly one place authorization decisions are made
 * (docs/srs/02 §2.5.3, docs/srs/13 §13.2 "defense in depth" principle).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // no @RequirePermission declared => guard is a no-op

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('Not authenticated');

    const scopeContext: ScopeContext = {
      storeId: request.params?.storeId ?? request.body?.storeId,
      branchId: request.params?.branchId ?? request.body?.branchId,
    };

    const allowed = await this.authorizationService.can(
      user.staffUserId,
      required.resource,
      required.action,
      scopeContext,
    );
    if (!allowed) {
      throw new ForbiddenException(`Missing permission ${required.resource}:${required.action}`);
    }
    return true;
  }
}
