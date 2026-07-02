/**
 * Global, tenant-independent catalog of (resource, action) pairs — seeded
 * once. Full target catalog: docs/srs/02-users-rbac.md §2.5.5.
 * This is the subset actually enforced by the foundation implementation.
 */
export const PERMISSION_CATALOG: Array<{ resource: string; action: string; description: string }> = [
  { resource: 'store', action: 'view', description: 'View store settings' },
  { resource: 'store', action: 'create', description: 'Create a store' },
  { resource: 'store', action: 'update', description: 'Update store settings' },
  { resource: 'branch', action: 'view', description: 'View branches' },
  { resource: 'branch', action: 'create', description: 'Create a branch' },
  { resource: 'branch', action: 'update', description: 'Update a branch' },

  { resource: 'product', action: 'view', description: 'View products' },
  { resource: 'product', action: 'create', description: 'Create products' },
  { resource: 'product', action: 'update', description: 'Update products' },
  { resource: 'product', action: 'delete', description: 'Delete/archive products' },

  { resource: 'category', action: 'view', description: 'View categories' },
  { resource: 'category', action: 'create', description: 'Create categories' },
  { resource: 'category', action: 'update', description: 'Update categories' },

  { resource: 'brand', action: 'view', description: 'View brands' },
  { resource: 'brand', action: 'create', description: 'Create brands' },
  { resource: 'brand', action: 'update', description: 'Update brands' },

  { resource: 'inventory', action: 'view', description: 'View stock levels' },
  { resource: 'stock_adjustment', action: 'create', description: 'Manually adjust stock with a reason code' },

  { resource: 'order', action: 'view', description: 'View orders' },
  { resource: 'order', action: 'create', description: 'Create orders (checkout / manual)' },
  { resource: 'order', action: 'cancel', description: 'Cancel an order' },
  { resource: 'order', action: 'update_status', description: 'Transition order status' },

  { resource: 'employee', action: 'view', description: 'View staff users' },
  { resource: 'employee', action: 'create', description: 'Invite/create staff users' },
  { resource: 'employee', action: 'update', description: 'Update staff users, assign roles' },
  { resource: 'employee', action: 'delete', description: 'Suspend/delete staff users' },

  { resource: 'role', action: 'view', description: 'View roles' },
  { resource: 'role', action: 'create', description: 'Create custom roles' },
  { resource: 'role', action: 'update', description: 'Edit role permissions' },

  { resource: 'audit_log', action: 'view', description: 'View audit trail' },
];
