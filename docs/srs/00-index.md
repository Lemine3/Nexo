# Nexo Platform — Software Requirements Specification (SRS)

**Version:** 2.0 (Enterprise-Grade Blueprint)
**Date:** 2026-07-02
**Status:** Baseline for implementation — living document, update alongside the codebase (see [Chapter 16, §16.7](./16-implementation-roadmap.md#167-closing-note))
**Audience:** Founders/Owner, engineering leadership, backend/frontend/mobile/DevOps/security teams, QA, and product management.

---

## 0.1 Purpose & How to Use This Document

This SRS is the definitive, implementation-grade blueprint for building **Nexo**, a multi-tenant, multi-store, multi-country e-commerce platform with WhatsApp Business Platform (Cloud API) as a first-class commerce channel, granular RBAC across ten+ operational roles, and an AI-augmented CRM/marketing/support stack. It is written so a development team can implement each subsystem **without having to guess at business rules, data models, or API contracts** — every chapter includes database entities, API endpoints, workflows, business rules, edge cases, and security considerations specific to that domain.

Each chapter is a standalone Markdown file, cross-linked to its neighbors, so it can be assigned to an owning team (see [Chapter 16, §16.2](./16-implementation-roadmap.md#162-recommended-team-structure)) and reviewed/updated independently while the numbering preserves a coherent reading order end-to-end.

A prior, higher-level version of this specification (goals and feature inventory only, in Arabic) exists at [`../PLATFORM_SPECIFICATION.md`](../PLATFORM_SPECIFICATION.md); this `docs/srs/` chapter set supersedes it as the authoritative, developer-ready specification.

## 0.2 Chapter Index

| # | Chapter | Summary |
|---|---|---|
| 01 | [System Architecture](./01-architecture.md) | Architectural goals/NFRs, modular-monolith-to-microservices strategy, component & deployment diagrams, tech stack, transactional consistency (Outbox/Saga) patterns |
| 02 | [Users, Roles, Dashboards & RBAC](./02-users-rbac.md) | Full user taxonomy, the Owner role's structural supremacy over Super Admin, all ten role dashboards, granular RBAC engine design and permission matrix |
| 03 | [Multi-Tenancy & Globalization](./03-multi-tenancy-globalization.md) | Tenant/Store/Branch hierarchy, multi-country, multi-currency, multi-language (incl. RTL), multi-timezone rules and data model |
| 04 | [Database Schema & Entity Relationships](./04-database-schema.md) | Full ERD-style schema across identity, catalog, orders, inventory, CRM, WhatsApp, marketing, finance, indexing/performance notes |
| 05 | [Catalog, Inventory & Warehouse](./05-catalog-inventory-warehouse.md) | Products/variants/categories/brands, inventory reservation mechanics, purchase orders, stock transfers/counts, oversell prevention |
| 06 | [Orders, Checkout, Shipping, Tax & Payments](./06-orders-checkout-shipping-tax-payments.md) | Order state machine, checkout saga, tax engine, shipping/carrier integration, payments (PCI-safe), invoices, refunds/returns |
| 07 | [Promotions, Loyalty, Wallets & Gift Cards](./07-promotions-loyalty-wallets-giftcards.md) | Coupons, automatic offers, loyalty tiers/points, customer wallets, gift card issuance/redemption |
| 08 | [WhatsApp Business Platform Integration](./08-whatsapp-integration.md) | Full Cloud API integration: webhooks, templates, interactive/list messages, Flows, Catalog/native cart, Click-to-WhatsApp, AI bot, abandoned cart recovery, order tracking |
| 09 | [CRM, Omnichannel Inbox & Marketing Automation](./09-crm-omnichannel-marketing.md) | Customer 360° profile, lead pipeline, unified inbox across channels, SLA/routing, segmentation, campaign management |
| 10 | [Notifications & AI Features](./10-notifications-ai.md) | Multi-channel notification dispatch/fallback, smart search, recommendations, AI sales assistant, intelligent automation |
| 11 | [Analytics, Audit, Monitoring & Backups](./11-analytics-audit-monitoring.md) | Reporting catalog, real-time dashboards, immutable audit logs, monitoring/SLOs, alerting, backup/DR strategy |
| 12 | [API, Integration & Infrastructure](./12-api-integration-infra.md) | REST API standards/versioning, outbound webhooks, GraphQL, WebSocket, queues, caching, CDN, storage, microservices extraction playbook |
| 13 | [Security & Compliance](./13-security-compliance.md) | Authentication (2FA/JWT), authorization, encryption, secrets management, rate limiting, WAF, PCI-DSS scope, GDPR-style compliance |
| 14 | [Frontend, UX, PWA & Mobile Readiness](./14-frontend-ux-pwa-mobile.md) | Responsive/mobile-first design, RTL/accessibility, PWA installability/offline, native Android/iOS readiness |
| 15 | [End-to-End User & Administrative Workflows](./15-user-flows-workflows.md) | Concrete cross-module scenarios: WhatsApp purchase journey, cart recovery, multi-branch fulfillment, returns, onboarding, flash sales, ownership transfer |
| 16 | [Implementation Roadmap](./16-implementation-roadmap.md) | Phased delivery plan, team structure, testing/QA strategy, Definition of Done, rollout strategy, success metrics |

## 0.3 Cross-Cutting Concerns (appear in multiple chapters — reference points)

- **Money handling** (integer minor units, currency locking at order time): Chapters 03, 04, 06, 07.
- **Multi-tenant scoping (`tenant_id`/RLS)**: Chapters 01, 02, 04, 13.
- **Idempotency (`Idempotency-Key`)**: Chapters 01, 06, 07, 12.
- **Immutable audit trail**: Chapters 02, 04, 11, 13.
- **Timezone basis for scheduled operations**: Chapters 03, 08, 09, 15.
- **RBAC enforcement server-side, never client-trust**: Chapters 02, 12, 13, 14.
- **Transactional Outbox / Saga for cross-module side effects**: Chapters 01, 06, 08, 10.

## 0.4 Glossary (selected terms)

| Term | Meaning |
|---|---|
| Tenant | A single organization/business operating on Nexo (owns one Owner account) |
| Store | A brand/storefront belonging to a tenant, with its own domain/catalog |
| Branch | A physical/logical location (warehouse, retail, pickup) belonging to a store |
| ATS | Available to Sell = quantity on hand − quantity reserved |
| WABA | WhatsApp Business Account (Meta) |
| RBAC | Role-Based Access Control, extended here with attribute-based conditions and scopes |
| Saga | An orchestrated multi-step transaction with defined compensating actions on failure |
| RLS | Row-Level Security (database-enforced tenant isolation) |
| RMA | Return Merchandise Authorization |
| SLA | Service Level Agreement (e.g., support response time commitment) |
| SLO | Service Level Objective (internal engineering reliability target) |

## 0.5 Document Control

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-07-02 | Initial high-level Arabic feature specification (`../PLATFORM_SPECIFICATION.md`) |
| 2.0 | 2026-07-02 | Full enterprise-grade SRS: 16 chapters with architecture, RBAC, schema, API, WhatsApp integration, security, workflows, and roadmap |

---

**Start reading:** [01 — System Architecture](./01-architecture.md)
