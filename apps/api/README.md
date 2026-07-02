# Nexo API — Foundation Implementation

This is the **first working slice** of the Nexo platform described in
[`/docs/srs`](../../docs/srs/00-index.md): Phase 0 (multi-tenant identity +
granular RBAC) and part of Phase 1 (catalog, inventory, orders/checkout)
from the [implementation roadmap](../../docs/srs/16-implementation-roadmap.md).

It is **not** the full enterprise spec — see [Known Simplifications](#known-simplifications-vs-the-full-srs)
below for exactly what's deliberately out of scope for this slice, and the
roadmap for what comes next.

## What's implemented

- **Multi-tenancy**: Tenant → Store → Branch hierarchy ([docs/srs/03](../../docs/srs/03-multi-tenancy-globalization.md)).
- **Auth**: registration bootstraps a Tenant + Owner, Argon2id password hashing, JWT access tokens (short-lived) + rotating refresh tokens with reuse detection ([docs/srs/13 §13.1.1](../../docs/srs/13-security-compliance.md#1311-staff-authentication)).
- **RBAC engine**: the full algorithm from [docs/srs/02 §2.5.3](../../docs/srs/02-users-rbac.md#253-authorization-algorithm) — role-based grants scoped at GLOBAL/STORE/BRANCH tiers, per-user grant/deny overrides with expiry, and the Owner-above-Super-Admin rank rule ([§2.2.2](../../docs/srs/02-users-rbac.md#222-enforcement-mechanism-not-merely-ui-hiding)). 10 default system roles are seeded per tenant.
- **Catalog**: brands, categories, products (simple/variable/digital/bundle types), variants, publish validation.
- **Inventory**: per-branch stock, row-locked (`SELECT ... FOR UPDATE`) reservation to prevent oversell, manual adjustments with mandatory reason codes, append-only stock movement ledger.
- **Orders**: idempotent checkout (via `Idempotency-Key` header), atomic reservation-and-order-creation saga, order status state machine, cancellation with reservation release, reservation→decrement conversion on ship.
- **Audit log**: append-only, records every sensitive action (RBAC changes, stock adjustments, order lifecycle events).

## Known simplifications vs. the full SRS

These are intentional, documented shortcuts — not bugs — so a reviewer
knows exactly what to expect. Each is called out with a `SIMPLIFICATION:`
comment at its point of use in the code, and maps to a specific gap vs.
[`/docs/srs`](../../docs/srs/00-index.md):

| Area | This implementation | Full spec |
|---|---|---|
| Tax | Flat `Product.taxRatePercent` per line item | Full jurisdiction-based tax engine ([docs/srs/06 §6.3](../../docs/srs/06-orders-checkout-shipping-tax-payments.md#63-tax-engine)) |
| Shipping | Flat placeholder fee | Zones/methods/live carrier rates ([§6.4](../../docs/srs/06-orders-checkout-shipping-tax-payments.md#64-shipping-engine)) |
| Payments | Not integrated — orders go straight to `CONFIRMED` | Gateway authorize/capture, PCI-safe tokenization ([§6.5](../../docs/srs/06-orders-checkout-shipping-tax-payments.md#65-payments)) |
| Login | Resolves account by email alone (first match) | Tenant/subdomain resolved before credentials ([docs/srs/03 §3.6](../../docs/srs/03-multi-tenancy-globalization.md#36-cross-cutting-uiux-behavior)) |
| Staff invites | Temporary password returned directly in the API response, account active immediately | Emailed invite link + accept-invite flow ([docs/srs/15 §15.5](../../docs/srs/15-user-flows-workflows.md#155-flow-employee-onboarding--role-assignment)) |
| 2FA | Schema fields exist (`twoFactorEnabled`/`twoFactorMethod`/`twoFactorSecret`) but TOTP verification is **not implemented/enforced** | Mandatory TOTP/SMS 2FA for Owner/Super Admin ([docs/srs/13 §13.1.1](../../docs/srs/13-security-compliance.md#1311-staff-authentication)) |
| Product content | Single-language fields, no `product_translations` table | Full i18n with fallback chain ([docs/srs/03 §3.4](../../docs/srs/03-multi-tenancy-globalization.md#34-multi-language)) |
| Variants | Options stored as free-form JSON | Structured `product_options`/`product_option_values` tables ([docs/srs/04](../../docs/srs/04-database-schema.md#44-catalog-products-categories-brands-variants)) |
| WhatsApp, CRM, marketing, loyalty/wallet, returns/refunds, analytics, notifications | **Not implemented in this slice** | Chapters [07](../../docs/srs/07-promotions-loyalty-wallets-giftcards.md), [08](../../docs/srs/08-whatsapp-integration.md), [09](../../docs/srs/09-crm-omnichannel-marketing.md), [10](../../docs/srs/10-notifications-ai.md), [11](../../docs/srs/11-analytics-audit-monitoring.md) |
| Audit log listing | `/admin/audit-logs` is effectively GLOBAL-role-only (no store-scoped audit view endpoint yet) | Per-scope filtered audit views ([docs/srs/11 §11.3.2](../../docs/srs/11-analytics-audit-monitoring.md#1132-access--search)) |
| Multi-tenant isolation | Enforced only at the application-query layer (every query filters by `tenantId`) | Defense-in-depth Postgres Row-Level Security ([docs/srs/01 §1.5](../../docs/srs/01-architecture.md#15-deployment-topology)) |

## Prerequisites

- Node.js 20+
- A PostgreSQL 14+ instance (either via Docker, or a local install — see below)

## Setup

```bash
# from the repo root
npm install

# start Postgres — pick ONE of:
docker compose up -d postgres postgres_test         # if you have Docker
# or use a local PostgreSQL install and create the two databases/role yourself:
#   CREATE ROLE nexo LOGIN PASSWORD 'nexo_dev_password' CREATEDB;
#   CREATE DATABASE nexo OWNER nexo;
#   CREATE DATABASE nexo_test OWNER nexo;

cd apps/api
cp .env.example .env
cp .env.test.example .env.test   # only needed for e2e tests

npm run prisma:migrate            # applies migrations to `nexo` (dev)
npm run prisma:seed               # seeds a demo tenant/store/branch/product

npm run start:dev                 # http://localhost:3000
```

The seed script prints working credentials:

```
Owner login:   owner@nexo.dev / OwnerPass123!
Manager login: manager@nexo.dev / ManagerPass123!  (scoped to the seeded branch)
```

### Quick manual smoke test

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"owner@nexo.dev","password":"OwnerPass123!"}'
# -> { accessToken, refreshToken }

curl http://localhost:3000/admin/stores -H "authorization: Bearer <accessToken>"
```

## Running tests

```bash
cd apps/api

npm test                # unit tests (mocked Prisma, no DB required)

# e2e tests need the nexo_test database migrated once:
DATABASE_URL="postgresql://nexo:nexo_dev_password@localhost:5432/nexo_test?schema=public" npx prisma migrate deploy
npm run test:e2e        # full HTTP e2e + real-Postgres concurrency test
```

`test/inventory-concurrency.e2e-spec.ts` specifically proves the oversell
guarantee from [docs/srs/05 §5.2.3](../../docs/srs/05-catalog-inventory-warehouse.md#523-oversell-prevention--edge-cases)
by firing two concurrent reservation transactions at the last unit of stock
against a real Postgres instance — this cannot be meaningfully verified with
a mocked database, since the guarantee comes from `SELECT ... FOR UPDATE`
row locking.

`test/app.e2e-spec.ts` walks the flow end-to-end: tenant bootstrap → store/
branch creation → product publish → stock adjustment → idempotent order
creation → oversell rejection → cancellation/release → refresh token
rotation + reuse detection → scoped staff invite and RBAC enforcement →
audit log verification.

## Project layout

```
prisma/schema.prisma       Database schema (see docs/srs/04 for the full target schema)
prisma/seed.ts             Demo data seed script
src/
  auth/                    Registration, login, refresh rotation, logout
  rbac/                    AuthorizationService (the engine), roles, staff user management
  tenancy/                 Store, Branch CRUD
  catalog/                 Brand, Category, Product, Variant CRUD
  inventory/               Stock levels, reservation, adjustments
  orders/                  Checkout saga, status transitions, cancellation
  audit/                   Append-only audit log service + viewer
  common/                  Guards, decorators, filters shared across modules
```

## Next steps

See [docs/srs/16-implementation-roadmap.md](../../docs/srs/16-implementation-roadmap.md)
for the full phased plan. The next slice after this one is Phase 2
(refunds/returns, coupons/offers, loyalty, wallet) followed by Phase 3
(WhatsApp Cloud API integration, CRM, omnichannel inbox).
