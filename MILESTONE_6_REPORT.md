# MILESTONE 6 REPORT: Production Hardening, Quality Assurance & Deployment Readiness

**Project**: LocalPickup — Multi-Tenant SaaS Platform for Local Printing & Stationery Self-Pickup  
**Repository**: [Project Repository](https://github.com/Adhithya986/localpickup.git)  
**Verification Date**: October 17, 2026  
**Auditor**: Senior Full-Stack Software Engineer & Cybersecurity Architect  

---

## 1. Executive Summary

Milestone 6 focused on production hardening, rigorous quality assurance, multi-tenant security verification, database snapshot safety, and deployment readiness.

All previous milestone functionalities (Milestones 1–5) were independently audited, hardened, and verified with zero data loss to existing customer, shop, or order records.

### Key Outcomes:
1. **131 of 131 tests passed** across 36 test suites (up from 110 tests), with 0 failures, 0 cancellations, and 0 skipped tests.
2. **Backend and Frontend production builds compile cleanly** with zero TypeScript or bundler errors.
3. **End-to-End 17-step customer journey** fully automated and verified covering mixed orders (stationery + document printing), single-use pickup verification tokens, and instant in-app notifications.
4. **Consistent SQLite snapshotting** implemented via native `VACUUM INTO` and verified via isolated test restoration without touching live production data.
5. **Production documentation authored**: `DEPLOYMENT.md`, `BACKUP_AND_RECOVERY.md`, `SECURITY_CHECKLIST.md`, updated `README.md`, and `.env.example`.
6. **Launch Readiness Verdict**: **Classified as `C. Ready for production after listed prerequisites`**.

---

## 2. Files Inspected and Modified

### Files Inspected:
- `backend/src/app.ts`: Application wiring, middleware, CORS, rate limits, upload interceptors.
- `backend/src/config.ts`: Environment validation, production JWT secret enforcement, path resolution.
- `backend/src/database.ts`: Migration runner and repository initialization.
- `backend/src/db/sqlite.ts`: Native `node:sqlite` connection, WAL mode, foreign keys.
- `backend/src/db/migrations.ts`: Schema migrations 001 through 004, schema tracking.
- `backend/src/db/repository.ts`: Data access layer, atomic transactions, entitlement enforcement.
- `backend/src/middleware/auth.ts`: JWT verification, role-based access control.
- `backend/src/middleware/rateLimiter.ts`: Auth, order, and general API rate limiters.
- `backend/src/middleware/errorHandler.ts`: Centralized error handler and multer wrapper.
- `backend/src/routes/auth.ts`, `orders.ts`, `shops.ts`, `staff.ts`, `products.ts`, `admin.ts`, `documents.ts`, `notifications.ts`.
- `frontend/src/pages/Dashboard.tsx`, `ShopDetails.tsx`, `Pickup.tsx`, `Print.tsx`, `Bookings.tsx`.

### Files Created or Modified:
- `backend/src/db/repository.ts`:
  - Added `addShopMemberWithQuota` and `createProductWithQuota` with `BEGIN IMMEDIATE;` locks for atomic quota enforcement.
  - Enhanced `getShopEntitlements` to enforce expiration based on actual timestamps (`current_period_end < Date.now()` and `trial_ends_at < Date.now()`).
- `backend/src/middleware/securityHeaders.ts`:
  - Created middleware injecting OWASP security headers (`nosniff`, `DENY`, `X-XSS-Protection: 0`, `Strict-Transport-Security`, `Referrer-Policy`, `CSP`, `Permissions-Policy`).
- `backend/src/middleware/errorHandler.ts`:
  - Added cryptographic token and hash scrubbing to prevent secret disclosure in error messages.
- `backend/src/app.ts`:
  - Disabled `X-Powered-By` fingerprinting header.
  - Registered `securityHeaders` middleware.
  - Hardened CORS origin checks for production.
- `backend/src/routes/orders.ts`:
  - Updated `/api/orders/:id/verify-pickup` to accept both `token` and `pickupCode`.
  - Normalized multipart `printJob` options parsing.
- `backend/src/routes/staff.ts` & `backend/src/routes/products.ts`:
  - Integrated atomic quota creation methods.
- `backend/src/scripts/backup.ts`:
  - Implemented consistent SQLite WAL snapshot script utilizing `VACUUM INTO`, upload synchronization, and SHA-256 manifest generation.
- `backend/src/scripts/restore.ts`:
  - Implemented isolated recovery verification script with `PRAGMA integrity_check;` and non-destructive destination targeting.
- `backend/package.json`:
  - Added `"backup"` and `"restore:verify"` npm scripts.
- `backend/tests/e2e_journey.test.ts`:
  - Authored comprehensive 21-test end-to-end journey and security hardening suite.
- `DEPLOYMENT.md`:
  - Production guide detailing Node.js 24 requirements, systemd service, Nginx reverse proxy, and rollback plans.
- `BACKUP_AND_RECOVERY.md`:
  - Backup procedures, WAL snapshotting, cron scheduling, and disaster recovery runbook.
- `SECURITY_CHECKLIST.md`:
  - Pre-launch security audit and verification checklist.
- `.env.example` & `backend/.env.example`:
  - Sanitized configuration templates with placeholder values only.
- `README.md`:
  - Updated local setup instructions, test counts, backup commands, and documentation links.

---

## 3. Actual Commands Executed & Results

| # | Command Executed | Directory | Exit Code | Result Summary |
| :--- | :--- | :--- | :---: | :--- |
| 1 | `npm test` | `backend` | **0** | **131 / 131 tests passed** (36 test suites, 7.67s duration) |
| 2 | `npm run build` | `backend` | **0** | TypeScript compilation completed cleanly |
| 3 | `npm run build` | `frontend` | **0** | Vite production bundle generated (client SPA: 407.74 kB JS, 11.01 kB CSS) |
| 4 | `npm run backup` | `backend` | **0** | `VACUUM INTO` snapshot created, SHA-256 verified, 226 print documents archived |
| 5 | `npm run restore:verify` | `backend` | **0** | Snapshot integrity verified (`PRAGMA integrity_check: ok`), 574 users, 239 shops, 514 orders, 226 products restored to isolated test DB |
| 6 | `git status` | Workspace | **0** | No unexpected files staged; live database intact |

---

## 4. Test Suite Breakdown (131 Passing Tests)

| Test Suite File | Test Count | Key Features Verified |
| :--- | :---: | :--- |
| `backend/tests/e2e_journey.test.ts` | **21** | 17-step mixed customer journey, stationery-only cancellation restoration, print document download RBAC, OWASP security headers, date-driven subscription expiration. |
| `backend/tests/subscriptions_admin.test.ts` | **25** | Admin RBAC, cross-shop subscription isolation, plan upgrade requests, staff quota ceilings, product catalog ceilings, suspended/expired order rejection, audit logs. |
| `backend/tests/notifications_lifecycle.test.ts` | **14** | In-app notification creation on order, lifecycle alerts (`Accepted`, `Preparing`, `Ready`, `Completed`), unread counters, mark-read isolation, timeline history. |
| `backend/tests/inventory_cart.test.ts` | **15** | Product catalog isolation, staff creation, atomic stock deduction, stock restoration upon cancellation, price tamper override, cross-shop cart defense. |
| `backend/tests/multitenancy.test.ts` | **25** | Cross-tenant shop isolation, staff role hierarchy, revocation, identifier tampering defense, database foreign keys, cascade deletes. |
| `backend/tests/security.test.ts` | **25** | Uniform auth error messages, user enumeration defense, admin registration clamp, RBAC, document download access control, single-use pickup tokens. |
| `backend/tests/pricing.test.ts` | **6** | Print option validation, A4/A3 pricing, duplex discounts, spiral binding, and lamination calculations. |
| **Total** | **131** | **All 131 tests passing cleanly.** |

---

## 5. Security & Multi-Tenant Audit Findings

| Confirmed Finding / Area | Severity | Status | Technical Remediation Applied |
| :--- | :---: | :---: | :--- |
| **Subscription Expiration by Date** | Medium | **Fixed** | Previously, shops with expired `current_period_end` could accept orders if their status column had not been manually updated. `getShopEntitlements` now checks `current_period_end < Date.now()` and `trial_ends_at < Date.now()`. |
| **Resource Quota Race Conditions** | Medium | **Fixed** | Concurrent additions could race between `COUNT(*)` check and `INSERT`. Added `addShopMemberWithQuota` and `createProductWithQuota` inside `BEGIN IMMEDIATE;` transactions to acquire write locks before quota evaluation. |
| **Missing HTTP Security Headers** | Low | **Fixed** | Express was not delivering standard security headers. Implemented `securityHeaders` middleware adding `nosniff`, `DENY`, HSTS, CSP, and stripped `X-Powered-By`. |
| **CORS Policy in Production** | Low | **Fixed** | Hardened CORS in `app.ts` to reject non-matching origins when `NODE_ENV=production`. |
| **Error Message Secret Leakage** | Low | **Fixed** | Centralized error handler was updated to scrub JWT tokens and bcrypt hashes from error response strings. |

---

## 6. Database and File Safety Verification

1. **Repeatable Migrations**: Migrations 001 through 004 are idempotently recorded in `schema_migrations`.
2. **Referential Integrity**: Foreign keys (`PRAGMA foreign_keys = ON;`) reject orphaned items and enforce cascade deletes on order child items and status histories.
3. **Transaction Rollback**: Orders that fail midway (e.g. inventory exhaustion or unreadable print document) trigger `ROLLBACK;` and leave product stock and cart items intact.
4. **Idempotent Stock Restoration**: Cancelling or rejecting an order restores physical product stock exactly once. Repeated cancellation attempts are rejected with HTTP 400.
5. **Consistent SQLite Snapshots**: Backups do not copy raw WAL files. They invoke SQLite `VACUUM INTO` to produce clean standalone snapshot databases.
6. **Isolated Recovery Verification**: Automated test restore runs against `backups/test_restore.db` and validates `PRAGMA integrity_check` without overwriting the live database.
7. **Document Access Controls**: Uploaded documents in `uploads/` are not publicly exposed and require authenticated ownership checks.

---

## 7. Payment and Subscription Boundaries (Future Phase)

Currently, the platform does not possess an external payment gateway integration. In accordance with milestone instructions:
- Shop owners requesting plan changes only set `requested_plan_id`. Subscriptions are **never** marked as paid without verified payment.
- **Future Payment Integration Architecture**:
  1. **Webhook Signature Verification**: Mandatory HMAC-SHA256 signature verification on raw request payloads.
  2. **Idempotency**: Webhook event IDs must be recorded in an `idempotency_keys` table to prevent duplicate subscription activations.
  3. **Payment State Machine**: States include `PENDING`, `COMPLETED`, `FAILED`, and `REFUNDED`.
  4. **PCI-DSS Compliance**: Raw payment card numbers and CVVs must never touch or be stored on LocalPickup servers; all card data must be handled through gateway-hosted elements.

---

## 8. Deployment Prerequisites

Before deploying this codebase to production, the following infrastructure prerequisites must be fulfilled:
1. **Domain & DNS**: Assign production domain (e.g., `localpickup.yourdomain.com`) to the server IP.
2. **TLS / HTTPS Certificate**: Provision SSL/TLS certificate via Certbot / Let's Encrypt.
3. **Cryptographic JWT Secret**: Generate a 32+ character high-entropy secret (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and set in `backend/.env`.
4. **Persistent Mounts**: Ensure `/var/lib/localpickup/data` and `/var/lib/localpickup/uploads` reside on a local POSIX filesystem.
5. **Nginx Reverse Proxy**: Deploy configuration specified in [DEPLOYMENT.md](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/DEPLOYMENT.md) with `client_max_body_size 30M;`.
6. **Systemd Service**: Enable and start `localpickup-backend.service`.

---

## 9. Launch-Readiness Verdict

### Final Classification:
**`C. Ready for production after listed prerequisites`**

### Justification:
- All 131 tests pass with zero failures.
- Backend and frontend production builds compile cleanly.
- Security hardening (OWASP headers, sanitized error handler, atomic quotas, date-driven subscription expiration, rate limiting) is fully implemented.
- Database snapshots and restoration testing are verified.
- The system is classified as **C** rather than **D** because production deployment requires external infrastructure prerequisites: domain DNS mapping, Let's Encrypt TLS certificate provisioning, production secret injection, and a future external payment gateway integration for self-service subscription billing.
