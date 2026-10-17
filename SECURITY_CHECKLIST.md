# Pre-Launch Security & Verification Checklist

This checklist documents the security controls, hardening measures, and verification criteria implemented for the **LocalPickup** multi-tenant SaaS platform.

---

## 1. Authentication & Session Security

- [x] **High-Entropy Secrets**: `JWT_SECRET` must be set in production with $\ge 32$ cryptographically random characters. Insecure placeholders or missing values prevent the application from starting in `NODE_ENV=production`.
- [x] **Timing Attack Mitigation**: Login verification uses a constant-time dummy bcrypt hash when a requested email does not exist to prevent user enumeration timing attacks.
- [x] **Generic Authentication Errors**: Login and registration endpoints provide uniform error messaging ("Invalid email or password") to prevent account enumeration.
- [x] **Role Privilege Escalation Defense**: Public self-registration (`POST /api/auth/register`) enforces `CUSTOMER` or `SHOP_OWNER` assignments only. Self-assignment of `ADMIN` or `PLATFORM_ADMIN` is strictly forbidden and sanitized server-side.
- [x] **Token Revocation / Expiry**: Tokens are issued with a default 7-day expiration (`JWT_EXPIRES_IN=7d`) and contain minimal non-sensitive identity claims (`id`, `email`, `role`, `shopId`).

---

## 2. Multi-Tenant Isolation & Role-Based Access Control (RBAC)

- [x] **Cross-Customer Order Isolation**: Customers can only query, view, or download documents associated with orders matching their authenticated `user.id` or verified email address.
- [x] **Cross-Shop Order Isolation**: Shopkeepers and staff can only access orders, items, and print jobs belonging to their assigned shop (`shop_members.shop_id`).
- [x] **Document Download Protection**: Direct unauthenticated file serving via `/uploads/` is intercepted. Every document download route (`GET /api/documents/:orderId`) enforces strict RBAC: only the order customer, assigned shop staff, or platform admin can download print files.
- [x] **Administrative Endpoint Protection**: All `/api/admin/*` endpoints strictly require `user.role === 'ADMIN' || user.role === 'PLATFORM_ADMIN'`. Ordinary customers and shop owners receive HTTP 403 Forbidden.
- [x] **Shop-Scoped Staff Management**: Shop owners can only add or remove staff members for their own shop (`/:shopId/staff`). Cross-shop staff elevation or member enumeration is blocked.

---

## 3. Quota & Subscription Hardening

- [x] **Atomic Quota Enforcement**: Staff addition (`addShopMemberWithQuota`) and product creation (`createProductWithQuota`) are wrapped in SQLite `BEGIN IMMEDIATE;` transactions. This guarantees atomic ceiling enforcement and prevents concurrent requests from exceeding plan limits.
- [x] **Date-Driven Subscription Expiration**: Subscription validity is evaluated using actual timestamps (`current_period_end < Date.now()` for active/past-due plans, and `trial_ends_at < Date.now()` for trial plans), not solely relying on manually toggled database statuses.
- [x] **Suspension & Expiration Order Shielding**: Expired or suspended shops are immediately blocked from accepting new customer orders (HTTP 403), while existing orders remain accessible for fulfillment and history.
- [x] **Subscription Boundaries**: Shop owners requesting plan changes only record a `requested_plan_id`. Actual plan transitions require administrative approval or confirmed payment gateway verification.

---

## 4. Rate Limiting & Denial-of-Service Defense

- [x] **Authentication Rate Limiting**: `POST /api/auth/login` and `POST /api/auth/register` are limited to 30 requests per 15 minutes per IP (`authRateLimiter`).
- [x] **Order Submission Rate Limiting**: `POST /api/orders` is limited to 60 orders per hour per IP (`orderRateLimiter`) to prevent denial-of-service spamming and counter queue flooding.
- [x] **General API Rate Limiting**: All `/api/*` endpoints are throttled to 500 requests per 15 minutes per IP (`generalApiLimiter`).
- [x] **Payload Caps**: `express.json({ limit: "1mb" })` protects against oversized body payloads.

---

## 5. Network, Headers & Information Disclosure Defense

- [x] **OWASP Security Headers**:
  - `X-Content-Type-Options: nosniff`: Prevents MIME type sniffing.
  - `X-Frame-Options: DENY`: Prevents clickjacking in iframes.
  - `X-XSS-Protection: 0`: Modern standard favoring CSP over legacy buggy auditor.
  - `Referrer-Policy: strict-origin-when-cross-origin`: Restricts referrer leaking.
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`: Enforces HTTPS.
  - `Permissions-Policy`: Restricts camera, microphone, and geolocation device APIs.
  - `Content-Security-Policy`: Disallows unauthorized frame ancestors.
- [x] **Banner Stripping**: `app.disable("x-powered-by")` removes Express framework fingerprinting.
- [x] **Production CORS Policy**: Permissive in development; in production, origin matching is strictly enforced against `CORS_ORIGIN`.
- [x] **Sensitive Data Error Scrubbing**: Centralized error handler (`errorHandler`) sanitizes error messages, redacting potential JWT tokens (`[REDACTED_TOKEN]`) and bcrypt hashes (`[REDACTED_HASH]`), while completely suppressing stack traces in production.

---

## 6. Database & File Integrity

- [x] **Foreign Key Constraints**: `PRAGMA foreign_keys = ON;` is strictly enforced on all SQLite connections.
- [x] **Atomic Transactions**: All multi-step order creations, inventory deductions, status updates, and pickup verifications are wrapped in atomic transactions (`BEGIN IMMEDIATE;` / `COMMIT;` / `ROLLBACK;`).
- [x] **Consistent Snapshots**: Production backups utilize SQLite's native `VACUUM INTO` command, avoiding corrupt uncheckpointed WAL file copies.
- [x] **Checksum Integrity**: Backups are verified against SHA-256 manifests, and automated recovery testing executes `PRAGMA integrity_check;`.
- [x] **Upload Path Traversal Protection**: Upload filenames are sanitized with UUIDs and resolved strictly through `path.basename` to prevent path traversal (`../`) attacks.

---

## 7. Payment Integration Security (Future Phase Requirements)

- [ ] **Webhook Signature Verification**: Webhooks from payment gateways (Stripe, Razorpay, etc.) must verify the cryptographic HMAC SHA-256 signature against the raw request body before processing.
- [ ] **Webhook Idempotency**: Processed payment events must be recorded in an `idempotency_keys` table to prevent duplicate subscription activations or double charges.
- [ ] **No Card Storage (PCI-DSS)**: Never store raw credit card numbers, CVVs, or bank credentials. All payment details must be tokenized on the client via the payment gateway's hosted elements.
- [ ] **Reconciliation Jobs**: Automated cron jobs must reconcile pending subscription payments against gateway APIs.
