# 13 — Security & Compliance

**Document:** Nexo Platform SRS — Chapter 13
**Depends on:** Chapters 01, 02, 06, 12

---

## 13.1 Authentication

### 13.1.1 Staff Authentication

- Email + password (Argon2id hashing, per-user salt, configurable work factor) as baseline; optional SSO (SAML/OIDC) for enterprise tenants.
- **2FA**: TOTP (preferred, e.g., Google Authenticator/Authy compatible) or SMS-based OTP (fallback, with the well-known SIM-swap risk disclosed and TOTP recommended as primary for high-privilege roles). Mandatory and non-disableable for Owner and Super Admin (Chapter 2, §2.3); configurable-but-encouraged for other roles, enforceable org-wide by Owner policy (Chapter 2, §2.2.3).
- **Session tokens**: short-lived JWT access tokens (e.g., 15 minutes) + longer-lived rotating refresh tokens (Chapter 4, §4.2 `sessions` table stores the refresh token hash, never the raw token) — refresh token rotation invalidates the previous token on use (reuse detection: if a rotated-out refresh token is presented again, the entire session family is revoked and the user is alerted, indicating likely token theft).
- **Account lockout**: exponential backoff after repeated failed login attempts, full lockout with staff/Owner-notification after a configurable threshold, with a secure unlock flow (not simply time-based, to resist credential-stuffing patience).
- **Device/session management**: users can view and revoke active sessions from their account settings; Owner/Super Admin can force-revoke any staff session (e.g., off-boarding an employee immediately terminates all active sessions, not just disabling future logins).

### 13.1.2 Customer Authentication

- Email/phone + password, or social login (OAuth against Google/Apple/etc.), or passwordless OTP-via-SMS/WhatsApp for markets where password fatigue is a significant conversion barrier.
- Guest checkout does not require authentication (Chapter 6, §6.2.1) but is still subject to fraud/velocity checks (§13.6).

### 13.1.3 API/Integration Authentication

- **OAuth 2.0** client-credentials grant for server-to-server integrations (`api_clients`, Chapter 4, §4.2); scopes map to the same permission catalog as staff RBAC (Chapter 2, §2.5.1) so a third-party integration's blast radius is precisely bounded.
- Long-lived API keys (alternative to OAuth for simpler integrations) are scoped, rotatable, and individually revocable, never a single shared tenant-wide secret.

## 13.2 Authorization

- Fully specified in Chapter 2 (RBAC engine). Security-specific reiteration: **authorization is enforced server-side on every request**, independent of and never trusting any client-supplied role/permission claim beyond the signed JWT's identity assertion — the permission check always re-resolves from the database/cache of source-of-truth grants (Chapter 2, §2.7).
- **Defense in depth**: UI hides unauthorized actions (UX quality), API rejects unauthorized actions (security boundary) — the two must never diverge in a way where the API is more permissive than the UI implies.

## 13.3 Encryption

- **In transit**: TLS 1.2+ enforced everywhere (HSTS enabled, no plaintext HTTP endpoints except the HTTP→HTTPS redirect); internal service-to-service traffic within the cluster also encrypted (mTLS recommended once extracted into microservices, Chapter 12 §12.9).
- **At rest**: database encryption at rest (provider-managed or transparent data encryption), object storage server-side encryption for all buckets, backups encrypted with keys separate from the primary data-encryption keys.
- **Field-level encryption** for especially sensitive fields beyond general at-rest encryption: 2FA secrets, API client secrets, integration credentials (`access_token_ref` fields throughout Chapter 4's schema are references into a secrets manager, not inline plaintext columns — see §13.4).
- **Password/secret hashing**: Argon2id for passwords; HMAC-SHA256 for webhook signatures (Chapter 8, §8.3.2; Chapter 12, §12.2); never reversible encryption for anything that only needs verification, not retrieval.

## 13.4 Secrets Management

- All credentials (payment gateway keys, WhatsApp access tokens, SMTP/SMS provider credentials, database credentials, signing keys) are stored in a dedicated secrets manager (Vault/AWS Secrets Manager/equivalent, Chapter 1 §1.4), never in application config files, environment variables committed to source control, or database columns directly — application code references a secret by name/path and fetches at runtime with short-lived caching.
- **Rotation**: all secrets have a defined rotation policy (e.g., 90 days for API keys, immediate rotation on suspected compromise) with rotation runbooks tested, not just documented in theory.
- **Least privilege access**: only the specific service/module that needs a secret can retrieve it (secrets manager access policies scoped per service identity), and every secret access is itself logged.

## 13.5 Rate Limiting & Abuse Prevention

- Applied at multiple layers: WAF/edge (coarse, IP-based), API gateway (per-principal, per-endpoint-class token-bucket), and application layer (business-rule-specific limits, e.g., gift-card code redemption attempts per session — Chapter 7, §7.5).
- **Differentiated limits**: authentication endpoints (login, password reset, OTP request/verify) have tighter limits than general read endpoints, given their higher abuse value; write endpoints with financial impact (order creation, refund issuance) are rate-limited per-principal even for authenticated, otherwise-trusted users, to bound the damage of a compromised account or buggy integration.
- **CAPTCHA/challenge escalation**: repeated suspicious activity (failed logins, rapid coupon/gift-card guessing) triggers a CAPTCHA or step-up challenge before further attempts are processed, rather than a hard block that a legitimate user can't recover from.

## 13.6 Fraud Prevention

- Velocity checks on guest/new-account checkout (multiple orders in short succession from the same device/IP/card with different shipping addresses is a classic carding pattern) feeding a risk score that can auto-hold an order for manual review (Finance/Admin) rather than auto-shipping.
- Address/BIN/geolocation mismatch signals surfaced to Finance on the order detail view, not auto-blocking (avoids false-positive customer friction) unless the store opts into stricter auto-rejection thresholds.
- Chargeback/dispute tracking linked to `payments`/`orders` so repeat-offender patterns are visible on the customer's CRM profile (Chapter 9, §9.1.2 fraud-flag mechanism, generalized beyond just returns).

## 13.7 Web Application Firewall (WAF) & Network Security

- WAF rules covering OWASP Top 10 categories (SQLi, XSS, path traversal, etc.) at the edge (Chapter 1 diagram), with custom rules for Nexo-specific sensitive endpoints (auth, webhook receivers, checkout, admin RBAC endpoints) tuned tighter than general storefront traffic.
- Basic volumetric DDoS mitigation via the CDN/edge provider's built-in protection; the application layer additionally protects itself from being a single point of amplification (e.g., search endpoints have query complexity limits, Chapter 12 §12.3, to prevent a small request from causing disproportionate backend load).
- Network segmentation: database and internal services are not directly internet-routable; only the API gateway and designated ingress points are exposed, with security groups/firewall rules enforcing least-connectivity between tiers.

## 13.8 Application-Layer Security Practices

- Input validation and output encoding applied consistently (parameterized queries/ORM exclusively — no raw string-concatenated SQL anywhere in the codebase; templating engines auto-escape by default for any HTML rendering, including notification templates, Chapter 10).
- CSRF protection for any cookie-session-based flows (primarily relevant if the back-office SPA uses cookie-based auth rather than pure bearer-token — if cookies are used for session continuity, SameSite=Strict/Lax + CSRF tokens are required).
- Content Security Policy (CSP) headers on all HTML-serving responses to mitigate XSS impact even if an injection slips through.
- Dependency scanning (SCA) in CI on every build, blocking merges that introduce packages with known critical vulnerabilities without an explicit, time-boxed waiver.
- Static Application Security Testing (SAST) integrated into CI; periodic third-party penetration testing (at minimum annually and after major architecture changes) with findings tracked to remediation in the same issue tracker as regular defects, prioritized by severity.

## 13.9 PCI-DSS Scope

- As established in Chapter 6, §6.5: Nexo's servers never receive, process, transmit, or store raw cardholder data — checkout uses gateway-hosted fields/tokenization (SAQ-A eligible scope for the merchant/platform). This is a hard architectural constraint, not a "best effort" — any proposed feature that would require the application backend to touch a raw PAN must be rejected/redesigned at the design-review stage.
- Where a store operates a POS/in-person payment flow (optional future scope), card-present tokenization via a certified terminal SDK follows the same never-touch-raw-PAN principle.

## 13.10 Data Privacy & Compliance

### 13.10.1 Applicable Frameworks (indicative — confirm per target market with legal counsel)

- GDPR-style principles for EU-adjacent operations: lawful basis for processing, data minimization, right to access/portability/erasure/rectification, breach notification obligations.
- Regional data protection laws in target MENA/GCC markets (e.g., Saudi PDPL, UAE data protection law) — data residency requirements may mandate the region-pinning capability already specified in Chapter 1, §1.5 (`tenants.region_pin`).
- CCPA-style considerations if operating in markets serving California consumers.

### 13.10.2 Implementation Requirements

- **Consent management**: explicit, granular, revocable consent for marketing communications per channel (Chapter 9, §9.3.3), logged in `consent_log` with timestamp and source, never inferred from account creation alone.
- **Data Subject rights workflows**: Access (export a customer's full data), Rectification (standard profile edit), Erasure (§11.3.3 pseudonymization approach reconciled with audit-retention needs — personal fields scrubbed, transactional/financial facts retained in anonymized form where legally required for accounting retention), Portability (structured export format).
- **Data minimization**: collect only fields with a defined purpose; avoid storing full payment card data (§13.9) and unnecessary sensitive categories.
- **Data Processing Agreements**: tracked per third-party sub-processor (payment gateways, SMS/email providers, AI providers, Meta) with a public sub-processor list maintained for transparency to merchants and, transitively, their customers.
- **Breach response plan**: defined incident response runbook (detect → contain → assess → notify affected parties/regulators within the applicable statutory window, typically 72 hours for GDPR-aligned regimes → post-mortem), rehearsed, not only written.

## 13.11 Logging & Monitoring for Security

- Security-relevant events (auth failures, permission-denied events on sensitive resources, webhook signature failures, impersonation sessions, secrets access) are logged to a security-specific stream feeding both the general audit log (Chapter 11, §11.3) and a SIEM-style correlation layer for anomaly detection (Chapter 11, §11.5 security alert class).
- Logs themselves are protected: access to raw security/audit logs is itself RBAC-gated and logged (meta-audit), and log storage is tamper-evident (append-only, as established in Chapter 11, §11.3.1).

## 13.12 Security Checklist Summary (for implementation sign-off)

- [ ] Argon2id password hashing, mandatory 2FA for Owner/Super Admin, refresh token rotation with reuse detection
- [ ] Server-side RBAC enforcement on 100% of mutating endpoints, verified by automated authorization test suite covering every role × sensitive-endpoint combination
- [ ] TLS 1.2+ everywhere, HSTS, at-rest encryption, field-level encryption for secrets/2FA seeds
- [ ] Secrets manager integration, no plaintext credentials in code/config/VCS, rotation policy documented and tested
- [ ] Rate limiting at edge, gateway, and business-logic layers with differentiated thresholds
- [ ] WAF active with OWASP Top 10 ruleset + custom rules for auth/checkout/webhook endpoints
- [ ] SAST + SCA in CI, annual third-party pentest, tracked remediation SLAs by severity
- [ ] PCI scope kept at SAQ-A via gateway tokenization, verified by architecture review before any payment feature ships
- [ ] Consent logging, data subject rights workflows (access/erasure/portability) implemented and tested end-to-end
- [ ] Immutable audit logging with DB-enforced append-only privileges, retention policy applied
- [ ] Documented, rehearsed incident response and breach notification plan

---

**Previous:** [12 — API, Integration & Infrastructure](./12-api-integration-infra.md) · **Next:** [14 — Frontend, UX, PWA & Mobile Readiness](./14-frontend-ux-pwa-mobile.md)
