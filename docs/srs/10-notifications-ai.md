# 10 — Notifications System & AI Features

**Document:** Nexo Platform SRS — Chapter 10
**Depends on:** Chapters 06, 08, 09

---

## 10.1 Notifications System

### 10.1.1 Architecture

- Every significant domain event (order confirmed, shipment dispatched, low stock, refund issued, SLA breach, campaign sent, points about to expire, etc.) is published as a `notification_events` row (Chapter 4, §4.10) via the Transactional Outbox pattern (Chapter 1, §1.7) — the triggering module never calls a notification provider directly; it emits an event, decoupling business logic from delivery mechanics.
- A **Notification Dispatcher** worker consumes events, resolves the applicable `notification_templates` (per event key, channel, language), resolves the recipient's channel preferences/consent (Chapter 9, §9.3.3), renders the template, and hands off to the channel-specific sender (Email, SMS, Push, WhatsApp — reusing the Messaging module from Chapter 8 for WhatsApp specifically).
- **Multi-channel fallback**: for critical transactional notifications (OTP, order confirmation, delivery failure), a per-event fallback chain can be configured (e.g., try WhatsApp first if opted in and within policy → fall back to SMS if WhatsApp send fails or customer not opted in → fall back to email as last resort), with `notification_deliveries` recording every attempt and outcome per channel for full traceability.

### 10.1.2 Channel Details

| Channel | Provider Pattern | Notes |
|---|---|---|
| Email | SMTP relay / Transactional email API (adapter pattern, Chapter 6 §6.4.2 style) | HTML templates with plain-text fallback; open/click tracking via pixel/link wrapping (disclosed in privacy policy) |
| SMS | Aggregator API per region (adapter pattern) | Used for OTP/2FA (Chapter 13) and critical alerts where WhatsApp/email may be unreliable or unavailable |
| Push (Web/PWA now, mobile later) | Web Push protocol (VAPID) today; FCM/APNs when native apps ship (Chapter 14) | Requires explicit browser permission prompt at a contextually relevant moment, not on page load |
| WhatsApp | Cloud API (Chapter 8) | Subject to template/window rules already covered in Chapter 8 |

### 10.1.3 Business Rules

- Every notification type has a **per-customer, per-channel toggle** in account settings (e.g., "order updates via WhatsApp: on, marketing via email: off") — transactional notifications essential to order fulfillment (e.g., delivery failure requiring action) cannot be fully disabled, only channel-shifted, and this constraint is disclosed clearly in the settings UI.
- Notification templates support per-language, per-store overrides with the same fallback chain as product translations (Chapter 3, §3.4).
- Delivery failures are retried with exponential backoff up to a provider-specific max attempt count, then marked `failed` and, for critical notifications, escalated to an internal alert (Chapter 11) so staff can manually follow up (e.g., call the customer) rather than the failure going unnoticed.
- Rate/frequency capping described in Chapter 9, §9.3.3 applies to marketing-classified notifications; transactional notifications are exempt from marketing frequency caps but have their own anti-spam sanity bounds (e.g., a flapping order-status webhook shouldn't fire 20 "status changed" notifications in a minute — debounced).

## 10.2 AI Features Overview

Nexo's AI capabilities span four functional areas, all built on the same **retrieval-augmented, tool-using** architecture described for the WhatsApp bot (Chapter 8, §8.8.2): an LLM handles language understanding/generation, while all facts and state-changing actions go through Nexo's own authenticated service APIs — the model never has direct, unmediated database access, and every AI-initiated action is attributable, logged, and subject to the same RBAC/audit trail as a human-initiated one (via the scoped AI service principal, Chapter 2 §2.5.2 style permission overrides).

### 10.2.1 Smart Search

- Full-text search over product name/description/category/brand/SKU, backed by Elasticsearch/OpenSearch (Chapter 1, §1.4), with:
  - **Typo tolerance / fuzzy matching** (edit-distance based).
  - **Synonym expansion** (merchant-configurable synonym lists, e.g., "sneakers" ↔ "trainers").
  - **Faceted filtering** (price range, brand, category, rating, in-stock) computed from the same index for performance.
  - **Ranking** combining textual relevance, popularity (sales velocity), recency, and in-stock status (out-of-stock items ranked lower or clearly badged, never hidden without merchant opt-in, to avoid customer confusion about product existence).
  - **Query understanding**: natural-language queries ("red running shoes under $50") parsed into structured filters (category=shoes, color=red, price_max=50) using lightweight NLU before falling back to plain keyword search.
- Search analytics (top queries, zero-result queries) feed back to Merchandising/Marketing to identify catalog gaps — a `zero_result_searches` log is a required feature, not an afterthought, since it's one of the highest-value merchandising signals.

### 10.2.2 Product Recommendations

| Recommendation Type | Technique | Placement |
|---|---|---|
| "Similar products" | Content-based (category, attributes, embeddings similarity) | Product detail page |
| "Frequently bought together" | Market-basket / co-purchase analysis (association rules) | Product detail page, cart |
| "Recommended for you" | Collaborative filtering + browsing/purchase history | Homepage, post-login |
| "Trending now" | Sales-velocity ranking, time-decayed | Homepage, category pages |
| Cross-sell at checkout | Rule-based + collaborative, filtered to low-friction add-ons (small, cheap, high-margin) | Cart/checkout step |
| Upsell | Rule-based (higher-tier variant/bundle of the viewed product) | Product detail page, cart |

- Recommendation models are computed offline/batch (nightly embedding refresh, co-purchase matrix recompute) and served from a fast lookup store (Redis/precomputed tables) at request time — recommendation serving must not add meaningful latency to page render (Chapter 1 NFR: contributes negligibly to the <200ms TTFB budget).
- **Cold-start handling**: new products (no purchase history) fall back to content-based similarity; new customers (no browsing history) fall back to store-wide trending/best-sellers, optionally personalized by declared preferences (selected categories at signup) if available.
- All recommendation placements are **A/B testable** (Chapter 9 infrastructure reused) so Marketing can measure actual conversion lift, not assume it.

### 10.2.3 AI Sales Assistant (Conversational Commerce)

- Extends the WhatsApp bot (Chapter 8, §8.8.2) and can also power a storefront chat widget: helps customers find products via natural conversation ("I need a gift for my dad who likes hiking, budget $50"), pulling from the Smart Search/Recommendation engines rather than a separate product knowledge source, ensuring consistent answers across channels.
- Can proactively suggest complementary items during an active chat-based checkout (tied into Cross-sell/Upsell, §10.2.2), always as a suggestion requiring explicit customer confirmation to add — never silently modifying a cart.

### 10.2.4 Intelligent Automation (internal, staff-facing)

- **Demand forecasting** feeding reorder-point suggestions (Chapter 5, §5.2.4) beyond static thresholds — using historical sales velocity, seasonality, and lead time to recommend dynamic reorder points/quantities to Warehouse.
- **Churn risk scoring** on customer profiles (Chapter 9, §9.1.2) to prioritize retention campaigns.
- **Support reply drafting**: for human agents, an AI-drafted reply suggestion appears in the composer (based on conversation context + knowledge base) that the agent can edit/approve/discard before sending — always human-in-the-loop for external-facing text unless a store explicitly enables full bot autonomy for a narrow, pre-approved intent set (Chapter 8, §8.8.2 guardrails).
- **Anomaly detection** feeding the monitoring/alerting system (Chapter 11): unusual order patterns (potential fraud), unusual return spikes for a SKU (potential quality issue), unusual traffic drops (potential outage or SEO issue).

## 10.3 Business Rules & Edge Cases (AI-specific)

- Every AI-generated customer-facing message must be identifiable as such where required by local regulation (some jurisdictions require bot disclosure) — a configurable per-store setting controls whether/how this disclosure appears (e.g., "🤖 Automated reply" label vs. seamless persona), defaulting to disclosed.
- AI inference calls to third-party model providers are made through a policy layer that strips/never forwards sensitive PII beyond what's necessary for the specific task (e.g., don't send full payment details to a general-purpose LLM even if present in conversation context) — see Chapter 13 for data handling.
- If the AI provider is unavailable/rate-limited, automation gracefully degrades to rule-based/keyword automation and human routing rather than blocking the conversation — AI is an enhancement layer, never a single point of failure for basic customer communication.
- Recommendation/search relevance must never surface out-of-catalog-visibility products for the requesting store/country (respects `product_store_visibility` and `product_country_restrictions`, Chapter 3/4) — a ranking bug that leaks a restricted product's existence is treated as a compliance bug, not just a UX bug.

## 10.4 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/admin/notification-templates` | Staff (`notification.manage`) | List/edit templates per event/channel/language |
| GET | `/api/v1/customer/notification-preferences` | Customer | View/update channel toggles |
| GET | `/api/v1/storefront/search` | Public | Smart search with facets |
| GET | `/api/v1/storefront/products/{id}/recommendations` | Public | Similar / frequently-bought-together |
| GET | `/api/v1/storefront/recommendations/home` | Public/Customer | Personalized homepage feed |
| POST | `/api/v1/admin/ai/reply-suggestion` | Staff (`conversation.reply`) | Draft suggestion for agent composer |
| GET | `/api/v1/admin/analytics/zero-result-searches` | Staff (`analytics.view`, Marketing) | Merchandising gap report |

---

**Previous:** [09 — CRM, Omnichannel Inbox & Marketing Automation](./09-crm-omnichannel-marketing.md) · **Next:** [11 — Analytics, Audit, Monitoring & Backups](./11-analytics-audit-monitoring.md)
