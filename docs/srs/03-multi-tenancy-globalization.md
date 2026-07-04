# 03 — Multi-Store, Multi-Branch, Multi-Country, Multi-Language, Multi-Currency

**Document:** Nexo Platform SRS — Chapter 3
**Depends on:** [01 — Architecture](./01-architecture.md), [02 — Users & RBAC](./02-users-rbac.md)

---

## 3.1 Organizational Hierarchy

```
Tenant (Organization, owned by exactly one Owner)
  └── Store (brand / storefront; has its own domain, theme, catalog visibility)
        └── Branch (physical or logical location: warehouse, pickup point, retail outlet)
              └── Staff assignments, Inventory records, POS terminals (optional)
```

- A **Tenant** may operate 1..N **Stores** (different brands, different domains, potentially different target countries).
- A **Store** may operate 1..N **Branches**. A branch always belongs to exactly one store.
- A **Branch** is the finest-grained unit for inventory, staff assignment (Manager/Warehouse/Delivery scope), and can map to a warehouse, a retail location, or both.
- Products can be scoped at the **Store** level (available/priced per store) with per-branch **inventory** records; a product is never branch-scoped for its catalog data (name, description, images) — only stock levels and branch-specific availability toggles are branch-scoped.

### 3.1.1 Data model implications

```
tenants(id, name, owner_user_id, plan, region_pin, created_at)
stores(id, tenant_id, name, slug, primary_domain, default_country_id, default_currency_id, default_language_id, status)
branches(id, store_id, name, type ENUM('warehouse','retail','pickup_point','hybrid'), address, country_id, timezone, status)
store_countries(store_id, country_id, is_active)             -- which countries a store sells into
product_store_visibility(product_id, store_id, is_active, price_override)
inventory(product_variant_id, branch_id, quantity_on_hand, quantity_reserved, reorder_point)
```

## 3.2 Multi-Country Support

- Each **Store** declares a set of **served countries** (`store_countries`), each with its own: shipping zones, tax rules, payment method availability, legal entity/invoice footer (company registration, VAT number), and language/currency defaults.
- **Country resolution for a storefront visitor**: (1) explicit user selection persisted in a cookie/profile, (2) else IP geolocation, (3) else store's `default_country_id`. Changing country on the storefront re-prices the cart (currency + tax) and may hide/show products not available in the new country.
- **Business rule**: an order is always attributed to exactly one country (the shipping/billing country at time of purchase) for tax and reporting purposes, even if the store serves multiple countries — country cannot change after order confirmation.
- **Edge case**: a product may be legally restricted in certain countries (e.g., regulated goods). `product_country_restrictions(product_id, country_id, restriction_type)` must be checked at both catalog-render time (hide/disable) and at order-creation time (hard validation, since carts can be created before a country switch or via API directly).
- **Legal/compliance content per country**: terms of service, return policy, and invoice templates can be overridden per country; fallback chain is `country override → store default → tenant default`.

## 3.3 Multi-Currency

- `currencies(code ISO-4217, symbol, decimal_places, is_active)`.
- Each Store has a **base/accounting currency** (all internal ledgers, financial reports, and inter-store consolidation at the Owner dashboard use this currency).
- Each Store declares **display currencies** it accepts for storefront browsing; prices are stored in base currency and converted at display time using an **exchange rate table** (`exchange_rates(from_currency, to_currency, rate, effective_at, source ENUM('manual','provider'))`), refreshed on a configurable schedule (e.g., hourly) from a rate provider, with manual override capability for Finance role.
- **Order-time currency lock**: the exchange rate used at checkout is snapshotted onto the order (`orders.exchange_rate_used`, `orders.currency_code`) so historical orders are never re-priced retroactively when rates change.
- **Rounding rule**: all currency math performed in integer minor units (cents) internally; display formatting applies `decimal_places` per currency (e.g., 0 for JPY/KWD-style 3-decimal handling must be explicit per currency, not assumed to be 2 universally).
- **Payment gateway currency support**: not all gateways support all currencies; the payment method list shown at checkout is filtered by `(country, currency, gateway_supported_currencies)` intersection.
- **Wallets and gift cards** (Chapter 7) are denominated in a single currency per customer wallet instance — a customer with a wallet balance in SAR cannot spend it directly against a USD-priced store; conversion, if allowed, must be explicit and logged.

## 3.4 Multi-Language

- `languages(code ISO-639-1, name, is_rtl, is_active)`.
- Full **RTL support** is a first-class requirement (Arabic, Hebrew): all UI components (storefront and back-office) must be built with logical CSS properties (`margin-inline-start` not `margin-left`) or an RTL stylesheet mirror, and tested in both directions — this is not an afterthought toggle.
- **Translatable entities**: product name/description, category name, brand description, CMS pages, email/SMS/WhatsApp templates, coupon display text, legal pages. Model as `entity_translations(entity_type, entity_id, language_code, field, value)` or per-entity `*_translations` tables — recommend a single generic translation table for maintainability, indexed on `(entity_type, entity_id, language_code)`.
- **Fallback chain**: requested language → store default language → tenant default language → first available translation. Never render a blank field.
- **Language detection**: `Accept-Language` header for storefront guests, explicit user preference for logged-in customers and staff, persisted per-user.
- **Back-office localization**: staff UI itself must be translatable (labels, validation messages) independent of which languages the storefront sells in — a Support agent in Cairo may work in an Arabic-localized admin UI while the storefront serves English-speaking customers.
- **Number/date formatting**: locale-aware formatting (Hijri calendar display as a secondary option for MENA markets is a "nice to have" — flag as a backlog item, not MVP).

## 3.5 Multi-Timezone

- Every `branch` and every `staff_user` has an IANA timezone (`Asia/Riyadh`, `Africa/Cairo`, etc.).
- **Storage rule**: all timestamps stored in UTC in the database, no exceptions. Conversion to local time happens only at presentation (API response includes UTC ISO-8601; client renders in viewer's timezone, or the entity's own timezone for operational data like "branch opening hours").
- **Scheduled operations** (campaign sends, report generation, flash-sale start/end) must specify explicitly whether the scheduled time is in the **store/branch's local timezone** or **UTC**, and this must be visible in the UI at the point of scheduling to avoid the classic "sale started at the wrong hour" bug.
- **Business hours & SLA calculations** (e.g., Support ticket SLA, Delivery cutoff times) are computed against the relevant branch's local business calendar, not the server's or the viewer's timezone.

## 3.6 Cross-Cutting UI/UX Behavior

- **Store switcher**: for staff with access to multiple stores (Owner, Super Admin, multi-store Admin), a persistent store switcher in the top nav; switching context reloads scoped data without a full page reload where feasible (SPA state re-fetch).
- **Country/currency/language switcher on storefront**: combined into a single "Region" selector when appropriate (many stores tie currency+language to country by default) but must allow independent override (e.g., an English-speaking expat in Saudi Arabia wants SAR currency + English language).
- **Consolidated reporting**: Owner/Super Admin dashboards that aggregate figures across countries/currencies must display a clearly labeled **base-currency-normalized total** alongside a per-country breakdown in local currency — never silently sum mixed currencies.

## 3.7 Business Rules Summary

1. A Branch cannot exist without a parent Store; deleting a Store with active Branches is blocked until branches are reassigned or archived.
2. A product's core catalog data is store-scoped, not branch-scoped; inventory and local availability are branch-scoped.
3. Orders lock currency, exchange rate, country, and applicable tax rules at confirmation time — immutable thereafter.
4. Every scheduled/time-based feature must declare its timezone basis explicitly in both data model (`scheduled_at_utc`, `timezone_basis`) and UI copy.
5. RTL and translation fallback must never produce empty or broken layout — enforced via automated visual regression tests in CI for at least one RTL and one LTR locale.

## 3.8 Edge Cases

- Customer starts checkout in Country A (in cart), changes shipping address to Country B mid-checkout where the store also sells: re-validate cart (product availability, tax, shipping options) and re-prompt for payment method, since gateway support may differ.
- Exchange rate provider outage: system falls back to the last successfully fetched rate with a staleness flag surfaced to Finance; checkout does not block, but a warning banner is logged for reconciliation.
- A translation is edited for a live product while it's in an active customer's cart: cart display uses cached snapshot; order confirmation always re-fetches current translation at the time of invoice generation for legal accuracy, but the price is not affected by content edits.
- Store's default country is removed from `store_countries` (business no longer ships there): existing orders unaffected; storefront must gracefully fall back to prompting country selection rather than crashing on missing default.

---

**Previous:** [02 — Users & RBAC](./02-users-rbac.md) · **Next:** [04 — Database Schema](./04-database-schema.md)
