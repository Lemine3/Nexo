# 02 — Users, Roles, Dashboards & RBAC

**Document:** Nexo Platform SRS — Chapter 2
**Depends on:** [01 — Architecture](./01-architecture.md)

---

## 2.1 User Taxonomy Overview

Nexo distinguishes three broad user populations, each with its own authentication realm and token scope:

1. **Platform Staff (Back-office users)** — Owner, Super Admin, Admin, Manager, Support, Sales, Marketing, Finance, Warehouse, Delivery, plus any Custom Role. Authenticated via the **Staff Realm** (email/password or SSO + mandatory 2FA above a configurable role threshold).
2. **Storefront Users** — Guest, Registered Customer, B2B/Wholesale Customer, Affiliate. Authenticated via the **Customer Realm** (email/phone/social login).
3. **System/Integration Principals** — OAuth2 client-credential apps, webhook signing identities, service accounts. Authenticated via **API Realm** (client id/secret, signed JWTs, or long-lived scoped API keys).

These realms use the same underlying identity provider component but issue tokens with disjoint audiences (`aud` claim) — a customer token can never be accepted on a staff-only endpoint and vice versa, enforced at the gateway.

## 2.2 The Owner Role — Absolute Authority Above Super Admin

The **Owner** is the single highest-privilege principal in a Nexo tenant (organization). This is an explicit design requirement: **Owner > Super Admin** in every dimension, and this asymmetry must be structurally enforced, not just configured as "a role with all permissions checked."

### 2.2.1 What makes Owner strictly higher than Super Admin

| Capability | Owner | Super Admin |
|---|---|---|
| Create/delete Super Admin accounts | ✅ | ❌ (cannot create/delete peers or Owner) |
| Transfer ownership of the tenant to another user | ✅ (sole capability) | ❌ |
| Delete the entire tenant / close the account | ✅ | ❌ |
| View and export **all** audit logs, including actions performed by Super Admins on RBAC itself | ✅ | ⚠️ Partial — cannot view logs of actions targeting Owner's own account |
| Change tenant-level billing/subscription plan with the platform provider | ✅ | ❌ |
| Override any Super Admin's permission changes (undo/lock) | ✅ | ❌ |
| Force-enable organization-wide security policies (mandatory 2FA, IP allow-listing, session timeout) | ✅ | Can propose; Owner approval required to enforce org-wide |
| Impersonate any staff user for support/debugging (with audit trail) | ✅ | ✅ limited to roles below Super Admin |
| Be deleted or demoted | Cannot be deleted; can only be **transferred** | Can be created/demoted/deleted by Owner |
| Number of holders per tenant | Exactly 1 (with an optional co-owner/successor invited via a signed transfer flow) | 0..N, capped by plan |

### 2.2.2 Enforcement mechanism (not merely UI hiding)

- A dedicated boolean/enum column `is_owner` (or `role_rank = 0`, strictly below all other ranks numerically) on the `staff_users` table, **separate from the RBAC role-permission table**. The authorization middleware checks `is_owner` as a hard-coded first branch before consulting the general permission engine for any operation classified as `owner_only` (tenant deletion, ownership transfer, Super Admin lifecycle management, org-wide security policy enforcement).
- Super Admin's permission set is generated from the RBAC engine (Section 2.5) and can theoretically be granted "manage:roles" — but the authorization layer explicitly denies `role_rank <= target.role_rank` mutations, i.e., **no role can modify or act upon a peer or superior role**, and this rule cannot be turned off by any UI toggle, only bypassed by the Owner (rank 0) by definition.
- Ownership transfer is a two-party cryptographically-signed flow: current Owner initiates → target user (must already be Super Admin or invited) confirms via a time-limited signed link + 2FA re-authentication by both parties → old Owner is automatically demoted to Super Admin at the moment of transfer completion. This event is a first-class audit log entry that cannot be deleted or edited even by the new Owner.

### 2.2.3 Owner Panel — feature list

- **Executive Overview**: cross-store, cross-branch, cross-country consolidated KPIs (revenue, orders, active customers, churn) in a single real-time screen with drill-down.
- **Organization Lifecycle**: create/suspend/delete stores; manage the platform subscription plan, invoices for the SaaS service itself, payment method for platform billing.
- **Super Admin & Admin Governance**: create, suspend, demote Super Admins; view a diff of every permission change made by any Super Admin, with one-click revert.
- **Global Security Policy**: enforce org-wide 2FA, session timeout, password policy, IP allow-listing, device trust; view login anomaly reports across the whole org (see Chapter 13).
- **Immutable Audit Trail Access**: full, unfiltered, non-purgeable log viewer with export (see Chapter 11).
- **Data Portability & Deletion**: full data export (GDPR-style Subject Access/Portability at the org level), and org-level right-to-erasure workflow.
- **Backup & DR Controls**: trigger on-demand backup, view backup health, initiate restore drills (see Chapter 11).
- **Ownership Transfer Wizard**.

## 2.3 Complete Role Catalog

| Role | Rank (0 = highest) | Typical Scope | Mandatory 2FA |
|---|---|---|---|
| Owner | 0 | Global (entire tenant) | Yes, enforced, cannot disable |
| Super Admin | 1 | Global (entire tenant), minus owner-only actions | Yes, enforced |
| Admin | 2 | One or more assigned stores | Yes, enforced |
| Manager | 3 | One or more assigned branches | Recommended, configurable |
| Finance | 3 | Store-wide, financial data only | Yes, enforced (handles money) |
| Marketing | 3 | Store-wide, marketing data only | Recommended |
| Warehouse | 4 | Assigned warehouse(s)/branch(es) | Optional |
| Sales | 4 | Assigned branch/team | Optional |
| Support | 4 | Cross-branch (customer-facing), read-mostly | Optional |
| Delivery | 5 | Self-scoped: only assigned shipments | Optional |
| Custom Role | Configurable | Configurable via Role Builder | Configurable |

Ranks exist purely to enforce the "cannot manage a peer or superior" rule (§2.2.2); they are **not** a substitute for the granular permission engine — two roles at the same rank (e.g., Finance and Marketing) have completely disjoint permissions.

## 2.4 Dashboards Specification (per role)

Each dashboard is a distinct front-end route bundle, guarded server-side (API returns 403 for unauthorized data, never just hidden client-side) and client-side (nav/menu rendering driven by the resolved permission set returned at login, cached in the SPA store).

### 2.4.1 Owner Dashboard
- **Widgets**: Consolidated revenue (all stores), Store health matrix (red/amber/green per store: uptime, order failure rate, support SLA breach count), Super Admin activity feed, Security posture score, Subscription/billing status.
- **Primary actions**: Add store, Manage Super Admins, View global audit log, Configure org security policy.
- **User story**: *As the Owner, I want to see a single screen ranking all my stores by revenue and health so that I can decide where to allocate attention without opening each store individually.*

### 2.4.2 Super Admin Dashboard
- **Widgets**: Same KPI breadth as Owner minus platform-billing widgets; Role & Permission change feed; Integration health (WhatsApp, payment gateways, shipping carriers) status panel.
- **Primary actions**: Create/edit Admin & below accounts, Configure integrations, Build Custom Roles, Configure global settings (currencies, languages, tax defaults).

### 2.4.3 Admin Dashboard (per store)
- **Widgets**: Store KPIs (today/week/month toggle), low-stock alerts, pending orders queue, recent reviews, campaign performance snapshot.
- **Primary actions**: Manage catalog, manage employees within store, configure shipping/payment for the store, manage coupons/offers.

### 2.4.4 Manager Dashboard (per branch)
- **Widgets**: Branch sales vs. target gauge, staff roster with shift status, pending approvals queue (discount overrides, out-of-policy returns), branch inventory alerts.
- **Primary actions**: Approve/reject exception requests, assign tasks, view branch-scoped reports.
- **Business rule**: A Manager can approve a manual discount only up to a configurable percentage ceiling (default 10%); above that, the request auto-escalates to Admin.

### 2.4.5 Support Dashboard
- **Widgets**: Unified inbox (WhatsApp/email/webchat/SMS) with unread counts per channel, open ticket count by SLA bucket (breaching/at-risk/on-track), CSAT trend.
- **Primary actions**: Reply across channels, escalate to Sales/Manager, create/update RMA on behalf of customer, view (not edit) order/payment data.
- **Edge case**: If a conversation arrives from a phone number with no matching customer record, Support can create a minimal CRM profile inline without leaving the inbox.

### 2.4.6 Sales Dashboard
- **Widgets**: Kanban pipeline (Lead → Contacted → Quoted → Won/Lost), personal quota progress bar, upcoming follow-up reminders.
- **Primary actions**: Create manual orders/quotes, apply Sales-tier discount limits, log call/meeting notes on a CRM profile.

### 2.4.7 Marketing Dashboard
- **Widgets**: Active campaign list with live open/click/conversion rates, coupon usage leaderboard, WhatsApp template approval status tracker, abandoned-cart recovery funnel.
- **Primary actions**: Create/schedule campaigns, build coupons/offers, submit WhatsApp templates for Meta approval, define audience segments.

### 2.4.8 Finance Dashboard
- **Widgets**: Revenue/Refunds/Net chart, tax liability by jurisdiction, outstanding invoices, payment gateway settlement reconciliation status, wallet liability balance.
- **Primary actions**: Issue/void invoices, process refunds, reconcile settlements, export financial reports, configure tax rules.

### 2.4.9 Warehouse Dashboard
- **Widgets**: Stock level heatmap by branch/warehouse, reorder-point alerts, incoming purchase orders timeline, pending stock transfers.
- **Primary actions**: Adjust stock (with mandatory reason code), receive purchase orders, initiate inter-branch transfer, run cycle counts.

### 2.4.10 Delivery Dashboard
- **Widgets**: Assigned shipments list (route-ordered), today's COD collection total vs. reconciled, delivery success-rate personal stat.
- **Primary actions**: Update shipment status, capture proof of delivery (photo/signature/OTP), report failed delivery with reason code.
- **Security constraint**: API responses to a Delivery principal are filtered to `shipment.assigned_to = self`; even a crafted request for another shipment ID returns 404 (not 403, to avoid confirming existence).

## 2.5 RBAC Engine Design

### 2.5.1 Permission Model

A permission is the tuple **`(resource, action, scope, conditions?)`**.

- **resource**: domain noun, e.g. `product`, `order`, `invoice`, `coupon`, `employee`, `whatsapp_template`, `refund`.
- **action**: `view`, `create`, `update`, `delete`, `export`, `approve`, plus resource-specific actions (`refund.issue`, `invoice.void`, `order.cancel`, `discount.override`).
- **scope**: `global` → `country:{id}` → `store:{id}` → `branch:{id}` → `self`. A principal's effective scope for a permission is the narrowest scope that still grants access; a permission granted at `store:5` does not implicitly grant `store:6`.
- **conditions** (attribute-based, optional): e.g. `discount.override` condition `max_percent <= 10`, `refund.issue` condition `amount <= 500 USD`.

### 2.5.2 Data Model (see also Chapter 4 for full schema)

```
roles (id, tenant_id, name, rank, is_system, created_at)
permissions (id, resource, action, description)          -- static catalog, seeded
role_permissions (role_id, permission_id, scope_type, scope_id, conditions_json)
staff_users (id, tenant_id, email, role_id[], is_owner, status, ...)
user_permission_overrides (user_id, permission_id, effect ENUM('grant','deny'), scope_type, scope_id, expires_at)
```

- A user may hold **multiple roles** (e.g., Manager + Warehouse for a small branch); effective permissions are the **union** of all role grants, then individual `user_permission_overrides` are applied — **explicit deny always wins over any grant**, at any level.
- `expires_at` on overrides supports temporary elevation (e.g., "Support agent granted refund.issue for 24 hours during a promo incident") — auto-expires without manual cleanup, and the grant/expiry is itself audit-logged.

### 2.5.3 Authorization Algorithm

1. Resolve principal (staff user) and requested `(resource, action)`.
2. Load union of permissions from all assigned roles, scoped.
3. Compute the requested scope from the target entity (e.g., the order's `branch_id`).
4. Check: does any role grant `(resource, action)` at a scope that contains the target's scope? (`global` contains everything; `store:5` contains `branch:12` if branch 12belongs to store 5, etc.)
5. Apply `user_permission_overrides`: if a `deny` override matches, reject regardless of step 4. If a `grant` override matches and step 4 failed, allow.
6. If any `conditions_json` is attached to the matching grant, evaluate against request payload (e.g., discount percent, refund amount); fail closed if condition not met.
7. Rank check (§2.2.2, §2.3): if the action targets another staff user, reject if `target.role_rank <= actor.role_rank` (except Owner, rank 0, exempt).
8. Log the decision (allow/deny) asynchronously to the audit pipeline when the resource is classified `sensitive` (RBAC changes, financial actions, exports, employee lifecycle) — see Chapter 11.

### 2.5.4 Custom Roles Builder (Super Admin+)

- UI: matrix of resources (rows) × actions (columns) with scope selector per row, mirroring §5.3 of the earlier draft.
- Cloning: any existing role (system or custom) can be cloned as a starting point.
- Validation: the builder refuses to save a role that would exceed the creating principal's own effective permissions (**no privilege escalation via role creation** — a Manager, even if somehow given role-builder access, cannot create a role with permissions the Manager doesn't already hold).
- Every save creates a new immutable version; role assignment references a version id, so retroactively editing a role doesn't silently change what a user could do at the time of a past audited action (audit logs reference the role version, not just the role name).

### 2.5.5 Default Permission Matrix (abridged — full matrix lives in seed data / Appendix)

| Resource | Owner | Super Admin | Admin | Manager | Sales | Support | Marketing | Finance | Warehouse | Delivery |
|---|---|---|---|---|---|---|---|---|---|---|
| product | CRUD (global) | CRUD (global) | CRUD (store) | update:price(branch, capped) | view | view | view | view | view+stock | – |
| order | CRUD (global) | CRUD (global) | CRUD (store) | approve exceptions (branch) | create/view (branch) | view/comment (global) | view (store) | view financials (store) | view fulfillment (branch) | update status (self) |
| invoice | CRUD | CRUD | view/issue (store) | view (branch) | – | – | – | CRUD (store) | – | – |
| refund | approve any | approve any | approve (store, ≤ limit) | approve (branch, ≤10%) | – | request (global) | – | approve/issue (store) | – | – |
| employee | CRUD | CRUD (below rank) | CRUD (store, below rank) | CRUD (branch team) | – | – | – | – | – | – |
| whatsapp_template | manage | manage | manage (store) | – | – | use approved | manage | – | – | – |
| coupon/offer | CRUD | CRUD | CRUD (store) | – | propose | – | CRUD (store) | view | – | – |
| stock_adjustment | CRUD | CRUD | CRUD (store) | approve (branch) | – | – | – | – | CRUD (assigned) | – |
| audit_log | view all, unfiltered | view all except owner-targeted | view (store) | view (branch) | – | – | – | view financial subset | view stock subset | – |
| rbac/roles | CRUD | CRUD (rank > 1) | – | – | – | – | – | – | – | – |

## 2.6 User Stories (representative sample)

- *As Super Admin, I want to create a Custom Role "Regional Manager" scoped to 3 specific branches across 2 countries, so that a single person can manage a regional cluster without full Admin rights.*
- *As Manager, when I try to approve a return outside policy that exceeds my discount ceiling, I want the system to clearly tell me it needs Admin approval and auto-route it, rather than silently failing.*
- *As Owner, I want to receive an immediate alert if any Super Admin grants themselves or another Super Admin a new sensitive permission, even though the rank rule blocks lateral escalation, so I can verify no misconfiguration occurred.*
- *As a Delivery agent, I want my app to show only shipments assigned to me today, and I should get a 404 (not a permission error revealing existence) if I try to access another shipment by guessing its ID.*

## 2.7 Edge Cases & Business Rules

- A staff user with zero roles assigned (e.g., mid-onboarding) must default-deny everything except viewing their own profile and completing onboarding — never fail open.
- Deleting a role that is currently assigned to active users is blocked; the system requires reassignment first (bulk reassignment tool provided) or the role is soft-deleted and existing assignments are frozen but not revoked destructively without explicit confirmation.
- If a user's last remaining role is removed, the account is automatically suspended (cannot be left in a "no role, still active" limbo state) and this triggers a notification to the Admin/Super Admin who manages that user.
- Scope containment must be recomputed when org structure changes (e.g., a branch moves from Store A to Store B) — cached permission scope trees are invalidated via an event on `branch.store_id changed`.
- Session tokens carry a permission-set fingerprint; if permissions change mid-session, the next API call re-resolves from source of truth (never trust stale claims in a long-lived JWT for authorization — JWT carries identity only, permissions are resolved server-side per request or cached in Redis with short TTL and explicit invalidation on role/permission change).
- Impersonation (Owner/Super Admin "log in as" a lower-ranked user for support) must: require re-authentication, be time-boxed (default 30 min), bannered visibly in the UI ("You are viewing as X"), fully audit-logged including every action taken while impersonating, and never permitted upward (cannot impersonate an equal or higher rank).

---

**Previous:** [01 — Architecture](./01-architecture.md) · **Next:** [03 — Multi-Tenancy & Globalization](./03-multi-tenancy-globalization.md)
