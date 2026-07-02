# 12 — REST API, Webhooks, GraphQL, WebSocket, Queues, Caching & Scalable Infrastructure

**Document:** Nexo Platform SRS — Chapter 12
**Depends on:** Chapter 01

---

## 12.1 REST API Design Standards

### 12.1.1 Versioning

- URL path versioning: `/api/v1/...`. A new major version is introduced only for breaking changes; additive changes (new optional fields, new endpoints) ship within the current version.
- Deprecation policy: a deprecated endpoint/field is announced via a `Deprecation` and `Sunset` HTTP header (RFC 8594) with a minimum 6-month notice period before removal, and listed in a public changelog.

### 12.1.2 Conventions

- Resource-oriented URLs, plural nouns (`/orders`, `/products/{id}/variants`), HTTP verbs map to CRUD semantics; actions that don't fit CRUD are modeled as sub-resources/verbs (`POST /orders/{id}/cancel`) rather than overloading `PATCH` with ambiguous partial semantics.
- **Pagination**: cursor-based (`?cursor=...&limit=...`) for high-volume/frequently-mutated collections (orders, messages, audit logs) to avoid page-drift; offset-based acceptable for small, stable collections (categories).
- **Filtering/sorting**: consistent query parameter grammar (`?filter[status]=confirmed&sort=-placed_at`).
- **Errors**: RFC 7807 Problem Details format — `{type, title, status, detail, instance, errors: [{field, code, message}]}` — consistent across all endpoints so client error handling is uniform.
- **Idempotency**: `Idempotency-Key` header required and enforced (per-key response caching, Chapter 1 §1.7 / Chapter 6 §6.2.1) on all unsafe (POST) endpoints that create financial or inventory side effects.
- **Rate limiting headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response (Chapter 13, §13.5).
- **HATEOAS-lite**: responses for stateful resources (orders) include a `links`/`available_actions` array reflecting what the current principal may legally do next given RBAC + business state (e.g., don't advertise a "cancel" action on a `shipped` order if that transition isn't allowed) — reduces client-side guessing and duplicated business-rule logic on the frontend.

### 12.1.3 Documentation

- OpenAPI 3.1 spec is the single source of truth, generated from code annotations (not hand-maintained separately, to prevent drift) and published via Swagger UI/Redoc; contract tests in CI validate that actual responses conform to the published schema before merge.

## 12.2 Outbound Webhooks (Nexo → third parties)

Beyond consuming Meta's webhooks (Chapter 8), Nexo itself exposes an outbound webhook system so merchants/integrators can react to platform events (order created, inventory low, refund issued) without polling.

- `webhook_subscriptions(id, tenant_id, url, event_types TEXT[], secret, status)` — merchant/integrator registers a URL and selects event types.
- Delivery: at-least-once, with HMAC-SHA256 signature (`X-Nexo-Signature`) over the raw payload using the subscription's secret, so receivers can verify authenticity exactly as Nexo verifies Meta's (Chapter 8, §8.3.2) — symmetry is intentional for engineering familiarity.
- Retry policy: exponential backoff up to a max attempt count over ~24 hours, then the subscription is marked `unhealthy` after N consecutive full-retry failures and the owning integrator is notified (Chapter 10) — repeated failures don't retry forever, silently wasting resources.
- A **webhook delivery log** (per subscription) is visible to the Super Admin/integrator for debugging, including request/response bodies and status codes (redacting sensitive fields).

## 12.3 GraphQL (Optional Layer)

- Positioned as a **complementary** query layer over the same application services used by REST (never a parallel, independently-maintained business logic path) — resolvers call the same internal service methods as REST controllers.
- Primary use cases: complex, deeply-nested data needs for the back-office SPA (reduce over-fetching/under-fetching/waterfall requests) and for future mobile apps where minimizing round-trips matters more on variable-latency networks.
- Mutations still require the same `Idempotency-Key`-equivalent discipline (GraphQL mutation input can include an explicit idempotency key field) and go through identical RBAC checks per resolved field/type.
- Query depth/complexity limiting is mandatory to prevent a single malicious/accidental query from causing a resource-exhaustion incident (Chapter 13).

## 12.4 WebSocket / Real-Time Layer

- Used for: real-time dashboards (Chapter 11), Omnichannel Inbox live updates (new message arrival, typing indicators, assignment changes — Chapter 9), order status live tracking on the storefront, live inventory availability updates during flash sales.
- Connection authenticated via the same JWT used for REST, with the WebSocket gateway (Chapter 1 diagram) resolving tenant/principal once at connection time and re-validating on token refresh/expiry (forcing reconnect with a fresh token rather than trusting an indefinitely-long-lived socket).
- Channel/topic model: clients subscribe to scoped topics (e.g., `store:{id}:dashboard`, `conversation:{id}`) and the gateway enforces the same RBAC scope checks as REST before allowing a subscription — a Support agent cannot subscribe to a conversation outside their assigned scope just because they know the ID.
- Falls back to polling automatically on the client if a WebSocket connection cannot be established (Chapter 11, §11.2).

## 12.5 Queue System

- Backbone for all asynchronous work: webhook processing (Chapter 8), notification dispatch (Chapter 10), report generation, bulk imports (Chapter 5), catalog sync to WhatsApp Commerce (Chapter 8), campaign sends (Chapter 9), backup jobs (Chapter 11).
- **Queue topology**: separate queues per workload class with independent scaling and priority (e.g., `transactional-notifications` gets priority/dedicated workers over `marketing-campaign-sends`, so a large marketing blast never delays an order-confirmation message).
- **Dead-letter queues (DLQ)**: messages failing processing after max retries land in a DLQ with full context, surfaced to engineering/on-call (Chapter 11 alerting) rather than being silently dropped or endlessly retried.
- **Exactly-once effect, at-least-once delivery**: consumers are written idempotently (keyed by a stable event/message id, Chapter 1 §1.7) since the queue technology itself typically only guarantees at-least-once delivery.

## 12.6 Caching Strategy (Redis)

| Cache Use | TTL / Invalidation Strategy |
|---|---|
| Product catalog read (storefront) | TTL + explicit invalidation event on product/price/stock change |
| Session / JWT permission-set cache | Short TTL (minutes) + explicit invalidation on role/permission change (Chapter 2, §2.7) |
| Rate limiting counters | Sliding window, TTL-bound |
| Exchange rates (Chapter 3, §3.3) | TTL matching refresh schedule, manual override bypasses cache |
| Recommendation results (Chapter 10) | Precomputed, refreshed on batch schedule, not per-request |
| Real-time dashboard counters (Chapter 11) | Incrementally updated by event consumers, not periodically recomputed from scratch |

- Cache-aside pattern by default (application checks cache, falls back to DB, populates cache); write-through used selectively for counters that must never show stale-negative states (e.g., inventory ATS display leans toward slightly-stale-but-safe with a final authoritative check at reservation time, per Chapter 5 §5.2.3 — cache is for display speed, never the source of truth for the reservation transaction itself).

## 12.7 CDN & Static Assets

- Product images, storefront JS/CSS bundles, and PWA assets served through a CDN with long cache lifetimes plus cache-busting via content-hashed filenames (so cache invalidation is never a manual/error-prone step).
- Signed URLs (short-lived) used for private assets (invoices, customer-uploaded return-claim photos) served via CDN edge but requiring a valid signed token, never public-by-default for anything containing personal/financial data.

## 12.8 File/Object Storage

- All binary assets (product media, generated PDFs, chat attachments, backups) in S3-compatible object storage, organized per-tenant prefix for both operational clarity and to simplify tenant-level export/deletion (Chapter 11, §11.6).
- Virus/malware scanning on customer-uploaded content (chat attachments, return-claim photos) before it becomes retrievable by staff, given this is one of the few paths where external parties upload arbitrary files into the system (Chapter 13).

## 12.9 Microservices Extraction Playbook

Reiterating and operationalizing Chapter 1, §1.2: when a module is extracted, the process is:

1. Freeze the module's internal interface as its public contract (already true if module boundaries were respected in the monolith).
2. Stand up the new service behind the same interface, initially as a **strangler** — the monolith calls the new service instead of its in-process module, with a feature flag to fall back instantly if the extraction misbehaves.
3. Migrate the module's data ownership (its tables) to the new service's own database, via dual-write/backfill during a transition window, then cut over reads, then remove monolith access to those tables entirely (no shared-database anti-pattern surviving post-extraction).
4. Re-point the Transactional Outbox / queue topics so the new service publishes/consumes directly rather than through the monolith's process.

## 12.10 API Endpoints (Meta/infra-facing)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/admin/webhook-subscriptions` | Staff (`integration.manage`) | Register outbound webhook |
| GET | `/api/v1/admin/webhook-subscriptions/{id}/deliveries` | Staff (`integration.view`) | Delivery log/debugging |
| POST | `/api/v1/oauth/token` | API client | OAuth2 client-credentials / refresh grant |
| GET | `/api/v1/.well-known/openapi.json` | Public | Machine-readable API spec |
| GraphQL | `/api/v1/graphql` | JWT/API key | Single GraphQL endpoint |
| WS | `/ws/v1` | JWT | WebSocket upgrade, topic subscription messages |

---

**Previous:** [11 — Analytics, Audit, Monitoring & Backups](./11-analytics-audit-monitoring.md) · **Next:** [13 — Security & Compliance](./13-security-compliance.md)
