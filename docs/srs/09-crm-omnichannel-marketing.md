# 09 — CRM, Omnichannel Inbox & Marketing Automation

**Document:** Nexo Platform SRS — Chapter 9
**Depends on:** Chapters 04, 08

---

## 9.1 CRM: Customer 360° Profile

### 9.1.1 Profile Composition

A single customer profile view aggregates, in real time:

- **Identity & contact**: name, email, phone(s), preferred language/currency, marketing/WhatsApp opt-in flags.
- **Addresses**: all saved addresses with default shipping/billing markers.
- **Order history**: full list with status, value, items; lifetime value (LTV) computed and cached, recomputed on order completion/refund events.
- **Financial**: wallet balance, active gift cards, loyalty tier & points balance.
- **Conversation history**: every message across every channel (WhatsApp, email, webchat, SMS) in one chronological timeline, not siloed per channel.
- **Tickets/returns**: open and historical support tickets and RMAs.
- **Notes & tags**: internal staff notes (never customer-visible) and freeform/managed tags for segmentation.
- **Consent & compliance state**: marketing opt-in/out timestamps (for audit), data deletion requests in progress.

### 9.1.2 Business Rules

- Customer identity resolution across channels: a WhatsApp conversation from a phone number is matched to an existing `customers` record by phone; if no match, a minimal shadow profile is created (`status='active'`, no password) that can later be merged/claimed when the person registers/logs in with the same phone or email — **merge, never duplicate silently**: if a merge would combine two profiles with conflicting order histories, the system requires explicit staff confirmation (Support/Admin) rather than auto-merging financial data.
- Editing a customer's profile fields that affect legal documents (name used on invoices) does not retroactively alter already-issued invoices (Chapter 6, §6.6 — legal snapshot principle applies here too).
- LTV, churn-risk score, and RFM (Recency/Frequency/Monetary) segments are computed by a scheduled job (not on every page load) for performance, with the computed-at timestamp visible so staff know the data's freshness.

### 9.1.3 Leads & Pipeline (Sales)

- A **Lead** is a pre-customer entity (someone who hasn't purchased yet but has engaged — inbound WhatsApp inquiry, contact form, trade show contact).
- Pipeline stages: `new → contacted → qualified → quoted → won/lost`, each transition loggable with a note; `won` requires linking to a resulting `customer_id` (converts lead to customer) or a `converted_customer_id` reference if the customer record already existed (e.g., a WhatsApp shadow profile that later actually purchased).
- Sales dashboard (Chapter 2, §2.4.6) Kanban view lets Sales drag leads between stages; stage-change automation can trigger notifications (e.g., "quoted" stage auto-sends a quote follow-up reminder task after 3 days of no response).

## 9.2 Omnichannel Inbox

### 9.2.1 Unified Conversation Model

All channels (WhatsApp, email, webchat, SMS) map into the same `conversations`/`messages` schema (Chapter 4, §4.8) so the inbox UI, assignment engine, SLA engine, and reporting are channel-agnostic at the core, with channel-specific rendering only at the message-bubble level (e.g., WhatsApp interactive buttons render differently than an email body, but both are "a message in a conversation").

### 9.2.2 Assignment & Routing

- **Routing strategies** (configurable per store/queue): round-robin, least-busy (fewest open assigned conversations), skill-based (agent tagged with language/topic skills matched against conversation attributes), or manual claim from a shared queue.
- **SLA tracking**: `conversations.first_response_due_at` computed from the store's support SLA policy (e.g., "respond within 15 minutes during business hours") using the branch/store business calendar (Chapter 3, §3.5); dashboard buckets conversations into on-track/at-risk/breaching, with breach events feeding the alerting system (Chapter 11).
- **Escalation**: unanswered-past-SLA conversations auto-escalate (reassign to a supervisor/Manager queue, or trigger an alert) per configurable rules — mirrors the WhatsApp `automation_rules` engine (Chapter 8) but applies across all channels uniformly.

### 9.2.3 Agent Productivity Features

- **Canned responses/snippets**: reusable text blocks (with variable interpolation like `{{customer_first_name}}`, `{{order_number}}`) insertable with a shortcut, managed per store, taggable by topic.
- **Internal notes**: staff-only comments on a conversation thread, visually distinct from customer-facing messages, never sent externally.
- **Multi-agent collision indicator**: as described in Chapter 8, §8.12, applied uniformly across channels.
- **Merge conversations**: if the same customer opens parallel threads on two channels about the same issue, an agent can link/merge the threads' context (without losing per-channel message history) so follow-up on either channel shows full context.

### 9.2.4 Tickets

- A **Ticket** is an optional heavier-weight wrapper around one or more conversations for issues needing structured tracking (category, priority, due date, resolution notes) beyond simple chat — e.g., a damaged-product complaint that spans multiple conversations and an RMA. Tickets link to `returns`/`orders` where relevant for one-click cross-navigation.

## 9.3 Marketing Automation & Campaign Management

### 9.3.1 Segmentation

- **Dynamic segments**: defined by a query builder (e.g., "customers with ≥2 orders in last 90 days AND loyalty tier = Gold AND country = SA") evaluated live at send time — always current membership.
- **Static segments**: a snapshot list (e.g., "attendees of last month's event", manually uploaded or exported-then-fixed) that doesn't change unless explicitly re-synced.
- Segment builder is shared infrastructure used by: Marketing campaigns, targeted coupons (Chapter 7), and automation rule targeting (Chapter 8) — one segmentation engine, many consumers.

### 9.3.2 Campaign Types & Channels

- Channels: Email, SMS, WhatsApp (via approved Marketing templates, Chapter 8, §8.5), Push (Chapter 10).
- Campaign lifecycle: `draft → scheduled → sending → sent` (or `paused`/cancelled before send completes); large sends are processed by the queue in controlled-rate batches (respecting WhatsApp tier limits and email/SMS provider rate limits) rather than a single burst.
- **A/B testing**: a campaign can define 2+ variants (subject line, content, send time) with a defined split percentage and a winner-selection metric (open rate, click rate, conversion) after which the remaining audience automatically receives the winning variant (if configured for auto-send-remainder).
- **Attribution**: `campaign_sends` tracks delivery/open/click, and orders placed within an attribution window after a click are tagged `attributed_campaign_id` for ROI reporting (Chapter 11) — last-touch attribution model by default, documented as such so Marketing doesn't misinterpret multi-touch scenarios.

### 9.3.3 Business Rules

- Every marketing send respects the relevant channel's consent flag (`marketing_opt_in` for email/SMS, `whatsapp_opt_in` for WhatsApp) checked at send time, not just campaign-creation time (Chapter 8, §8.12 principle applied to all channels).
- Unsubscribe/opt-out via any channel (email footer link, WhatsApp "STOP" keyword, SMS "STOP") immediately updates the relevant consent flag platform-wide — an opt-out from email does not need to imply WhatsApp opt-out (channel-specific consent), but a global "unsubscribe from all marketing" option must also be available and honored across channels.
- Frequency capping: configurable max marketing messages per customer per channel per time window (e.g., max 1 WhatsApp marketing template per day) enforced centrally by the send pipeline regardless of how many campaigns are simultaneously targeting that customer, to prevent multiple campaigns from collectively spamming one person.

## 9.4 Database Additions (see also Chapter 4)

```sql
tickets (id, conversation_id NULLABLE, customer_id, category, priority ENUM('low','medium','high','urgent'),
  status ENUM('open','pending','resolved','closed'), assigned_staff_user_id, related_order_id NULLABLE, related_return_id NULLABLE)

canned_responses (id, store_id, shortcut, body, tags TEXT[])

sla_policies (id, store_id, priority, first_response_minutes, resolution_minutes, business_calendar_id)

consent_log (id, customer_id, channel ENUM('email','sms','whatsapp','push'), opted_in BOOLEAN, source, changed_at)
```

## 9.5 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/admin/customers/{id}/profile` | Staff (`customer.view`) | Full 360° aggregate |
| POST | `/api/v1/admin/customers/{id}/notes` | Staff (`customer.update`) | Add internal note |
| POST | `/api/v1/admin/customers/merge` | Staff (`customer.update`, elevated) | Merge two profiles with confirmation |
| GET | `/api/v1/admin/leads` / POST / PATCH | Staff (`lead.*`, Sales) | Pipeline CRUD |
| GET | `/api/v1/admin/conversations` | Staff (`conversation.view`) | Inbox list, filterable by channel/status/assignee |
| POST | `/api/v1/admin/tickets` | Staff (`ticket.create`) | Create ticket |
| POST | `/api/v1/admin/segments` | Staff (`segment.manage`, Marketing) | Create dynamic/static segment |
| GET | `/api/v1/admin/segments/{id}/preview` | Staff | Preview matching count/sample |
| POST | `/api/v1/admin/campaigns` | Staff (`campaign.create`, Marketing) | Create campaign |
| POST | `/api/v1/admin/campaigns/{id}/schedule` | Staff (`campaign.send`, Marketing) | Schedule/launch |
| GET | `/api/v1/admin/campaigns/{id}/report` | Staff (`campaign.view`) | Delivery/open/click/conversion stats |

## 9.6 User Stories

- *As Support, when I open a WhatsApp conversation, I want to see the customer's last 3 orders and open tickets in a side panel without navigating away, so I don't ask the customer to repeat themselves.*
- *As Marketing, I want to build a segment once ("Gold tier, opted into WhatsApp, no purchase in 60 days") and reuse it for both a coupon and a WhatsApp win-back campaign without redefining the audience twice.*
- *As a Support Manager, I want a live view of all conversations approaching SLA breach across all channels, ranked by time remaining, so I can redistribute workload proactively.*

---

**Previous:** [08 — WhatsApp Business Platform Integration](./08-whatsapp-integration.md) · **Next:** [10 — Notifications & AI Features](./10-notifications-ai.md)
