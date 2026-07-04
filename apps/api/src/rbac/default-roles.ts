/**
 * System role templates seeded per tenant on creation (docs/srs/02 §2.3,
 * §2.5.5 abridged default permission matrix). `rank` is used purely for the
 * "cannot manage a peer or superior" enforcement (§2.2.2) — it is not itself
 * a substitute for the granular grants below.
 *
 * `scope` is the TIER at which the grant operates; the concrete store/branch
 * is supplied when the role is *assigned* to a staff user (StaffUserRole).
 */
export type ScopeTier = 'GLOBAL' | 'STORE' | 'BRANCH' | 'SELF';

export interface DefaultRoleGrant {
  resource: string;
  action: string;
  scope: ScopeTier;
}

export interface DefaultRoleDefinition {
  name: string;
  rank: number;
  grants: DefaultRoleGrant[];
}

export const DEFAULT_ROLES: DefaultRoleDefinition[] = [
  {
    name: 'Super Admin',
    rank: 1,
    grants: [
      { resource: 'store', action: 'view', scope: 'GLOBAL' },
      { resource: 'store', action: 'create', scope: 'GLOBAL' },
      { resource: 'store', action: 'update', scope: 'GLOBAL' },
      { resource: 'branch', action: 'view', scope: 'GLOBAL' },
      { resource: 'branch', action: 'create', scope: 'GLOBAL' },
      { resource: 'branch', action: 'update', scope: 'GLOBAL' },
      { resource: 'product', action: 'view', scope: 'GLOBAL' },
      { resource: 'product', action: 'create', scope: 'GLOBAL' },
      { resource: 'product', action: 'update', scope: 'GLOBAL' },
      { resource: 'product', action: 'delete', scope: 'GLOBAL' },
      { resource: 'category', action: 'view', scope: 'GLOBAL' },
      { resource: 'category', action: 'create', scope: 'GLOBAL' },
      { resource: 'category', action: 'update', scope: 'GLOBAL' },
      { resource: 'brand', action: 'view', scope: 'GLOBAL' },
      { resource: 'brand', action: 'create', scope: 'GLOBAL' },
      { resource: 'brand', action: 'update', scope: 'GLOBAL' },
      { resource: 'inventory', action: 'view', scope: 'GLOBAL' },
      { resource: 'stock_adjustment', action: 'create', scope: 'GLOBAL' },
      { resource: 'order', action: 'view', scope: 'GLOBAL' },
      { resource: 'order', action: 'create', scope: 'GLOBAL' },
      { resource: 'order', action: 'cancel', scope: 'GLOBAL' },
      { resource: 'order', action: 'update_status', scope: 'GLOBAL' },
      { resource: 'employee', action: 'view', scope: 'GLOBAL' },
      { resource: 'employee', action: 'create', scope: 'GLOBAL' },
      { resource: 'employee', action: 'update', scope: 'GLOBAL' },
      { resource: 'employee', action: 'delete', scope: 'GLOBAL' },
      { resource: 'role', action: 'view', scope: 'GLOBAL' },
      { resource: 'role', action: 'create', scope: 'GLOBAL' },
      { resource: 'role', action: 'update', scope: 'GLOBAL' },
      { resource: 'audit_log', action: 'view', scope: 'GLOBAL' },
    ],
  },
  {
    name: 'Admin',
    rank: 2,
    grants: [
      { resource: 'store', action: 'view', scope: 'STORE' },
      { resource: 'store', action: 'update', scope: 'STORE' },
      { resource: 'branch', action: 'view', scope: 'STORE' },
      { resource: 'branch', action: 'create', scope: 'STORE' },
      { resource: 'branch', action: 'update', scope: 'STORE' },
      { resource: 'product', action: 'view', scope: 'STORE' },
      { resource: 'product', action: 'create', scope: 'STORE' },
      { resource: 'product', action: 'update', scope: 'STORE' },
      { resource: 'product', action: 'delete', scope: 'STORE' },
      { resource: 'category', action: 'view', scope: 'STORE' },
      { resource: 'category', action: 'create', scope: 'STORE' },
      { resource: 'category', action: 'update', scope: 'STORE' },
      { resource: 'brand', action: 'view', scope: 'STORE' },
      { resource: 'brand', action: 'create', scope: 'STORE' },
      { resource: 'brand', action: 'update', scope: 'STORE' },
      { resource: 'inventory', action: 'view', scope: 'STORE' },
      { resource: 'stock_adjustment', action: 'create', scope: 'STORE' },
      { resource: 'order', action: 'view', scope: 'STORE' },
      { resource: 'order', action: 'create', scope: 'STORE' },
      { resource: 'order', action: 'cancel', scope: 'STORE' },
      { resource: 'order', action: 'update_status', scope: 'STORE' },
      { resource: 'employee', action: 'view', scope: 'STORE' },
      { resource: 'employee', action: 'create', scope: 'STORE' },
      { resource: 'employee', action: 'update', scope: 'STORE' },
      { resource: 'audit_log', action: 'view', scope: 'STORE' },
    ],
  },
  {
    name: 'Manager',
    rank: 3,
    grants: [
      { resource: 'product', action: 'view', scope: 'BRANCH' },
      { resource: 'inventory', action: 'view', scope: 'BRANCH' },
      { resource: 'stock_adjustment', action: 'create', scope: 'BRANCH' },
      { resource: 'order', action: 'view', scope: 'BRANCH' },
      { resource: 'order', action: 'update_status', scope: 'BRANCH' },
      { resource: 'order', action: 'cancel', scope: 'BRANCH' },
      { resource: 'employee', action: 'view', scope: 'BRANCH' },
    ],
  },
  {
    name: 'Finance',
    rank: 3,
    grants: [
      { resource: 'order', action: 'view', scope: 'STORE' },
      { resource: 'audit_log', action: 'view', scope: 'STORE' },
    ],
  },
  {
    name: 'Marketing',
    rank: 3,
    grants: [
      { resource: 'product', action: 'view', scope: 'STORE' },
      { resource: 'category', action: 'view', scope: 'STORE' },
      { resource: 'category', action: 'create', scope: 'STORE' },
      { resource: 'category', action: 'update', scope: 'STORE' },
      { resource: 'brand', action: 'view', scope: 'STORE' },
      { resource: 'brand', action: 'create', scope: 'STORE' },
      { resource: 'brand', action: 'update', scope: 'STORE' },
    ],
  },
  {
    name: 'Warehouse',
    rank: 4,
    grants: [
      { resource: 'product', action: 'view', scope: 'BRANCH' },
      { resource: 'inventory', action: 'view', scope: 'BRANCH' },
      { resource: 'stock_adjustment', action: 'create', scope: 'BRANCH' },
    ],
  },
  {
    name: 'Sales',
    rank: 4,
    grants: [
      { resource: 'product', action: 'view', scope: 'BRANCH' },
      { resource: 'order', action: 'view', scope: 'BRANCH' },
      { resource: 'order', action: 'create', scope: 'BRANCH' },
    ],
  },
  {
    name: 'Support',
    rank: 4,
    grants: [
      { resource: 'product', action: 'view', scope: 'GLOBAL' },
      { resource: 'order', action: 'view', scope: 'GLOBAL' },
    ],
  },
  {
    name: 'Delivery',
    rank: 5,
    grants: [
      { resource: 'order', action: 'view', scope: 'BRANCH' },
      { resource: 'order', action: 'update_status', scope: 'BRANCH' },
    ],
  },
];
