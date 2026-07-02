/** Identity carried by a validated access token (docs/srs/13 §13.1.1). */
export interface AuthenticatedUser {
  staffUserId: string;
  tenantId: string;
}

/**
 * The narrowest applicable scope of the resource being acted upon, resolved
 * by the calling controller/service from the target entity — never trusted
 * from client-supplied claims (docs/srs/02 §2.5.3, docs/srs/13 §13.2).
 */
export interface ScopeContext {
  storeId?: string;
  branchId?: string;
  selfId?: string;
}
