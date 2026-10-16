# LocalPickup - Multi-Tenant SaaS Implementation Plan

## 1. Executive Summary & Existing Architecture

**LocalPickup** is a multi-tenant SaaS platform designed for local businesses—specifically printing and stationery shops—enabling college students and local customers to pre-order printing jobs and physical stationery items for rapid self-pickup without waiting in lines.

### Existing Architecture Overview
- **Backend Stack**:
  - Runtime: Node.js (v24.21.0) with TypeScript.
  - Framework: Express.js (v5.2.1) using CommonJS module resolution (`tsx watch`).
  - Storage / Database: Flat JSON file (`backend/data.json`) read/written with `fs/promises`.
  - File Uploads: Multer with static file serving from `backend/uploads/` via `express.static`.
  - Security / Auth: Minimal mockup. Unhashed plaintext passwords in `data.json`, no JWT or token exchange, no authorization headers, and no role-based permission checks on endpoints.
- **Frontend Stack**:
  - Runtime: Vite 8.3 + React 19 + React Router v7.
  - Styling: Vanilla CSS (`index.css`) with CSS custom properties.
  - Utilities: `qrcode.react` for rendering QR codes on the order confirmation screen.
  - State / Auth: User profile JSON stored in browser `localStorage`. No JWT token, no Authorization header in HTTP requests.

---

## 2. Existing Functionality

| Module | Feature | Existing Status | Deficiencies / Observations |
| :--- | :--- | :--- | :--- |
| **Discovery** | Browse Shops (`/shops`) | Working | Hardcoded search input without functional filters; displays list from `/api/shops`. |
| **Shop Profile**| Shop Details (`/shops/:id`)| Working | Displays shop header; service cards hardcoded in frontend (only Document Printing is active). |
| **Printing Workflow**| Print Configuration (`/print`) | Working | Calculates prices on frontend; handles paper size (A4/A3), color (bw/color), sides (single/double), copies, binding, and lamination. |
| **Pickup Scheduling**| Choose Slot (`/pickup`)| Working | Static list of timeslots; sends `FormData` including client-computed total to `POST /api/orders`. |
| **Order Confirmation**| Booking Success (`/booking-success`)| Working | Displays QR code encoded with order ID; order details summary. |
| **Customer Orders**| My Bookings (`/bookings`)| Broken / Insecure | Calls `GET /api/orders`, returning **all** orders across **all** shops and users without filtering. |
| **Shop Dashboard**| Order Dashboard (`/dashboard`)| Broken / Insecure | Hardcoded to query shop 1; fetches **all** orders platform-wide; status transitions directly from Pending -> Ready -> Completed without verification. |
| **Admin Panel**| Admin Portal (`/admin`)| Insecure | Client-only check for `user.role === 'ADMIN'`; can toggle subscription status between `ACTIVE` and `SUSPENDED` with unauthenticated `PATCH /api/admin/shops/:id/subscription`. |
| **Authentication**| Login / Register (`/login`)| Insecure | Plaintext passwords stored in `data.json`; no token issued; anyone can self-register with any role (`ADMIN`, `SHOPKEEPER`, `CUSTOMER`). |

---

## 3. Security Vulnerabilities & Architectural Flaws

1. **Missing Authentication & Token Verification (CWE-306, CWE-287)**:
   - There are no tokens (JWT / session) issued upon login or registration.
   - All API endpoints (`/api/orders`, `/api/orders/:id/status`, `/api/admin/*`, `/api/shops/*`) accept unauthenticated requests.
2. **Broken Object-Level Authorization (BOLA / IDOR) (CWE-639)**:
   - `GET /api/orders` returns the entire order history of the system to anyone who calls it.
   - Any user or shop can patch the status of any order in the database via `PATCH /api/orders/:id/status`.
3. **Public Exposure of Private Customer Documents (CWE-552, CWE-200)**:
   - Uploaded files are served via `app.use("/uploads", express.static(...))`.
   - File paths are sequential/timestamped (`1790444664624-e1.png`), easily guessable or scraped. Any student document, confidential assignment, or personal ID is publicly readable on the Internet.
4. **Untrusted Client-Side Pricing (CWE-602)**:
   - The backend blindly accepts `total: parseFloat(total)` from the client's `POST /api/orders` request body. A malicious user can submit `total: 0.01` or a negative price.
5. **Insecure Password Storage (CWE-256, CWE-312)**:
   - Passwords (`password123`, `123456`) are stored in raw plaintext in `data.json`.
6. **Privilege Escalation on Registration (CWE-269)**:
   - `POST /api/auth/register` accepts a `role` field directly from the body. Any user can register as `ADMIN` or `SHOPKEEPER`.
7. **Predictable Order Identifiers & Pickup Verification (CWE-330)**:
   - Order IDs are generated as `"LP-" + Date.now().toString().slice(-6)`. They are sequential and predictable.
   - There is no cryptographic pickup token. No atomic single-use verification mechanism exists.
8. **Lack of Rate Limiting & Denial of Service Vulnerabilities (CWE-770, CWE-400)**:
   - Multer has no file size limit (`limits: { fileSize: ... }`).
   - No rate limiting on login, registration, or order creation.
   - No file MIME/extension inspection; any executable or arbitrary payload can be uploaded.
9. **Missing Environment Validation & Insecure Fallbacks**:
   - No `.env` or `.env.example`. Hardcoded port `5000`. No production secret enforcement.

---

## 4. Missing Functionality

1. **Stationery & Product Catalog**:
   - Products model (pens, notebooks, record books, files, art supplies).
   - Category management (Paper Products, Writing Instruments, Office Supplies).
   - Stock & inventory tracking (reserve on order, restore on cancellation).
2. **Unified Cart & Checkout**:
   - Combined checkout for printing services and stationery products under a single shop.
   - Prevention of cross-shop mixing in a single pickup order.
3. **Shop Management Dashboard**:
   - Shop profile customization (name, description, contact, pickup hours, pricing rules).
   - Product and inventory management (create, edit, archive, stock updates).
   - Order preparation management with granular statuses.
4. **Order Lifecycle & Atomic Pickup Verification**:
   - Granular statuses: `Pending` -> `Accepted` -> `Preparing` -> `Ready for Pickup` -> `Completed` (or `Rejected` / `Cancelled`).
   - Cryptographically random pickup code and QR token.
   - Shop staff verification portal with single-use atomic completion.
5. **In-App Notifications**:
   - Notification feed for customers when orders are accepted, ready, or completed.
   - Sound/badge indicators for shopkeepers receiving new incoming orders.
6. **Platform Administration & SaaS Subscriptions**:
   - Platform dashboard for tenant monitoring, subscription plan management, shop approval, suspension, and auditing.
   - Multi-tenant isolation verified by automated tests.

---

## 5. Proposed Database Changes (SaaS Schema)

To support the multi-tenant architecture and product catalog while preserving existing data, the schema will be evolved cleanly:

```mermaid
erDiagram
    USERS ||--o{ SHOPS : owns
    SHOPS ||--o{ SHOP_MEMBERS : employs
    USERS ||--o{ SHOP_MEMBERS : user
    SHOPS ||--o{ CATEGORIES : categorizes
    CATEGORIES ||--o{ PRODUCTS : contains
    SHOPS ||--o{ PRODUCTS : offers
    SHOPS ||--o{ SERVICES : configures
    USERS ||--o{ ORDERS : places
    SHOPS ||--o{ ORDERS : fulfills
    ORDERS ||--o{ ORDER_ITEMS : contains
    ORDERS ||--o{ PRINT_JOBS : includes
    ORDERS ||--o{ ORDER_STATUS_HISTORY : tracks
    ORDERS ||--o| PICKUP_VERIFICATION : verifies
    SHOPS ||--o| SUBSCRIPTIONS : subscribes
    SUBSCRIPTION_PLANS ||--o{ SUBSCRIPTIONS : specifies
```

### Key Entities
1. **Users**: `id`, `email`, `passwordHash`, `name`, `role` (`PLATFORM_ADMIN`, `SHOP_OWNER`, `SHOP_STAFF`, `CUSTOMER`), `createdAt`, `updatedAt`.
2. **Shops**: `id`, `name`, `slug`, `description`, `ownerId`, `address`, `phone`, `rating`, `subscriptionStatus` (`TRIAL`, `ACTIVE`, `SUSPENDED`, `CANCELLED`), `pricingConfig`, `pickupHours`, `createdAt`.
3. **ShopMembers**: `id`, `shopId`, `userId`, `role` (`OWNER`, `STAFF`), `createdAt`.
4. **Categories**: `id`, `shopId`, `name`, `slug`.
5. **Products**: `id`, `shopId`, `categoryId`, `name`, `description`, `price`, `stockQuantity`, `isAvailable`, `imageUrl`, `createdAt`.
6. **Orders**: `id`, `orderNumber`, `shopId`, `customerId`, `customerName`, `customerEmail`, `status`, `totalAmount`, `pickupSlot`, `pickupTokenHash`, `createdAt`, `updatedAt`.
7. **OrderItems**: `id`, `orderId`, `productId`, `productName`, `quantity`, `unitPrice`, `subtotal`.
8. **PrintJobs**: `id`, `orderId`, `originalFileName`, `storageKey`, `fileMime`, `fileSizeBytes`, `paperSize`, `colorMode`, `sides`, `copies`, `binding`, `lamination`, `calculatedPrice`.
9. **OrderStatusHistory**: `id`, `orderId`, `fromStatus`, `toStatus`, `changedByUserId`, `reason`, `createdAt`.
10. **PickupVerifications**: `id`, `orderId`, `verifiedByUserId`, `verifiedAt`, `method` (`QR_SCAN`, `MANUAL_CODE`).
11. **Subscriptions & Plans**: `id`, `shopId`, `planId`, `status`, `currentPeriodStart`, `currentPeriodEnd`.

---

## 6. Implementation Phases (Milestones)

### Milestone 1: Fix Critical Security Issues [COMPLETED]
- [x] Standardize authentication using JWT and salted password hashing (`bcryptjs`).
- [x] Enforce Role-Based Access Control (RBAC): `ADMIN` / `PLATFORM_ADMIN`, `SHOP_OWNER` / `SHOPKEEPER`, `SHOP_STAFF`, `CUSTOMER`.
- [x] Prevent privilege escalation on registration (reject unauthorized admin creation).
- [x] Remove hardcoded secrets; create `.env.example`, `.env`, and production startup validator for `JWT_SECRET`.
- [x] Eliminate unrestricted public `/uploads` static file exposure; build authenticated document download route (`/api/documents/:orderId`) with customer & shopkeeper authorization checks.
- [x] Implement server-side printing price calculation engine (`pricing.ts`); reject/override client-tampered totals.
- [x] Implement strict Multer file filtering (MIME & extension whitelist, 25MB file size limit, UUID storage keys).
- [x] Add rate limiting middleware for authentication (`/api/auth/*`), order creation, and general API endpoints.
- [x] Implement centralized error handler hiding stack traces and internal secrets in production.
- [x] Implement initial order lifecycle with status transition constraints and atomic single-use pickup verification (`/api/orders/:id/verify-pickup`).
- [x] Created and executed automated test suite: 24 tests passing across pricing engine, auth, RBAC, tamper resistance, document privacy, and pickup verification.
- [x] Updated frontend with authenticated API client (`api.ts`), Authorization Bearer headers, secure document download links, and pickup verification UI.

### Milestone 2: Implement Secure Multi-Tenancy & Database Evolution [COMPLETED]
- [x] Designed comprehensive relational SaaS database schema with 11 tables (`DATABASE_DESIGN.md`) covering users, shops, memberships, categories, products, orders, order items, print jobs, status history, pickup verifications, and migration tracking.
- [x] Migrated from flat `data.json` storage to embedded relational SQLite via Node 24 native `node:sqlite` (`DatabaseSync`), configured with `PRAGMA foreign_keys = ON;` and `PRAGMA journal_mode = WAL;`.
- [x] Created versioned, repeatable migration system (`001_core_saas_schema`, `002_ingest_json_data`) with pre-migration automated backup (`data.backup.<timestamp>.json`), idempotent execution, and zero data loss.
- [x] Preserved existing accounts, shops, orders, and bcrypt password hashes without alteration.
- [x] Implemented strict multi-tenant authorization layer:
  - Shop owners and staff can only view and manage their authorized shop's orders, products, and documents.
  - Customers can only view and download their own orders and documents.
  - Public storefront endpoints return only non-sensitive shop profile data.
  - Platform administrators have system-wide oversight without leaking customer data through public routes.
- [x] Implemented Shop Membership model (`shop_members`) supporting `OWNER` and `STAFF` roles:
  - Shop owners can manage staff memberships (`GET`, `POST`, `DELETE /api/shops/:shopId/staff`).
  - Strict role clamping prevents shop owners from granting platform admin privileges.
  - Removing a staff member revokes their access immediately.
- [x] Implemented scoped Product Catalog & Inventory management (`/api/shops/:shopId/products`).
- [x] Built comprehensive automated multi-tenancy security test suite (`backend/tests/multitenancy.test.ts`):
  - Shop isolation (cross-shop order/document/product protection).
  - Membership authorization & role hierarchy.
  - Identifier tampering defenses (URL & body tampering rejection).
  - Database referential integrity & constraint enforcement (foreign keys, check constraints, cascade deletes).
  - All 49 automated backend tests passing (24 Milestone 1 tests + 25 Milestone 2 tests).
- [x] Verified full backward compatibility with the frontend; zero build or runtime regressions.

### Milestone 3: Build Shop Product & Inventory Management and Customer Storefront [COMPLETED]
- [x] Implemented Shop-Specific Product Catalog & Category Management:
  - Database schema models for `categories` and `products` scoped to `shop_id`.
  - Public endpoints: `GET /api/shops/:shopId/categories`, `GET /api/shops/:shopId/products?availableOnly=true`.
  - Staff/Owner endpoints: `POST /api/shops/:shopId/products`, `PUT /api/shops/:shopId/products/:id`, `POST /api/shops/:shopId/categories`.
  - Owner-only endpoint: `DELETE /api/shops/:shopId/products/:id`.
  - Enforced tenant isolation and verified shop membership using authenticated JWT identity.
- [x] Implemented Server-Side Inventory & Stock Engine:
  - Atomic stock validation preventing overselling and negative inventory (`stock_quantity >= ?`).
  - Strict server-side recalculation of product unit prices and subtotals (ignoring client-submitted unit prices).
  - Transactional rollback on stock exhaustion or validation failure during multi-item checkout.
  - Automated inventory restoration when an order is cancelled or rejected.
- [x] Responsive Single-Shop Customer Shopping Cart:
  - Client cart state manager (`cart.ts`) supporting stationery products and printing services.
  - Sliding Cart Drawer (`CartDrawer.tsx`) with quantity adjustments, removal, subtotal/tax breakdowns, and empty state.
  - Strict single-shop boundary enforcement: cross-shop additions prompt the customer with clear notice before clearing.
  - Real-time cart item count badge integrated into `Navbar.tsx`.
- [x] Unified Checkout & Order Processing:
  - Unified order handler supporting stationery-only, printing-only, and mixed orders.
  - Server validation verifying all products belong strictly to the target shop (cross-shop cart defense).
  - Cryptographically secure order ID (`LP-XXXXXX`) and single-use pickup verification token.
  - Cart automatically cleared upon successful order confirmation.
- [x] Frontend Customer Storefront & Shopkeeper Portal:
  - Customer Storefront (`ShopDetails.tsx`): category navigation pills, dynamic product cards, live stock badges (in stock, low stock warning, out of stock), and quick "Add to Cart" / quantity selectors.
  - Shopkeeper Portal (`Dashboard.tsx`): tabbed view for Orders & Pickups (with stationery and print breakdowns) and Products & Inventory (overview metrics, low-stock alerts, add/edit product modals, and category creation).
  - Updated `BookingSuccess.tsx`, `Bookings.tsx`, and `Print.tsx` for seamless unified order support.
- [x] Automated Test Suite:
  - Built `backend/tests/inventory_cart.test.ts` (15 tests covering authorization, negative price/stock rejection, atomic deduction, rollback on stock exhaustion, price tamper resistance, cross-shop defense, and cancellation stock restoration).
  - All 64 tests passing platform-wide (24 M1 tests + 25 M2 tests + 15 M3 tests). Zero build errors on frontend or backend.

### Milestone 4: Order Lifecycle, Atomic Pickup Verification & In-App Notifications
- [x] Completed full status transition state machine:
  - Allowed progression: `Pending` -> `Accepted` -> `Preparing` -> `Ready for Pickup` -> `Completed`.
  - Cancellation supported from non-terminal states (`Pending`, `Accepted`, `Preparing`, `Ready`).
  - Terminal states (`Completed`, `Cancelled`, `Rejected`) strictly enforced: transitions from terminal states throw errors and prevent race conditions.
  - Immediate write transactions (`BEGIN IMMEDIATE;`) guarantee atomic stock deduction and restoration exactly once.
- [x] In-App Notifications System:
  - SQLite database migration `003_notifications` adding `notifications` table with user, shop, and order indexes.
  - Auto-notification dispatches on: order creation (`ORDER_PLACED` to customer and shop staff), acceptance (`ORDER_ACCEPTED`), preparation (`ORDER_PREPARING`), ready for pickup (`ORDER_READY`), and counter handover (`ORDER_COMPLETED`).
  - Notification endpoints: `GET /api/notifications` (feed), `GET /api/notifications/unread-count` (badge counter), `PATCH /api/notifications/:id/read` (mark single read), `POST /api/notifications/mark-all-read` (bulk read).
  - Frontend `NotificationBell` component in Navbar with real-time polling (8s), unread count pill badge, type-specific badges, relative timestamps, and one-click mark as read.
- [x] Order Lifecycle Tracking & Visual Timeline:
  - `GET /api/orders/:id/timeline` API endpoint returning chronological status transitions, changed-by identities, notes, and timestamps.
  - Frontend `OrderTimelineModal` component with visual step progression bar (`Pending` -> `Accepted` -> `Preparing` -> `Ready` -> `Completed`) and chronological audit trail.
  - Customer Bookings page (`Bookings.tsx`) enhanced with prominent pickup verification code card, status stepper timeline modal, and customer self-cancellation button.
  - Shopkeeper Dashboard (`Dashboard.tsx`) enhanced with granular action buttons (`Accept Order`, `Start Preparing`, `Mark Ready`, `Verify & Hand Over`, `Reject / Cancel`) and timeline modal.
- [x] Automated Testing Suite:
  - Created `backend/tests/notifications_lifecycle.test.ts` (14 tests covering notification creation, multi-tenant isolation, unread counter operations, single/bulk mark as read, timeline authorization, and lifecycle progression).
  - All 85 tests passing across 22 test suites platform-wide. Clean TypeScript compilation on both backend and frontend.

### Milestone 5: SaaS Administration, Subscriptions & Resource Quota Enforcement
- [x] Non-Destructive Database Migration `004_subscriptions_admin_audit`:
  - Created tables: `subscription_plans`, `shop_subscriptions`, `subscription_history`, `admin_audit_logs`.
  - Configurable plan tiers seeded: `plan_trial`, `plan_starter`, `plan_pro`, `plan_enterprise` with explicit staff ceilings, product catalogue limits, and feature definitions.
  - Automatic migration ingest preserving existing shops without data loss.
- [x] Central Backend Entitlement & Quota Enforcement Engine:
  - Centralized entitlements in `repository.getShopEntitlements(shopId)`: live calculation of staff quotas, product counts, and order acceptance gating.
  - Staff limits enforced on `POST /api/shops/:shopId/staff` (owner excluded from quota).
  - Product limits enforced on `POST /api/shops/:shopId/products`.
  - Order acceptance gated on `POST /api/orders`: suspended and expired shops reject new checkout requests (`403 Forbidden`).
  - Sensible expiration/suspension policy: historical order data, receipts, and products are never destroyed; staff and customers can view and fulfill past orders.
  - Shop owners cannot self-elevate or bypass plan limits (all administrative plan changes require `ADMIN` role).
- [x] Platform Administration Portal (`/admin`):
  - Overview KPI cards: Total Shops, Active Shops, Trial Shops, Expired Subscriptions, Suspended Shops, Total Customers, Total Orders, Order Revenue.
  - Shops & Subscriptions directory with search, status filters, and shop performance metrics.
  - Subscription management modal: assign plans, extend trials, suspend/reactivate shops.
  - Subscription Plan Ceiling management: create new custom plans and edit existing plan quotas.
  - Administrative Audit Logs (`admin_audit_logs`): server-side immutable logging of all administrative actions with actor identity, target, timestamp, and details (strictly excluding passwords and tokens).
- [x] Shop Owner Subscription & Billing Page (`/dashboard` Tab 3):
  - Active tier card with monthly rate, status badge, trial expiration countdown, or renewal cycle dates.
  - Live resource usage meters with color-coded progress bars for staff seats and product catalogue items.
  - Plan comparison cards with feature breakdowns and "Request Plan Change" workflow cleanly recording requests for administrator review.
  - Subscription Change History table showing past tier and status transitions, reasons, timestamps, and authorized actors.
- [x] Automated Testing Suite:
  - Created `backend/tests/subscriptions_admin.test.ts` (25 tests covering admin RBAC, plan limits, staff limits, product limits, order gating, audit logs, subscription history, state transitions, and cross-shop isolation).
  - Full platform test suite: 110 tests passing across 31 test suites (0 failures).
  - Clean production builds for both backend (`tsc`) and frontend (`vite build`).

### Milestone 6: Production Hardening, Quality Assurance & Deployment
- Full test suite execution (unit, integration, and security checks).
- Run TypeScript checks and frontend/backend production builds.
- Prepare deployment documentation, security checklists, and environment guides in `README.md`.

---

## 7. Testing Strategy

1. **Automated Unit & Integration Tests**:
   - Authentication & Registration: Password hashing, credential validation, role protection.
   - RBAC & Tenant Isolation: Verify Shop A cannot view or mutate Shop B's orders, products, or files.
   - Pricing Engine: Comprehensive test cases for print options (A4/A3, B&W/Color, single/double, copies, extras) and products.
   - Pickup Verification: Test valid pickup, invalid tokens, duplicate redemption, and status transition constraints.
2. **Security & Vulnerability Tests**:
   - Unauthorized document download attempts.
   - Tampered order price rejection.
   - Rate limiting enforcement on `/api/auth/*`.
3. **Frontend E2E Verification**:
   - Customer booking and order history flow.
   - Shopkeeper dashboard order management and pickup code verification.

---

## 8. Deployment Requirements

1. **Environment Variables**:
   - `PORT`: Server port (default: 5000).
   - `NODE_ENV`: `development` | `production`.
   - `JWT_SECRET`: Minimum 32-character high-entropy secret.
   - `CORS_ORIGIN`: Allowed origins (e.g., `http://localhost:5173` or production domain).
   - `STORAGE_DIR`: Path for private document storage.
2. **Process Management**:
   - Run backend via Node / process manager (PM2 / container).
   - Static asset serving for frontend via CDN or Nginx reverse proxy to `/api`.
3. **Data Backups & Retention**:
   - Automated snapshots of database/data storage.
   - Retention and cleanup policy for temporary document uploads.
