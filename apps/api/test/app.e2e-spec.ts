import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end coverage of the flow in docs/srs/15-user-flows-workflows.md
 * (simplified to the foundation's flat tax/shipping placeholders):
 * bootstrap tenant+Owner -> create store/branch -> create+publish a
 * product -> stock it -> place an order -> verify reservation -> cancel ->
 * verify release. Also proves RBAC denial for an under-privileged role.
 */
describe('Nexo API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = Date.now();
  const ownerEmail = `owner-${unique}@e2e.test`;
  const password = 'SuperSecretPass123!';

  let accessToken: string;
  let refreshToken: string;
  let storeId: string;
  let branchId: string;
  let productId: string;
  let variantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new tenant + Owner and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ tenantName: `E2E Tenant ${unique}`, email: ownerEmail, password })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('rejects requests with no token', async () => {
    await request(app.getHttpServer()).get('/admin/stores').expect(401);
  });

  it('creates a store as the Owner (GLOBAL store:create grant)', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/stores')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ name: 'E2E Store', slug: `e2e-store-${unique}` })
      .expect(201);
    storeId = res.body.id;
    expect(storeId).toBeDefined();
  });

  it('creates a branch under the store', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/branches`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ name: 'Main Branch', type: 'WAREHOUSE' })
      .expect(201);
    branchId = res.body.id;
  });

  it('creates and publishes a SIMPLE product with an implicit variant', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/products`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ name: 'E2E Product', slug: `e2e-product-${unique}`, basePriceMinorUnits: 1500, sku: `E2E-${unique}` })
      .expect(201);

    productId = createRes.body.id;
    variantId = createRes.body.variants[0].id;
    expect(createRes.body.status).toBe('DRAFT');

    const publishRes = await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/products/${productId}/publish`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(publishRes.body.status).toBe('ACTIVE');
  });

  it('refuses to publish a product with no variants', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/products`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ name: 'Empty', slug: `empty-${unique}`, basePriceMinorUnits: 100, type: 'VARIABLE' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/products/${res.body.id}/publish`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('stocks the branch via a manual adjustment with a reason code', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/branches/${branchId}/inventory/${variantId}/adjust`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ delta: 10, reason: 'Initial e2e stock' })
      .expect(201);
    expect(res.body.quantityOnHand).toBe(10);
  });

  it('rejects an adjustment with no reason', async () => {
    await request(app.getHttpServer())
      .post(`/admin/branches/${branchId}/inventory/${variantId}/adjust`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ delta: 1 })
      .expect(400);
  });

  let orderId: string;

  it('places an order, reserving inventory atomically', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/orders`)
      .set('authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `e2e-order-${unique}`)
      .send({ branchId, items: [{ productVariantId: variantId, quantity: 4 }] })
      .expect(201);

    orderId = res.body.id;
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.subtotalMinorUnits).toBe(1500 * 4);

    const inv = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId_branchId: { productVariantId: variantId, branchId } },
    });
    expect(inv.quantityReserved).toBe(4);
  });

  it('returns the same order on Idempotency-Key retry instead of creating a duplicate', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/orders`)
      .set('authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `e2e-order-${unique}`)
      .send({ branchId, items: [{ productVariantId: variantId, quantity: 4 }] })
      .expect(201);

    expect(res.body.id).toBe(orderId);

    const orders = await prisma.order.findMany({ where: { storeId } });
    expect(orders).toHaveLength(1);
  });

  it('rejects a second order that would oversell remaining stock', async () => {
    await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/orders`)
      .set('authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `e2e-order-oversell-${unique}`)
      .send({ branchId, items: [{ productVariantId: variantId, quantity: 100 }] })
      .expect(409);
  });

  it('cancels the order and releases the reservation', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/orders/${orderId}/cancel`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ note: 'e2e cancel' })
      .expect(201);
    expect(res.body.status).toBe('CANCELLED');

    const inv = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId_branchId: { productVariantId: variantId, branchId } },
    });
    expect(inv.quantityReserved).toBe(0);
    expect(inv.quantityOnHand).toBe(10);
  });

  it('refuses to cancel an already-cancelled order', async () => {
    await request(app.getHttpServer())
      .post(`/admin/stores/${storeId}/orders/${orderId}/cancel`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('rotates refresh tokens and rejects reuse of the old one', async () => {
    const res = await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(refreshToken);

    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('invites a staff user, assigns them a store-scoped role, and enforces the new scope', async () => {
    const inviteRes = await request(app.getHttpServer())
      .post('/admin/staff-users')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ email: `admin-${unique}@e2e.test` })
      .expect(201);

    const rolesRes = await request(app.getHttpServer())
      .get('/admin/roles')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    const adminRole = rolesRes.body.find((r: any) => r.name === 'Admin');

    await request(app.getHttpServer())
      .post(`/admin/staff-users/${inviteRes.body.id}/roles`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ roleId: adminRole.id, storeId })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `admin-${unique}@e2e.test`, password: inviteRes.body.temporaryPassword })
      .expect(201);
    const adminAccessToken = loginRes.body.accessToken;

    // Admin has product:view/create at STORE scope for *this* store...
    await request(app.getHttpServer())
      .get(`/admin/stores/${storeId}/products`)
      .set('authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    // ...but store:create is GLOBAL-only (Super Admin/Owner), so Admin is denied.
    await request(app.getHttpServer())
      .post('/admin/stores')
      .set('authorization', `Bearer ${adminAccessToken}`)
      .send({ name: 'Should Not Be Created', slug: `should-not-${unique}` })
      .expect(403);
  });

  it('exposes audit log entries for the sensitive actions performed above', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    const actions = res.body.map((entry: any) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining(['tenant.bootstrap', 'store.create', 'branch.create', 'product.create', 'order.create', 'order.cancel']),
    );
  });
});
