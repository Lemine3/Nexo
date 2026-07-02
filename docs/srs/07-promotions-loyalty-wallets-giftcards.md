# 07 — Coupons, Offers, Loyalty Program, Wallets & Gift Cards

**Document:** Nexo Platform SRS — Chapter 7
**Depends on:** [06 — Orders & Checkout](./06-orders-checkout-shipping-tax-payments.md)

---

## 7.1 Coupons

### 7.1.1 Types & Configuration

| Type | Behavior |
|---|---|
| Percent off | e.g., 15% off eligible items/cart |
| Fixed amount off | e.g., $10 off, in a specific currency (must define behavior for multi-currency stores — see §7.1.3) |
| Free shipping | Waives shipping cost on eligible shipping methods only (not necessarily all methods) |
| Buy X Get Y | Modeled as a `campaigns_offers` type (§7.2), referenced by coupon for gated access |

### 7.1.2 Eligibility Rules (composable, all must pass)

- Minimum cart subtotal.
- Applicable scope: specific products, specific categories, specific brands, or cart-wide.
- Usage limits: total redemptions across all customers, and per-customer redemption limit.
- Validity window (`starts_at`/`ends_at`), evaluated in the **store's configured timezone basis** (Chapter 3, §3.5) to avoid "sale ended an hour early" bugs.
- Customer eligibility: public code vs. targeted (assigned to a specific segment or individual customer, e.g., win-back campaigns) — targeted coupons are validated against `segment_members`/customer id at redemption, not just at display time, since a code could be shared outside its intended audience.
- Stacking policy: by default, only one coupon per order; stacking with other coupons or with automatic offers (§7.2) is an explicit per-coupon toggle (`stackable_with_offers boolean`) to prevent unintended margin erosion.

### 7.1.3 Multi-Currency Handling

- Fixed-amount coupons store a value **per currency** (`coupon_currency_values(coupon_id, currency_code, amount_minor_units)`) rather than a single amount converted on the fly — this avoids counter-intuitive discount amounts fluctuating with exchange rates and gives merchants control over the discount's local perceived value.
- If a currency has no explicit value defined for a fixed coupon, the coupon is not applicable in that currency (fails closed, not auto-converted), with a clear UI validation message.

### 7.1.4 Redemption & Business Rules

- Redemption is validated **twice**: once at cart-apply time (fast feedback) and again at order-creation time inside the same transaction as inventory reservation (defense against race conditions where two near-simultaneous orders both consume the last allowed use of a single-use coupon).
- `coupon_redemptions` is the source of truth for usage counts (computed via count query or maintained as a denormalized counter updated transactionally) — never trust a client-supplied "I haven't used this" claim.
- Refunding/cancelling an order that used a coupon: the coupon usage is **not** automatically returned to the customer's available uses by default (prevents abuse via buy-then-cancel-then-rebuy loops); a Marketing/Admin override can manually restore a use if warranted.
- Edge case: coupon deleted/deactivated after being applied to carts but before checkout completes — checkout re-validates and gracefully removes the coupon with a clear message rather than failing the whole order.

## 7.2 Offers / Campaigns (Automatic Promotions)

- Unlike coupons (require a code), Offers apply automatically when cart conditions are met.
- **Flash Sale**: time-boxed discount on selected products/categories; storefront displays a countdown timer (computed from `ends_at` in the customer's local time, but the discount window itself is anchored to the timezone basis configured at creation — Chapter 3, §3.5).
- **BOGO (Buy One Get One)**: configurable as "buy N of category A, get M of category B free/discounted"; discount allocation applied to the cheapest qualifying eligible item by default (configurable) to keep merchant-favorable defaults.
- **Tiered discount**: e.g., 10% off $50+, 15% off $100+ — engine evaluates the highest qualifying tier only (tiers don't stack with each other).
- **Priority & conflict resolution**: when multiple offers could apply to the same cart, an explicit `priority` integer determines evaluation order; by default, non-stackable offers are mutually exclusive and the highest-value-to-customer offer wins (configurable to instead honor merchant-defined priority strictly, since "best for customer" isn't always the merchant's intended business rule).

## 7.3 Loyalty Program

### 7.3.1 Earning Rules

- Points earned per unit of currency spent (configurable rate, can vary by category — e.g., higher-margin categories earn more points as an incentive).
- Bonus points for: account creation, first purchase, product review, referral (new referred customer's first completed order triggers points to the referrer), birthday (if DOB captured).
- Points are only finalized (moved from `pending` to `available`) after the order reaches `completed` status (i.e., past the return window) — prevents earning-then-returning abuse; a return/refund after points were finalized triggers a compensating negative ledger entry.

### 7.3.2 Redemption & Tiers

- Points redeemable at checkout as a discount (configurable conversion rate, e.g., 100 points = $1) or convertible into Wallet balance (§7.4).
- **Loyalty Tiers** (Bronze/Silver/Gold, etc.) determined by rolling 12-month spend or lifetime points; tier grants perks (free shipping threshold reduction, early access to flash sales, bonus earn rate) — tier recalculation runs as a scheduled job and immediately on qualifying events, with tier **downgrade** given a grace period (e.g., end of quarter) rather than instant demotion, which is a common customer-experience expectation in loyalty programs.
- Points expiry: configurable (e.g., 12 months of inactivity); an automated job posts `expiry` ledger entries and a proactive "your points expire soon" notification (Chapter 10) fires in advance (e.g., 30 days prior) to drive re-engagement rather than surprise expiry.

## 7.4 Wallets

- Every customer has at most one wallet per currency they've transacted in (practically, most customers have exactly one, in the store's primary currency).
- **Top-up sources**: manual by Finance/Support (e.g., goodwill credit), refund-to-wallet, loyalty point conversion, or (optionally) direct customer top-up via payment gateway (treated as a purchase of wallet credit, itself invoiced).
- **Spend rules**: wallet can be used as a full or partial payment method at checkout (split payment with a card/other method for the remainder); wallet debits are recorded transactionally with the order (§6.5).
- **Non-withdrawable by default**: wallet balance is store credit, not cash-convertible back to a bank account, unless a specific jurisdiction/business model requires it (flagged as a configurable, off-by-default capability requiring additional compliance review — e-money regulations vary by country and must be legally reviewed before enabling cash-out).
- Every wallet mutation is an immutable ledger row (`wallet_transactions`); `wallets.balance_minor_units` is a maintained denormalized cache recomputable from the ledger for reconciliation/audit (Finance can run a "wallet ledger integrity check" report — sum of ledger deltas must equal the cached balance; discrepancies alert Finance immediately).

## 7.5 Gift Cards

- Digital gift cards, sold as a product type or issued directly by Finance/Marketing (e.g., promotional giveaway), each with a unique redemption code.
- Gift card balance decrements on use (`gift_card_redemptions`), can be used across multiple orders until exhausted or expired.
- **Fraud controls**: redemption code entry is rate-limited per session/IP (prevents brute-force code guessing across the code space) — see Chapter 13; a redeemed/disabled/expired gift card yields a specific, non-revealing error (does not confirm whether a code "exists but is expired" vs. "never existed" beyond what's necessary for legitimate customer support).
- Gift cards sold to a customer are, from an accounting perspective, a **liability** until redeemed — Finance dashboard (Chapter 2, §2.4.8) tracks total outstanding gift card liability, reportable separately from wallet liability.

## 7.6 Database Additions (see also Chapter 4)

```sql
coupon_currency_values (coupon_id, currency_code, amount_minor_units)
loyalty_tier_history (customer_id, tier_id, effective_from, effective_to)
referral_codes (customer_id, code UNIQUE, uses_count)
referral_redemptions (referral_code_id, referred_customer_id, reward_status ENUM('pending','granted','voided'))
```

## 7.7 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/storefront/cart/coupon` | Customer | Apply/validate coupon |
| DELETE | `/api/v1/storefront/cart/coupon` | Customer | Remove coupon |
| GET | `/api/v1/admin/coupons` / POST / PUT / DELETE | Staff (`coupon.*`) | Coupon CRUD |
| GET | `/api/v1/admin/offers` / POST / PUT | Staff (`offer.*`) | Offer/campaign CRUD |
| GET | `/api/v1/storefront/loyalty/summary` | Customer | Points balance, tier, history |
| POST | `/api/v1/storefront/loyalty/redeem` | Customer | Convert points at checkout |
| GET | `/api/v1/admin/wallets/{customer_id}` | Staff (`wallet.view`, Finance) | Wallet balance + ledger |
| POST | `/api/v1/admin/wallets/{customer_id}/adjust` | Staff (`wallet.adjust`, Finance) | Manual credit/debit with reason |
| POST | `/api/v1/admin/gift-cards` | Staff (`gift_card.create`, Marketing/Finance) | Issue gift card |
| POST | `/api/v1/storefront/gift-cards/redeem` | Customer | Apply code to cart, rate-limited |

## 7.8 User Stories & Edge Cases

- *As Marketing, I want to create a coupon valid only for customers in the "lapsed 90-day" segment, so re-engagement discounts don't leak to active full-price buyers.*
- *As a Customer, if my points are about to expire, I want a heads-up notification with a direct link to redeem them, not silent loss.*
- *As Finance, I want a monthly report reconciling wallet ledger sum vs. cached balances, flagging any tenant/customer where they diverge, since that indicates a bug requiring investigation, not just a rounding note.*
- Edge case: customer redeems a gift card for an order that is later fully refunded — refund policy for the gift-card-funded portion defaults to **refund back to the same gift card** (reissue balance) rather than cash/wallet, unless the gift card has since expired, in which case it converts to wallet credit.

---

**Previous:** [06 — Orders, Checkout, Shipping, Tax & Payments](./06-orders-checkout-shipping-tax-payments.md) · **Next:** [08 — WhatsApp Business Platform Integration](./08-whatsapp-integration.md)
