# 05 — Catalog, Inventory, Warehouse & Suppliers

**Document:** Nexo Platform SRS — Chapter 5
**Depends on:** [04 — Database Schema](./04-database-schema.md)

---

## 5.1 Product Catalog

### 5.1.1 Product Types

| Type | Description | Variant support | Inventory tracked |
|---|---|---|---|
| Simple | Single SKU, no options | No | Yes |
| Variable | Has options (Color/Size/etc.) generating multiple SKUs | Yes | Per-variant |
| Digital | Downloadable/license-key product | Optional | No (or license-pool tracked) |
| Bundle | Composed of other products' variants at a fixed or discounted price | No (bundle itself), yes for components | Derived from component stock |

### 5.1.2 Product Creation Workflow (Admin/Merchandiser)

1. Choose type → enter base info (name per language, brand, categories, tax class).
2. If Variable: define Options (e.g., Color: Red/Blue; Size: S/M/L) → system auto-generates the Cartesian product of variants; merchandiser can prune unwanted combinations before saving.
3. Set pricing: base price, optional cost price (for margin reporting, never shown to customer), optional per-store price override.
4. Upload media: minimum 1 image required to publish; drag-to-reorder; alt text mandatory for accessibility (Chapter 14).
5. Set SEO fields (auto-suggested from name/description, editable).
6. Set inventory per branch (or bulk-apply a starting quantity across branches), reorder points.
7. Save as **Draft** → preview → **Publish** (status transitions to `active`, becomes visible on storefront subject to `product_store_visibility`).

### 5.1.3 Business Rules

- SKU is globally unique per tenant; auto-generated from `sku_prefix + variant option codes` if not manually specified, with collision-check before save.
- A product cannot be published (`draft → active`) without: at least one image, a price, a tax class, and at least one active store visibility record.
- Archiving a product hides it from all storefronts immediately but preserves it for historical order references (order_items store a **snapshot** of name/SKU/price, so archiving/deleting never corrupts past orders — see `order_items.sku_snapshot`).
- Deleting a product is only allowed if it has never been ordered; otherwise the system forces archiving instead (hard delete blocked at the service layer, not just discouraged).
- Price changes take effect immediately for new carts; carts created before the change keep their snapshot price for a configurable grace window (default: until cart expiry, typically 7 days) — this must be clearly re-validated and re-confirmed with the customer at checkout if the price has moved beyond a tolerance threshold, to avoid stale/exploited pricing.
- Bundle price validation: system warns (not blocks) if bundle price ≥ sum of component prices, since merchandisers may intentionally do this for clearance bundling, but the warning prevents accidental misconfiguration.

### 5.1.4 Categories

- Unlimited-depth tree; a category page displays products from itself **and**, optionally, descendant categories (`include_descendants` toggle) — default true.
- A product can belong to multiple categories (many-to-many) but has exactly one **primary category** used for breadcrumb and default URL structure.
- Reordering categories/products within a category (drag-and-drop) updates `sort_order`; storefront default sort respects this unless the customer selects an explicit sort (price, newest, popularity).
- Deleting a category with children or products requires explicit reassignment (bulk move) or cascades to "Uncategorized" — never silently orphans products from the storefront navigation without an explicit merchant choice.

### 5.1.5 Brands

- Each brand has its own storefront landing page (auto-generated from brand metadata + associated products), following the same SEO metadata pattern as categories.

### 5.1.6 Reviews

- Only customers with a **verified purchase** (`order_item_id` reference required) may submit a review — prevents fake reviews; anonymous/unverified reviews are a configurable opt-in per store but disabled by default.
- Reviews enter `pending` moderation status by default (configurable to auto-approve for trusted stores); Admin/Marketing can approve/reject with an optional reason sent to the customer.
- Aggregate rating recalculated on every approved review change; cached on `products` denormalized column for storefront listing performance, invalidated via event.

### 5.1.7 API Endpoints (Catalog)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/storefront/products` | Public | List/search/filter products (paginated, cacheable) |
| GET | `/api/v1/storefront/products/{slug}` | Public | Product detail incl. variants, availability |
| GET | `/api/v1/admin/products` | Staff (`product.view`) | Admin list with drafts/archived, filters |
| POST | `/api/v1/admin/products` | Staff (`product.create`) | Create product |
| PUT | `/api/v1/admin/products/{id}` | Staff (`product.update`) | Update product |
| POST | `/api/v1/admin/products/{id}/publish` | Staff (`product.update`) | Draft → Active with validation |
| DELETE | `/api/v1/admin/products/{id}` | Staff (`product.delete`) | Blocked if ordered; else hard delete |
| POST | `/api/v1/admin/products/{id}/variants` | Staff (`product.update`) | Add/regenerate variants |
| POST | `/api/v1/admin/products/bulk-import` | Staff (`product.create`, `export` for template) | CSV/XLSX import, async job, returns job id |
| GET | `/api/v1/admin/products/import-jobs/{id}` | Staff | Poll import job status + row-level error report |
| GET | `/api/v1/admin/categories` / POST / PUT / DELETE | Staff (`category.*`) | Category CRUD |
| GET | `/api/v1/admin/brands` / POST / PUT / DELETE | Staff (`brand.*`) | Brand CRUD |
| GET | `/api/v1/admin/reviews` | Staff (`review.view`) | Moderation queue |
| POST | `/api/v1/admin/reviews/{id}/moderate` | Staff (`review.approve`) | Approve/reject |

## 5.2 Inventory Management

### 5.2.1 Core Concepts

- **Quantity on hand**: physically present at a branch.
- **Quantity reserved**: allocated to unfulfilled confirmed orders (decremented from "available to sell" but not yet physically removed).
- **Available to sell (ATS)** = `quantity_on_hand − quantity_reserved`, computed, never stored directly (avoid drift).
- **Quantity incoming**: from open purchase orders/transfers, shown to Warehouse for planning, not counted in ATS by default (configurable per store: "sell on backorder using incoming stock" is an explicit opt-in with clear customer messaging: "Ships in X days").

### 5.2.2 Reservation Workflow

1. Customer adds to cart: **no reservation yet** (soft check only — ATS > 0).
2. Customer places order (payment authorized or COD confirmed): **hard reservation** — `quantity_reserved += qty` within the same DB transaction as order creation, using `SELECT ... FOR UPDATE` row locking on the inventory row to prevent oversell race conditions under concurrent checkouts.
3. Order shipped: reservation converted to actual decrement — `quantity_on_hand -= qty`, `quantity_reserved -= qty`, ledger entry `type='sale'`.
4. Order cancelled before shipment: reservation released — `quantity_reserved -= qty`, no ledger entry needed (or a `type='release'` informational entry).
5. Return received and restocked: `quantity_on_hand += qty`, ledger entry `type='return'`.

### 5.2.3 Oversell Prevention & Edge Cases

- Two simultaneous checkouts for the last unit: row-level lock on `inventory` ensures only one succeeds; the loser receives a specific `409 INVENTORY_CONFLICT` API error prompting cart refresh, not a generic failure.
- Backorder mode: if enabled per product, ATS can go negative conceptually (order accepted beyond on-hand) but the UI must always show an estimated fulfillment date sourced from `quantity_incoming` ETA; Warehouse dashboard flags these orders distinctly.
- Manual stock adjustment always requires a **reason code** (`damaged`, `lost`, `found`, `count_correction`, `other+note`) — never a bare quantity edit — for audit integrity.
- Multi-branch fulfillment: if the customer's nearest/assigned branch lacks stock but another branch in the same store has it, the order-routing logic (Chapter 6) can auto-select the fulfilling branch based on configurable priority (proximity, stock level, cost) — this is a merchant-configurable feature, off by default for simpler setups.
- Negative inventory from data corruption/migration must trigger an automatic **critical alert** (Chapter 11) — it should never pass silently since it indicates a reservation/decrement bug.

### 5.2.4 Warehouse Operations

- **Purchase Orders**: Warehouse/Admin creates a PO against a supplier → submits → supplier delivers → Warehouse performs **Goods Receipt** (full or partial) → system increments `quantity_on_hand` and `quantity_incoming` decrements accordingly, with a `stock_movements` entry `type='purchase_receipt'` referencing the PO line.
- **Stock Transfers between branches**: requested by a branch (e.g., low stock triggers a suggested transfer from a branch with surplus) → approved by a Manager/Warehouse with cross-branch authority → shipped (decrement source `quantity_on_hand`, mark `in_transit`) → received (increment destination `quantity_on_hand`). In-transit stock is excluded from both branches' ATS to avoid double-counting.
- **Cycle Counts / Stock Take**: scheduled or ad-hoc; Warehouse counts physical stock, enters counted quantity per SKU, system computes variance vs. `system_quantity`; reconciliation requires explicit approval (Manager+) before the adjustment posts to `stock_movements` as `type='adjustment'`.
- **Low-stock / reorder alerts**: background job runs periodically (e.g., every 15 min) comparing ATS to `reorder_point` per branch; triggers a notification (Chapter 11) to Warehouse role and optionally auto-drafts a Purchase Order suggestion (not auto-submitted — human approval required by default).

### 5.2.5 API Endpoints (Inventory/Warehouse)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/admin/inventory` | Staff (`product.view`+stock) | Stock levels, filterable by branch/product/low-stock |
| POST | `/api/v1/admin/inventory/adjust` | Staff (`stock_adjustment.create`) | Manual adjustment with reason code |
| GET | `/api/v1/admin/suppliers` / POST / PUT | Staff (`supplier.*`) | Supplier CRUD |
| POST | `/api/v1/admin/purchase-orders` | Staff (`purchase_order.create`) | Create PO |
| POST | `/api/v1/admin/purchase-orders/{id}/receive` | Staff (`purchase_order.update`) | Record goods receipt (full/partial) |
| POST | `/api/v1/admin/stock-transfers` | Staff (`stock_transfer.create`) | Initiate transfer |
| POST | `/api/v1/admin/stock-transfers/{id}/approve` | Staff (`stock_transfer.approve`) | Approve/ship |
| POST | `/api/v1/admin/stock-transfers/{id}/receive` | Staff | Confirm receipt at destination |
| POST | `/api/v1/admin/stock-counts` | Staff (`stock_count.create`) | Start a cycle count session |
| POST | `/api/v1/admin/stock-counts/{id}/reconcile` | Staff (`stock_count.approve`) | Approve variance and post adjustments |

## 5.3 UI/UX Behavior Notes

- Product list in admin uses server-side pagination + filters (status, category, brand, stock level) with saved filter presets per user.
- Variant matrix editor: spreadsheet-like grid for editing price/stock across all variant combinations at once, with bulk-edit (select multiple cells, apply one value).
- Inventory heatmap (Warehouse dashboard): branches as columns, top-N low-stock SKUs as rows, color-coded by ATS-to-reorder-point ratio.
- Bulk import: uploads are validated row-by-row asynchronously; user gets a downloadable error report (row number, field, error message) rather than an all-or-nothing failure, and can re-upload just the corrected rows.

## 5.4 User Stories

- *As a Merchandiser, I want to duplicate an existing product as a starting point for a similar new item, so I don't re-enter shared attributes.*
- *As Warehouse staff, I want an alert the moment a SKU crosses its reorder point in any branch I manage, with a one-click "draft PO to usual supplier" action.*
- *As Admin, I want to see, before publishing a price change, how many active carts currently hold the old price, so I can judge honoring vs. re-pricing them.*

---

**Previous:** [04 — Database Schema](./04-database-schema.md) · **Next:** [06 — Orders, Checkout, Shipping, Tax & Payments](./06-orders-checkout-shipping-tax-payments.md)
