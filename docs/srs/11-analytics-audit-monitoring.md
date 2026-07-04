# 11 — Analytics, Reporting, Audit Logs, Monitoring, Alerts & Backups

**Document:** Nexo Platform SRS — Chapter 11
**Depends on:** Chapters 01, 02, 04

---

## 11.1 Analytics & Reporting

### 11.1.1 Data Architecture

- OLTP (PostgreSQL) is optimized for transactional workloads, not heavy aggregate reporting. Beyond a moderate data volume threshold (defined per deployment, roughly when report queries start impacting checkout latency), analytical queries are served from a **read replica** first, and eventually from a dedicated **data warehouse** (e.g., a nightly/near-real-time ETL/CDC pipeline into a columnar store) — this is called out explicitly in Chapter 1 (§1.2) as an extraction candidate.
- **Real-time dashboard metrics** (today's revenue, live visitor count, orders in the last hour) are served from Redis-backed rolling counters updated by event consumers, not by querying the full orders table on every dashboard refresh.

### 11.1.2 Standard Report Catalog

| Domain | Reports |
|---|---|
| Sales | Revenue by day/week/month/store/branch/channel, average order value, sales by category/brand/product, discount impact |
| Customers | New vs. returning, LTV distribution, cohort retention, churn risk list, RFM segments |
| Marketing | Campaign performance (open/click/conversion/ROI), coupon usage & margin impact, segment size trends |
| Inventory | Stock valuation, slow-moving/dead stock, stockout frequency, supplier performance (on-time %, defect rate) |
| Support/CRM | Conversation volume by channel, SLA compliance, CSAT trend, resolution time |
| Finance | P&L summary, tax liability by jurisdiction, payment method mix, refund rate, wallet/gift-card liability |
| WhatsApp | Message volume sent/received, template performance, conversation-to-order conversion, quality rating trend |

### 11.1.3 Capabilities

- Every report is filterable by date range, store/branch, country, and exportable (CSV/XLSX/PDF).
- **Scheduled reports**: any report can be scheduled (daily/weekly/monthly) for automatic email delivery to a configured recipient list — implemented via the Notifications module (Chapter 10) with a `report` content type.
- **Custom report builder** (Admin/Super Admin): pick dimensions and metrics from a governed semantic layer (not raw SQL exposed to end users, to prevent both security issues and inconsistent metric definitions across reports — "revenue" must mean the same thing everywhere in the product).
- Role-based report visibility follows the RBAC model (Chapter 2, §2.5.5) — e.g., Finance sees margin/cost data, Sales does not.

## 11.2 Real-Time Operational Dashboard

- Delivered over WebSocket (Chapter 1, §1.3) for widgets that must feel "live": current active carts, orders in the last N minutes, support conversations awaiting first response, stock-out events as they happen.
- Falls back to short-interval polling if a WebSocket connection cannot be established (corporate proxies, etc.), never leaving the dashboard silently stale without at least a "last updated" timestamp indicator.

## 11.3 Audit Logs

### 11.3.1 Principles

- **Append-only, immutable**: `audit_logs` (Chapter 4, §4.10) rows are never updated or deleted by any application code path; the database role used by the application has no `UPDATE`/`DELETE` grant on this table, enforced at the database privilege level, not just by convention in the ORM — a compromised application server cannot tamper with history.
- **What gets logged**: every action against a resource classified `sensitive` — RBAC/permission changes, employee lifecycle (create/suspend/delete), financial actions (refunds, invoice voids, manual wallet adjustments), data exports, authentication events (login success/failure, password/2FA changes), impersonation sessions (Chapter 2, §2.7), and any Owner/Super Admin governance action.
- **What's captured per entry**: actor (type + id), action, resource type/id, `before`/`after` JSON snapshots (for update actions), IP address, user agent, and — critically — the `role_version_id` in effect at the time (Chapter 2, §2.5.4), so a later question of "what permissions did this person actually have when they did this" is answerable precisely even after roles have since changed.
- **Retention**: configurable per compliance need, minimum recommended 7 years for financial-adjacent logs (common regulatory baseline; verify per target market), with older partitions moved to cold/archive storage (Chapter 1 partitioning strategy) rather than deleted, unless a legally mandated erasure applies (see Data Subject Erasure, §11.3.3).

### 11.3.2 Access & Search

- Owner has unrestricted access (Chapter 2, §2.2.3); Super Admin access excludes entries where the target of the action is the Owner's own account; lower roles see only logs within their scope (store/branch) and relevant resource types (e.g., Finance sees financial action logs, not RBAC change logs, unless also granted that permission).
- Full-text/filtered search by actor, date range, resource type, action — indexed per Chapter 4, §4.11.

### 11.3.3 Interaction with Right-to-Erasure

- When a customer's personal data must be erased (Chapter 13, compliance), audit log entries referencing that customer are **pseudonymized** (customer id replaced with a erasure-tombstone reference, personal fields scrubbed from `before`/`after` JSON) rather than deleted outright, preserving the integrity of the audit trail (e.g., "an order was refunded by staff X" remains provable) while honoring the erasure request for personal data specifically.

## 11.4 Monitoring & Performance

- **Infrastructure metrics**: CPU/memory/disk/network per node, DB connection pool saturation, queue depth and consumer lag, cache hit ratio — collected via Prometheus-style scraping (Chapter 1, §1.4) and visualized in Grafana-style dashboards.
- **Application-level tracing**: every request carries a correlation/trace ID from edge to database, propagated through async job processing too (a webhook-triggered job retains the originating trace context), enabling full request-path visibility for slow or failing operations (OpenTelemetry).
- **Synthetic monitoring**: scheduled synthetic transactions (e.g., "complete a test checkout every 5 minutes in staging-mirrored production-safe mode") to detect degradation before real customers do.
- **Error tracking**: application exceptions captured with stack trace, request context, and user/tenant attribution (Sentry-style), triaged by severity and deduplicated by fingerprint.
- **SLOs**: explicit Service Level Objectives per critical path (e.g., checkout API error rate < 0.1%, P95 latency < 800ms) with **error budgets** tracked, and burn-rate alerts (Chapter 11.5) when a service is consuming its error budget too fast relative to the review period.

## 11.5 Alerting

| Alert Class | Example Triggers | Default Severity | Channel |
|---|---|---|---|
| Availability | Service health check failing, elevated 5xx rate | Critical | Page (SMS/phone call escalation) + Slack/Webhook |
| Performance | P95 latency breach sustained > 5 min, DB replica lag high | Warning → Critical if sustained | Slack/Webhook |
| Business-critical | Payment gateway failure rate spike, WhatsApp account quality drop, negative inventory detected (Chapter 5, §5.2.3) | Critical | Email + Slack + in-app banner to Super Admin/Owner |
| Security | Repeated failed logins, webhook signature verification failures spike, impersonation session started | Critical | Immediate email/Slack to Owner/Super Admin, logged (Chapter 13) |
| Operational | Low stock, SLA breach, campaign send failures, backup failure | Warning | In-app + email to relevant role dashboard |

- Alerts are deduplicated/grouped to avoid fatigue (repeated identical alerts within a cooldown window collapse into one with an incrementing counter) and support **acknowledgement** (`alerts.acknowledged_by_staff_user_id`) so the team has visibility into whether something is already being handled.
- On-call rotation and escalation policy configuration is a Super Admin capability; escalation to Owner is automatic for any unacknowledged Critical alert past a configurable timeout.

## 11.6 Backups & Disaster Recovery

- **Backup schedule**: automated full backups daily, incremental/WAL-based continuous archiving for point-in-time recovery (PITR) with the target **RPO ≤ 15 minutes** stated in Chapter 1, §1.1.
- **Storage**: backups stored in a separate region/provider account from the primary database, encrypted at rest, with immutability/object-lock enabled for a minimum retention period to protect against ransomware-style deletion of both primary and backup data.
- **Restore drills**: quarterly scheduled restore-to-a-clean-environment drills, verified against a checklist (data integrity spot-checks, application boot success against restored data), with results logged — an untested backup is treated as equivalent to no backup for planning purposes.
- **Tenant-level export**: Owner-triggerable full data export (Chapter 2, §2.2.3) distinct from infrastructure backups — serves both portability requests and merchant peace-of-mind, delivered as a structured archive (e.g., CSV/JSON bundle per entity) via signed download link, itself an audited action.
- **Backup health dashboard** (Owner/Super Admin): last successful backup timestamp, size trend, restore-drill history, alerting (§11.5) if a scheduled backup fails or is overdue.

## 11.7 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/admin/reports/{report_key}` | Staff (`analytics.view`, scoped) | Run a standard report with filters |
| POST | `/api/v1/admin/reports/schedule` | Staff (`analytics.export`) | Schedule recurring report delivery |
| POST | `/api/v1/admin/reports/custom` | Staff (`analytics.view`, Admin+) | Run a custom report against the semantic layer |
| GET | `/api/v1/admin/audit-logs` | Staff (`audit_log.view`, scoped) | Search/filter audit trail |
| GET | `/api/v1/admin/monitoring/health` | Staff (`monitoring.view`, Super Admin) | Aggregate system health snapshot |
| GET | `/api/v1/admin/alerts` | Staff (`alert.view`) | Active/historical alerts |
| POST | `/api/v1/admin/alerts/{id}/acknowledge` | Staff (`alert.acknowledge`) | Acknowledge |
| POST | `/api/v1/owner/backups/trigger` | Owner only | On-demand backup |
| GET | `/api/v1/owner/backups` | Owner only | Backup health/history |
| POST | `/api/v1/owner/data-export` | Owner only | Full tenant export request |

## 11.8 User Stories

- *As Owner, I want an immediate alert — not buried in a weekly digest — if any store's payment success rate drops sharply, since that's directly costing revenue right now.*
- *As Finance, I want to schedule the monthly P&L report to land in my inbox on the 1st of every month without me remembering to run it.*
- *As Super Admin, I want confidence that our quarterly restore drill actually proves we can recover, not just that a backup file exists somewhere.*

---

**Previous:** [10 — Notifications & AI Features](./10-notifications-ai.md) · **Next:** [12 — API, Integration & Infrastructure](./12-api-integration-infra.md)
