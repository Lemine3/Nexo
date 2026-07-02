# 15 — End-to-End User & Administrative Workflows

**Document:** Nexo Platform SRS — Chapter 15
**Purpose:** Concrete, implementable sequences tying together the modules specified in Chapters 1–14, so developers can trace a real scenario across module boundaries instead of inferring integration points.

---

## 15.1 Flow: New Customer Discovers via WhatsApp Ad → Completes Purchase

1. Customer taps a **Click-to-WhatsApp ad** (Chapter 8, §8.7) → opens WhatsApp with a pre-filled message → sends it.
2. Nexo webhook receives the inbound message with a `referral` object; Messaging module creates a `conversations` row tagged with ad attribution, and since no matching `customers` record exists, creates a shadow CRM profile (Chapter 9, §9.1.2) keyed by phone number.
3. Automation rule (Chapter 8, §8.8.1) matches "new conversation, business hours" → AI bot greets, asks what the customer is looking for.
4. Bot uses Smart Search (Chapter 10, §10.2.1) to find matching products, sends a **Product List interactive message** (Chapter 8, §8.4/8.6).
5. Customer taps a product, bot sends the **Product Detail card** with an "Add to Cart" button (Catalog integration, Chapter 8, §8.7).
6. Customer builds a cart natively in WhatsApp and sends the **order message**; webhook processor maps `retailer_id`s to `product_variants` and creates a `carts` row with `channel='whatsapp'`.
7. Bot triggers a **checkout Flow** (Chapter 8, §8.6) collecting shipping address; on submission, Nexo runs the flow's payload through the exact same checkout validation pipeline as Chapter 6, §6.2 (tax calc, shipping cost, inventory soft-check).
8. Bot sends an order summary with a payment link (hosted payment page, tokenized, Chapter 13 §13.9) or a COD confirmation button.
9. On payment success (or COD confirmation), the order-creation saga runs (Chapter 6, §6.2.1): inventory reserved, order created (`confirmed`), invoice generated (Chapter 6, §6.6), outbox events fired.
10. Notifications module (Chapter 10) sends an order-confirmation WhatsApp template back into the **same conversation thread**.
11. CRM shadow profile is now linked to a real `customer_id` with order history (Chapter 9, §9.1.2); lead pipeline (if Sales was tracking it) is marked `won`.

## 15.2 Flow: Abandoned Cart Recovery

1. Customer adds items to a storefront cart, closes the tab without checking out.
2. Scheduled job (Chapter 4/8, §8.9) flags the cart `abandoned` after the configured inactivity window.
3. If `whatsapp_opt_in = true` and a phone number is on file: Notifications module sends a UTILITY/MARKETING template (category per policy) with a product-list reminder and a deep link back to a pre-filled checkout session.
4. If not opted into WhatsApp: falls back to email (Chapter 10, §10.1.1 fallback chain) with the same content adapted to the channel.
5. Customer clicks through, arrives at checkout with cart restored (server-side cart still valid, price re-validated per Chapter 5 §5.1.3 tolerance rule).
6. If no action after the full escalation sequence (Chapter 8, §8.9), the cart is marked permanently `abandoned` and excluded from further recovery attempts; the funnel is recorded for Marketing reporting (Chapter 9/11).
7. If completed, the order is tagged `recovered_via='whatsapp_abandoned_cart'` (or `email_abandoned_cart`) for attribution reporting.

## 15.3 Flow: Order Fulfillment Across Branches with a Stock Shortfall

1. Order placed for Branch A's default inventory pool; at reservation time (Chapter 5, §5.2.2), Branch A's ATS for one line item is insufficient.
2. If multi-branch fulfillment routing is enabled (Chapter 5, §5.2.3), the system checks sibling branches within the store, finds Branch B has stock, and reserves against Branch B instead (recording the fulfilling branch per `order_item` rather than assuming order-level single-branch fulfillment).
3. Warehouse dashboard (Chapter 2, §2.4.9) at Branch B shows the new pick/pack task; Branch A's dashboard does not show it (scope-correct routing).
4. Shipment is created from Branch B's address as the ship-from location, which may affect shipping cost/time — recalculated and, if materially different from what was quoted at checkout, flagged to Support for proactive customer communication (channel per Chapter 10 fallback chain) rather than silently changing delivery expectations.
5. If no branch has stock, the order line is flagged `backorder` (if enabled) or the order is held with a Support/Sales notification to contact the customer with options (wait, substitute, cancel line, cancel order) — never silently auto-cancelled without customer contact unless the store's policy explicitly configures instant-refund-on-shortfall.

## 15.4 Flow: Return, Inspection & Refund

1. Customer requests a return via storefront self-service or a WhatsApp conversation with Support (Chapter 6, §6.7; Chapter 9).
2. Eligibility engine checks return window/policy (Chapter 6, §6.7.2); if ineligible, customer is shown the reason and an option to request a Manager exception.
3. If eligible (or exception approved), a `returns` record is created (`requested`), Support/Manager reviews and approves.
4. Customer ships the item back or drops it at a branch (Click & Collect-style reverse logistics, Chapter 6 §6.4.1 concept applied in reverse); Warehouse (Chapter 5) receives and inspects, recording condition per item.
5. Sellable items restock (`quantity_on_hand` incremented, `stock_movements` type `return`); damaged items are written off or flagged for supplier return.
6. Finance (Chapter 2, §2.4.8) is notified of the approved-for-refund return; issues the refund (Chapter 6, §6.7.1) to the original payment method (or wallet if the customer opted for incentivized wallet credit, Chapter 7 §7.4).
7. A credit note is generated referencing the original invoice (Chapter 6, §6.6); notification sent to the customer confirming refund with amount and expected settlement time, via their preferred channel.
8. If the customer's return rate crosses the fraud-guard threshold (Chapter 6, §6.7.2), their CRM profile is flagged for Support/Finance visibility on future interactions.

## 15.5 Flow: Employee Onboarding & Role Assignment

1. Admin (or Owner/Super Admin) creates a new `staff_users` record, invites via email with a time-limited signup link.
2. New employee sets password, enables 2FA (mandatory if their assigned role requires it, Chapter 2 §2.3).
3. Admin assigns one or more roles and scope (`staff_user_scopes` — specific branches/stores, Chapter 2 §2.5.2/Chapter 4 §4.2).
4. RBAC engine computes effective permissions on next login; back-office UI renders only the dashboards/menu items the new employee can access (Chapter 2, §2.4).
5. Every step (creation, role assignment, scope assignment) is written to the immutable audit log (Chapter 11, §11.3) with the acting Admin as actor.
6. If the employee is assigned a role requiring 2FA and hasn't enabled it within a grace period, access is automatically restricted to non-sensitive actions until 2FA is completed (configurable enforcement).

## 15.6 Flow: Permission/Role Change Mid-Session

1. Super Admin edits a Custom Role's permissions (Chapter 2, §2.5.4), creating a new role version.
2. All currently assigned users' cached permission sets (Chapter 12, §12.6) are invalidated via an event.
3. On the affected users' next API call, the authorization layer re-resolves permissions fresh from source of truth (Chapter 2, §2.5.3) — no stale-JWT-based bypass is possible since JWTs carry identity only, not baked-in permissions.
4. If a currently in-progress action (e.g., a partially filled refund form) is no longer permitted, the next submit attempt is rejected with a clear "your permissions have changed" error rather than a generic 403, and the UI redirects to a permitted view.
5. The role-version-linked audit trail (Chapter 2, §2.5.4; Chapter 11, §11.3.1) ensures any action taken by affected users *before* the change is still correctly attributable to the *old* role version if later audited.

## 15.7 Flow: Flash Sale Launch (Marketing + Inventory + Real-Time Dashboard coordination)

1. Marketing creates an Offer (Chapter 7, §7.2) of type `flash_sale` scoped to specific products/categories, sets start/end time with explicit timezone basis (Chapter 3, §3.5).
2. Warehouse is alerted ahead of time (via a scheduled notification, Chapter 10) to verify stock levels for the featured products, given anticipated demand spikes.
3. At `starts_at`, the offer activates; storefront product pages and category listings begin reflecting the discounted price (cache invalidation triggered exactly at the scheduled time via a scheduled job, not lazily on next unrelated cache expiry, Chapter 12 §12.6).
4. Real-time dashboard (Chapter 11, §11.2) shows live order velocity for the flash-sale products; if stock for a featured SKU approaches zero, an alert fires to Warehouse/Marketing (Chapter 11, §11.5) so they can decide whether to feature a substitute or let it sell out.
5. Concurrent checkout race conditions on the last units are handled by the row-locked reservation mechanism (Chapter 5, §5.2.2/5.2.3) — customers who lose the race get a clear `409 INVENTORY_CONFLICT` with a suggestion of similar in-stock products (Chapter 10, §10.2.2).
6. At `ends_at`, the offer deactivates automatically; any cart still holding the flash-sale price beyond expiry is re-validated at checkout per the price-snapshot tolerance rule (Chapter 5, §5.1.3), and the customer is clearly informed if the price has reverted.
7. Post-sale, Marketing pulls the campaign/offer performance report (Chapter 11, §11.1.2) including recovered-abandoned-cart attribution if applicable.

## 15.8 Flow: Owner Ownership Transfer

1. Owner initiates transfer to an existing Super Admin from the Owner Panel (Chapter 2, §2.2.3).
2. Target user receives a signed, time-limited confirmation link; must re-authenticate with password + 2FA to accept.
3. Current Owner must also re-authenticate with password + 2FA to finalize (two-party confirmation, Chapter 2 §2.2.2).
4. On completion: `is_owner` flag moves atomically to the new user; the previous Owner is automatically demoted to Super Admin rank; an immutable, non-revertible audit log entry records the transfer with both parties' identities and timestamps (Chapter 11, §11.3.1).
5. All active sessions for both accounts are force-refreshed to reflect new permission state (§15.6 mechanism reused).

---

**Previous:** [14 — Frontend, UX, PWA & Mobile Readiness](./14-frontend-ux-pwa-mobile.md) · **Next:** [16 — Implementation Roadmap](./16-implementation-roadmap.md)
