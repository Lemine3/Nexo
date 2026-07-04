# 14 — Frontend, UX, PWA & Mobile Readiness

**Document:** Nexo Platform SRS — Chapter 14
**Depends on:** Chapters 01, 03

---

## 14.1 Design Principles

- **Mobile-first**: layouts designed for the smallest supported viewport first, progressively enhanced for tablet/desktop — not the reverse. This matters disproportionately for Nexo given WhatsApp-driven traffic (Chapter 8) is overwhelmingly mobile.
- **Performance budget**: storefront JS bundle initial load target < 200KB gzipped for the critical path; images served responsively (`srcset`, next-gen formats WebP/AVIF with fallback) via the CDN (Chapter 12, §12.7); Core Web Vitals (LCP, INP, CLS) tracked as release-blocking metrics, not just monitored passively.
- **Design system**: a shared component library (tokens for color/spacing/typography) used identically across storefront and back-office where applicable, with theme-ability per store (merchant branding: logo, colors, fonts) for the storefront specifically.

## 14.2 Responsive Design

- Breakpoint strategy covers mobile (≤480px), tablet (481–1024px), desktop (>1024px), with fluid layouts rather than fixed pixel breakpoints wherever feasible.
- Back-office dashboards (Chapter 2) degrade gracefully on tablet (common for Managers/Warehouse staff on the shop floor) — critical actions (approve return, update stock) must remain fully usable, not just "viewable," on a tablet-sized touch screen.
- Touch targets meet minimum size guidelines (44×44px) throughout, particularly for Delivery/Warehouse mobile-web flows used one-handed in the field.

## 14.3 Internationalization & RTL (cross-reference Chapter 3, §3.4)

- Every screen (storefront and back-office) validated in at least one RTL locale (Arabic) as part of the definition of done for new UI work — mirrored layout, correct icon direction (e.g., "back" arrows flip), correct text alignment, and correct number/date formatting per locale.
- Automated visual regression testing includes both an LTR and RTL snapshot per key page/component to prevent regressions from being merged unnoticed.

## 14.4 Accessibility (WCAG 2.1 AA)

- Semantic HTML and ARIA roles used correctly (not just added reflexively); full keyboard navigability for all interactive flows including checkout and back-office data tables/modals.
- Color contrast ratios meet AA minimums across the design system's palette, including on themed/merchant-customized storefronts (theme editor enforces a minimum-contrast guard rather than allowing merchants to pick inaccessible combinations silently).
- Screen-reader tested critical flows: checkout, order tracking, account settings, and the Omnichannel Inbox (Chapter 9) for Support staff.
- Alt text is mandatory at the data-entry level for product images (Chapter 5, §5.1.2), not an optional field bolted on after the fact.

## 14.5 Progressive Web App (PWA)

- **Installability**: valid web app manifest (icons, theme color, display mode `standalone`), served over HTTPS, with an install prompt surfaced at a contextually appropriate moment (e.g., after a second visit or a completed action), not an intrusive interrupt on first load.
- **Offline capability**: service worker caches the app shell and recently viewed product/category pages for offline/flaky-network browsing; a clear offline indicator is shown, and any action requiring connectivity (checkout, add to cart sync) queues locally and syncs when connectivity returns, rather than silently failing.
- **Push notifications**: Web Push (VAPID) integrated with the Notifications module (Chapter 10, §10.1.2) for order updates and re-engagement, permission requested contextually (e.g., right after placing an order: "Get notified when your order ships") rather than on page load.
- **Background sync** for cart updates and abandoned-cart detection triggers even when the app isn't in the foreground, where the browser API supports it.

## 14.6 Back-Office Frontend Architecture

- Single-page application (Chapter 1, §1.4) with route-level code splitting per role-dashboard (Chapter 2, §2.4) so a Delivery agent's client never downloads Finance-module bundle code.
- Client-side state reflects the resolved permission set from login (Chapter 2, §2.5.3) to drive conditional rendering, always re-validated server-side (Chapter 13, §13.2) — the frontend optimizes for good UX, never for security enforcement.
- Real-time UI updates (Omnichannel Inbox, live dashboards) subscribe to WebSocket topics (Chapter 12, §12.4) scoped to what's currently on-screen, unsubscribing on navigation away to bound client and server resource usage.

## 14.7 Readiness for Native Android & iOS Applications

Nexo's API-first architecture (Chapter 1, §1.1) means native apps are a client addition, not a backend rewrite. Specific readiness requirements:

- **Stable, versioned API contract** (Chapter 12, §12.1) that mobile clients can target independently of web release cadence — mobile app store review cycles are slower than web deploys, so the API must tolerate older mobile client versions running against a newer backend for an extended window (backward-compatible additive changes, Chapter 1 §1.7 expand/contract discipline applied to the API surface, not just the database).
- **Push notification infrastructure** already designed channel-agnostically (Chapter 10, §10.1.2) so adding FCM (Android) and APNs (iOS) tokens alongside Web Push is a registration-endpoint addition, not a redesign.
- **Deep linking scheme** defined early (`nexo://order/{id}`, universal/app links mapped to equivalent web URLs) so notifications, WhatsApp order-tracking links (Chapter 8, §8.10), and email links can open directly into the native app when installed, falling back to web otherwise.
- **Authentication**: mobile apps use the same OAuth2/JWT flows (Chapter 13, §13.1) with refresh tokens persisted in secure platform storage (Keychain/Keystore), biometric unlock (Face ID/fingerprint) as a local convenience layer on top of, not a replacement for, the underlying token-based auth.
- **Recommended stack**: React Native or Flutter to maximize code/logic reuse with the existing TypeScript/React frontend investment (Chapter 1, §1.4) and to ship both platforms from one codebase initially, with the option to eject to fully native modules for performance-critical screens later if needed.
- **Offline-first data layer**: mobile apps should assume intermittent connectivity more aggressively than the PWA (e.g., Delivery agents in areas with poor signal) — local persistence (SQLite/WatermelonDB-style) with a sync engine reconciling against the same REST/GraphQL APIs (Chapter 12), rather than requiring a live connection for core field operations like updating a shipment status.

## 14.8 User Stories

- *As a customer browsing on a mid-range Android phone on a 3G connection, I want the product listing page to be usable within 2–3 seconds, not stall on an unoptimized image-heavy layout.*
- *As a Delivery agent using the mobile web dashboard in bright outdoor sunlight, I want sufficient contrast and large tap targets so I can update a delivery status one-handed without errors.*
- *As a merchant, I want my storefront's brand colors to be applied within the design system without hiring a frontend developer, while the system prevents me from accidentally choosing a combination that fails accessibility contrast.*

---

**Previous:** [13 — Security & Compliance](./13-security-compliance.md) · **Next:** [15 — End-to-End User & Administrative Workflows](./15-user-flows-workflows.md)
