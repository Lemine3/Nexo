import { ScopeType, PermissionEffect } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Unit tests for the algorithm in docs/srs/02-users-rbac.md §2.5.3, using a
 * hand-rolled Prisma mock so the decision logic is verified in isolation
 * from the database (concurrency/locking behavior is covered separately by
 * test/inventory-concurrency.e2e-spec.ts against a real Postgres instance).
 */
describe('AuthorizationService', () => {
  function buildService(staffUserRecord: any, staffUserRoleRows: any[] = []) {
    const prismaMock = {
      staffUser: {
        findUnique: jest.fn().mockResolvedValue(staffUserRecord),
      },
      staffUserRole: {
        findMany: jest.fn().mockResolvedValue(staffUserRoleRows),
      },
    };
    return new AuthorizationService(prismaMock as unknown as PrismaService);
  }

  function permission(resource: string, action: string) {
    return { id: `${resource}:${action}`, resource, action, description: null };
  }

  it('grants everything to the Owner regardless of role grants', async () => {
    const service = buildService({ id: 'u1', isOwner: true, roles: [], overrides: [] });
    await expect(service.can('u1', 'product', 'delete', {})).resolves.toBe(true);
  });

  it('denies when the staff user does not exist', async () => {
    const service = buildService(null);
    await expect(service.can('missing', 'product', 'view', {})).resolves.toBe(false);
  });

  it('a GLOBAL-scoped grant allows access regardless of context', async () => {
    const service = buildService({
      id: 'u1',
      isOwner: false,
      overrides: [],
      roles: [
        {
          storeId: null,
          branchId: null,
          role: { permissions: [{ scopeType: ScopeType.GLOBAL, permission: permission('product', 'view') }] },
        },
      ],
    });
    await expect(service.can('u1', 'product', 'view', {})).resolves.toBe(true);
    await expect(service.can('u1', 'product', 'view', { storeId: 'anything' })).resolves.toBe(true);
  });

  it('a STORE-scoped grant only applies to the assigned store', async () => {
    const service = buildService({
      id: 'u1',
      isOwner: false,
      overrides: [],
      roles: [
        {
          storeId: 'store-1',
          branchId: null,
          role: { permissions: [{ scopeType: ScopeType.STORE, permission: permission('product', 'create') }] },
        },
      ],
    });
    await expect(service.can('u1', 'product', 'create', { storeId: 'store-1' })).resolves.toBe(true);
    await expect(service.can('u1', 'product', 'create', { storeId: 'store-2' })).resolves.toBe(false);
    await expect(service.can('u1', 'product', 'create', {})).resolves.toBe(false);
  });

  it('a BRANCH-scoped grant only applies to the assigned branch', async () => {
    const service = buildService({
      id: 'u1',
      isOwner: false,
      overrides: [],
      roles: [
        {
          storeId: 'store-1',
          branchId: 'branch-1',
          role: { permissions: [{ scopeType: ScopeType.BRANCH, permission: permission('inventory', 'view') }] },
        },
      ],
    });
    await expect(service.can('u1', 'inventory', 'view', { branchId: 'branch-1' })).resolves.toBe(true);
    await expect(service.can('u1', 'inventory', 'view', { branchId: 'branch-2' })).resolves.toBe(false);
  });

  it('an explicit DENY override wins even over a matching GLOBAL grant', async () => {
    const service = buildService({
      id: 'u1',
      isOwner: false,
      roles: [
        {
          storeId: null,
          branchId: null,
          role: { permissions: [{ scopeType: ScopeType.GLOBAL, permission: permission('order', 'cancel') }] },
        },
      ],
      overrides: [
        {
          effect: PermissionEffect.DENY,
          scopeType: ScopeType.GLOBAL,
          scopeId: null,
          expiresAt: null,
          permission: permission('order', 'cancel'),
        },
      ],
    });
    await expect(service.can('u1', 'order', 'cancel', {})).resolves.toBe(false);
  });

  it('an expired DENY override no longer applies', async () => {
    const service = buildService({
      id: 'u1',
      isOwner: false,
      roles: [
        {
          storeId: null,
          branchId: null,
          role: { permissions: [{ scopeType: ScopeType.GLOBAL, permission: permission('order', 'cancel') }] },
        },
      ],
      overrides: [
        {
          effect: PermissionEffect.DENY,
          scopeType: ScopeType.GLOBAL,
          scopeId: null,
          expiresAt: new Date(Date.now() - 60_000),
          permission: permission('order', 'cancel'),
        },
      ],
    });
    await expect(service.can('u1', 'order', 'cancel', {})).resolves.toBe(true);
  });

  it('a GRANT override can allow something no role otherwise grants', async () => {
    const service = buildService({
      id: 'u1',
      isOwner: false,
      roles: [],
      overrides: [
        {
          effect: PermissionEffect.GRANT,
          scopeType: ScopeType.GLOBAL,
          scopeId: null,
          expiresAt: null,
          permission: permission('refund', 'issue'),
        },
      ],
    });
    await expect(service.can('u1', 'refund', 'issue', {})).resolves.toBe(true);
  });

  describe('canManageStaffUser (rank rule, docs/srs/02 §2.2.2)', () => {
    it('lets a lower-ranked-number actor manage a higher-ranked-number target', async () => {
      const service = buildService(null); // unused for this method's own calls below
      const prisma: any = (service as any).prisma;
      prisma.staffUser.findUnique
        .mockResolvedValueOnce({ id: 'actor', isOwner: false })
        .mockResolvedValueOnce({ id: 'target', isOwner: false });
      prisma.staffUserRole.findMany
        .mockResolvedValueOnce([{ role: { rank: 2 } }]) // actor: Admin (rank 2)
        .mockResolvedValueOnce([{ role: { rank: 3 } }]); // target: Manager (rank 3)

      await expect(service.canManageStaffUser('actor', 'target')).resolves.toBe(true);
    });

    it('blocks managing a peer or superior rank', async () => {
      const service = buildService(null);
      const prisma: any = (service as any).prisma;
      prisma.staffUser.findUnique
        .mockResolvedValueOnce({ id: 'actor', isOwner: false })
        .mockResolvedValueOnce({ id: 'target', isOwner: false });
      prisma.staffUserRole.findMany
        .mockResolvedValueOnce([{ role: { rank: 3 } }]) // actor: Manager
        .mockResolvedValueOnce([{ role: { rank: 1 } }]); // target: Super Admin

      await expect(service.canManageStaffUser('actor', 'target')).resolves.toBe(false);
    });

    it('only the Owner may manage the Owner', async () => {
      const service = buildService(null);
      const prisma: any = (service as any).prisma;
      prisma.staffUser.findUnique
        .mockResolvedValueOnce({ id: 'actor', isOwner: false })
        .mockResolvedValueOnce({ id: 'target', isOwner: true });

      await expect(service.canManageStaffUser('actor', 'target')).resolves.toBe(false);
    });

    it('the Owner may manage anyone', async () => {
      const service = buildService(null);
      const prisma: any = (service as any).prisma;
      prisma.staffUser.findUnique.mockResolvedValueOnce({ id: 'actor', isOwner: true });

      await expect(service.canManageStaffUser('actor', 'target')).resolves.toBe(true);
    });
  });
});
