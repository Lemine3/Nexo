import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

export interface RequiredPermission {
  resource: string;
  action: string;
}

/**
 * Declares the (resource, action) an endpoint requires. Scope is resolved at
 * request time by PermissionsGuard from route params/body (storeId/branchId),
 * matching the "narrowest applicable scope" rule in docs/srs/02 §2.5.3.
 */
export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action } as RequiredPermission);
