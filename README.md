# LocalPickup — Multi-Tenant SaaS Platform

LocalPickup is a multi-tenant SaaS platform connecting local printing and stationery shops with customers for pre-ordering and express self-pickup (strictly no delivery).

---

## 1. Quick Start & Setup

### Prerequisites
- Node.js 24+ (uses native embedded `node:sqlite`)
- npm 10+

### Backend Setup
1. Open terminal in the `backend/` directory:
   ```bash
   cd backend
   npm install
   ```
2. Copy environment file and verify configuration:
   ```bash
   cp .env.example .env
   ```
   *Note: In development, `.env` defaults to `PORT=5000` and `DATABASE_PATH=localpickup.db`.*
3. Start the backend development server:
   ```bash
   npm run dev
   ```
   *The database schema and migrations run automatically upon startup. If `backend/data.json` exists, it will be automatically backed up to `backend/data.backup.<timestamp>.json` and ingested cleanly into `localpickup.db`.*

### Frontend Setup
1. Open terminal in the `frontend/` directory:
   ```bash
   cd frontend
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.

---

## 2. Database Architecture & Migrations

LocalPickup uses **embedded SQLite** via Node.js 24 native module (`node:sqlite` / `DatabaseSync`), configured with:
- `PRAGMA foreign_keys = ON;` (Strict referential integrity)
- `PRAGMA journal_mode = WAL;` (High concurrency write-ahead logging)

### Schema Tables
1. **`users`**: Platform accounts with bcrypt password hashes and roles (`ADMIN`, `CUSTOMER`, `SHOP_OWNER`, `SHOP_STAFF`).
2. **`shops`**: Business tenant profiles, contact details, starting rates, ratings, and printing price configs.
3. **`shop_members`**: Multi-tenant association between users and shops with roles (`OWNER`, `STAFF`).
4. **`categories`**: Shop-scoped stationery categories (e.g., "Paper Products", "Writing Supplies").
5. **`products`**: Shop-scoped catalog items with inventory stock tracking (`stock_quantity`, `price`).
6. **`orders`**: Self-pickup customer orders with pickup tokens and status state machine.
7. **`order_items`**: Itemized lines in an order (products or printing jobs).
8. **`print_jobs`**: Document printing parameters (paper size, color mode, sides, copies, binding, lamination) and secure storage references.
9. **`order_status_history`**: Audit trail of every lifecycle transition.
10. **`pickup_verifications`**: Single-use counter pickup verification logs.
11. **`schema_migrations`**: Migration execution registry preventing duplicate runs.

Detailed entity-relationship diagrams and SQL definitions are documented in [DATABASE_DESIGN.md](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/DATABASE_DESIGN.md).

### Migration Procedure
Migrations run automatically on server boot via `backend/src/db/migrations.ts`:
- **Pre-Migration Safety**: Backs up `data.json` to `data.backup.<timestamp>.json`.
- **Idempotency**: Checked against `schema_migrations`.
- **Integrity**: Preserves user accounts, orders, and bcrypt password hashes without alteration.

---

## 3. Role Model & Multi-Tenant Authorization

LocalPickup enforces server-side role-based access control (RBAC) and strict tenant isolation:

| Role | Permissions & Boundaries |
| :--- | :--- |
| **`PLATFORM_ADMIN` / `ADMIN`** | Universal platform oversight, manage all shops, update subscription status, audit all orders. Cannot be self-registered. |
| **`SHOP_OWNER`** | Full management of their assigned shop: edit shop profile, manage stationery catalog and stock, view and update orders, download customer documents, add/remove staff members (`shop_members`). Cannot access other shops' data. |
| **`SHOP_STAFF`** | Operational duties for their assigned shop: view orders, advance order statuses (`Pending` -> `Ready`), verify counter pickup tokens, download customer print documents, view product catalog. Cannot manage shop staff, delete products, or modify other shops. |
| **`CUSTOMER`** | View public shop profiles, place printing and stationery orders, view own booking history, download own uploaded documents. Cannot view or access other customers' orders or any shop back-office APIs. |

### Tenant Isolation Rules
1. **Authoritative JWT Identity**: Identity is extracted strictly from verified JWT tokens on the server. Client-supplied user/customer identifiers in URL or body are ignored for ownership checks.
2. **Shop Scoping**: All queries for shop orders, staff, products, and documents check membership in `shop_members` for the authenticated `req.user.id`. Requests attempting cross-shop access return `403 Forbidden`.
3. **Private Document Storage**: Files are stored with unguessable UUID storage keys and streamed exclusively through authenticated route `/api/documents/:orderId`, verifying customer or shop membership.
4. **Identifier Tampering Defense**: Modifying `shopId`, `orderId`, or `userId` in parameters or payload will result in `403 Forbidden` or `404 Not Found`.

---

## 4. Product Catalogue, Inventory & Shopping Cart (Milestone 3)

LocalPickup supports physical stationery products alongside print bookings:
- **Shop-Scoped Catalogues**: Products and categories are strictly isolated per tenant (`GET /api/shops/:shopId/products`, `GET /api/shops/:shopId/categories`).
- **Atomic Inventory Updates**: Stock validation executes directly against SQLite with atomic quantity checks (`UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?`).
- **Transactional Rollback**: Multi-item cart checkout is wrapped in database transactions; if any item exceeds available inventory, the entire order rolls back and no stock is deducted.
- **Stock Restoration on Cancellation**: When an order transitions to `Cancelled` or `Rejected`, inventory for all physical products is restored automatically.
- **Single-Shop Customer Cart**: Sliding responsive `CartDrawer` with quantity controls, subtotal breakdowns, and single-shop enforcement (cross-shop cart additions prompt for confirmation before resetting).
- **Price Tamper Resistance**: All unit prices, printing options, and subtotals are recalculated strictly on the server; client-submitted totals and prices are discarded.

---

## 5. Order Lifecycle, Atomic Pickup & In-App Notifications (Milestone 4)

LocalPickup provides a complete end-to-end order state machine with real-time in-app alerts and customer tracking:
- **Canonical Lifecycle**:
  - `Pending` $\rightarrow$ `Accepted` $\rightarrow$ `Preparing` $\rightarrow$ `Ready for Pickup` $\rightarrow$ `Completed`.
  - Terminal safety: Orders in terminal states (`Completed`, `Cancelled`, `Rejected`) reject further modifications.
  - Cancellations from active states release reserved inventory exactly once.
- **In-App Notification Center**:
  - `NotificationBell` in the top navigation bar with polling (every 8 seconds), unread counter badge, and slide-down notifications card.
  - Automatic event dispatching:
    - Customer and shop staff alerted upon new order submission (`ORDER_PLACED`).
    - Customer alerted when order is confirmed (`ORDER_ACCEPTED`), print job started (`ORDER_PREPARING`), package ready at counter (`ORDER_READY`), or handed over (`ORDER_COMPLETED`).
  - APIs: `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/mark-all-read`.
- **Order Lifecycle Timeline**:
  - `OrderTimelineModal` renders a visual 5-step progress bar and chronological audit history.
  - Endpoint: `GET /api/orders/:id/timeline` (protected by tenant and customer ownership checks).
- **Atomic Counter Pickup Verification**:
  - Shopkeepers enter the customer's pickup code or order ID on `/dashboard`.
  - Executed inside SQLite immediate write transactions (`BEGIN IMMEDIATE;`) preventing duplicate handovers.

---

## 6. SaaS Administration & Subscription Management (Milestone 5)

LocalPickup includes a comprehensive multi-tenant SaaS management system governing platform oversight, subscription lifecycles, and backend resource entitlement enforcement:

### Subscription Plans & Configurable Quotas
Platform limits are driven by configurable database records in `subscription_plans`:
- **Free Trial (`plan_trial`)**: 14-day evaluation, max 1 staff member, max 15 products, Basic Analytics.
- **Starter Merchant (`plan_starter`)**: ₹499/mo, max 3 staff members, max 50 products, Basic Analytics.
- **Professional Shop (`plan_pro`)**: ₹1,499/mo, max 10 staff members, max 250 products, Standard Analytics, Export Reports.
- **Enterprise Fleet (`plan_enterprise`)**: ₹3,999/mo, max 500 staff members, max 5,000 products, Advanced Analytics, Dedicated Support.

### Shop Subscription Lifecycle
Six canonical states govern shop operational status:
- `TRIAL`: Evaluating features within trial period. If trial ends without plan assignment, shop transitions to `EXPIRED`.
- `ACTIVE`: Fully active shop in good standing. Able to create products, staff, and accept orders up to plan limits.
- `PAST_DUE`: Temporary grace period for billing/renewal issues. Orders still accepted.
- `EXPIRED`: Trial or billing cycle concluded. Storefront pauses new order creation (403 Forbidden). Existing historical orders and records remain intact and readable.
- `SUSPENDED`: Administrative hold (e.g., terms violation or dispute). Storefront paused; new orders rejected (403 Forbidden).
- `CANCELLED`: Shop terminated service. Historical records preserved for accounting/compliance.

### Sensible Expiration & Suspension Policy
- **Zero Data Deletion**: Products, order history, uploaded files, and customer accounts are **never deleted or destroyed** when a subscription expires or is suspended.
- **Order Fulfillment Continuity**: Existing orders placed prior to expiration remain viewable by both customer and shopkeeper, and staff can complete pickup verification.
- **Storefront Order Gating**: `POST /api/orders` checks `repository.getShopEntitlements(shopId).canAcceptOrders`. Suspended or expired shops reject new checkout requests with specific error reasons.

### Resource Quota Enforcement
All plan limits are enforced server-side against authoritative database records inside atomic transactions:
- **Staff Accounts**: `POST /api/shops/:shopId/staff` counts active operational staff members (`role = 'STAFF'`). The shop owner is excluded from the quota. If at or above ceiling, returns `400 Bad Request`.
- **Product Catalogue**: `POST /api/shops/:shopId/products` verifies current active product count against `maximum_products`. Exceeding limits returns `400 Bad Request`.
- **Privilege Separation**: Ordinary shop owners cannot directly modify subscription plans or bypass limits. Plan requests are recorded as `requested_plan_id` for administrative review.

### Platform Admin Portal (`/admin`)
- **System KPIs**: Live counters for total shops, active shops, trial shops, expired subscriptions, suspended shops, total customers, total orders, and gross platform order value.
- **Shop Directory**: Search and filter by name, owner, and subscription status (`ALL`, `TRIAL`, `ACTIVE`, `PAST_DUE`, `EXPIRED`, `SUSPENDED`, `CANCELLED`).
- **Subscription Management**: Assign plans, modify active status, extend trials (by days or direct ISO date), and inspect shop-specific performance statistics.
- **Plan Ceiling Controls**: View active plan subscriber counts, create new custom plans with flexible limits, and update existing plan quotas.
- **Administrative Audit Logs (`admin_audit_logs`)**: Immutable server-side logging of all administrative actions with actor identity, action type, target ID, client IP, and structured details (strictly excluding passwords and tokens).

### Shop Owner Subscription & Billing (`/dashboard` Tab 3)
- **Active Plan Card**: Shows current tier name, monthly price, status badge, trial expiration countdown, or renewal cycle dates.
- **Live Resource Meters**: Visual progress bars showing staff quota usage and product catalog count against plan ceilings.
- **Plan Upgrade / Downgrade Requests**: Cards for available tiers with feature breakdowns. Clicking "Request Plan Change" queues an official upgrade request for admin approval.
- **Subscription Change History**: Chronological table displaying all past tier and status transitions, reasons, timestamps, and authorized actors.

### Billing Boundaries (Features Not Yet Implemented)
- **No Fake Payments**: LocalPickup does not charge mock credit cards or pretend third-party transactions occurred. Plan requests follow an administrator-managed review and activation workflow.
- **Future Integration**: The architecture is prepared for payment gateway integration (Stripe, Razorpay, or automated recurring billing) via clean separation between `requested_plan_id`, `plan_id`, and `status`.

---

## 7. Automated Testing

The backend includes a comprehensive automated test suite verifying security, multi-tenancy, inventory atomicity, pricing logic, and SaaS administration:

```bash
cd backend
npm test
```

### Test Suites (110 Tests Total Across 31 Suites — 100% Pass)
- **Milestone 5 SaaS Administration & Subscription Management Suite** (`backend/tests/subscriptions_admin.test.ts` - 25 tests):
  - Platform Admin Authorization: Blocks unauthenticated access (401), customer access (403), and shopkeeper access (403) to admin endpoints; allows platform admin.
  - Billing Boundaries: Shop owner plan requests record `requested_plan_id` without unauthorized self-elevation; non-existent plan requests rejected (404).
  - Cross-Shop Isolation: Shop A cannot view Shop B's subscription or request plan changes (403); customers blocked from subscription data (403).
  - Staff Quota Enforcement: Allows adding staff up to ceiling; blocks additions beyond plan limits (400); verifies live entitlements API meters.
  - Product Quota Enforcement: Allows creating products up to plan ceiling; rejects creations beyond limit (400).
  - Suspended & Expired Restrictions: Admin suspension/expiration immediately blocks new orders (403); existing orders remain viewable and fulfillable; reactivating shop restores order intake.
  - Admin Audit Logs & Subscription History: Admin operations generate structured audit log entries without sensitive credentials; history table preserves all transitions.
  - State Transitions: Rejects invalid status strings (400); supports trial extensions by admin.
- **Milestone 4 Order Lifecycle, Notifications & Timeline Suite** (`backend/tests/notifications_lifecycle.test.ts` - 14 tests):
  - In-app notification creation on order placement (for both customer and shopkeeper).
  - Progressive lifecycle notifications (`Accepted`, `Preparing`, `Ready`, `Completed`).
  - Unread notification count tracking, single mark-as-read, and mark-all-read operations.
  - Security & tenant isolation: Customer B cannot read or mark Customer A's notifications (404/401).
  - Chronological timeline history and cross-tenant view authorization checks.
- **Milestone 6 End-to-End Customer Journey & Production Hardening Suite** (`backend/tests/e2e_journey.test.ts` - 21 tests):
  - 17-Step Mixed Self-Pickup Journey: Customer registration, shop selection, stationery catalog browsing, cart addition, document upload, print configuration, server price verification, order confirmation with pickup token, timeline and in-app notifications, shopkeeper order acceptance, preparation, marking ready, physical counter visit, atomic single-use code verification, completion, and inventory verification.
  - Stationery-Only Order & Single-Restoration Integrity: Decrements stock on order, rejects unauthorized customer status modifications (403), restores stock exactly once upon cancellation/rejection, prevents duplicate stock restoration, and rejects ordinary status updates on completed orders.
  - Print-Only Order & Document Access Controls: Uploads and isolates customer PDF, allows download only to placing customer and assigned shop staff, and blocks unauthorized cross-customer download attempts (403).
  - Production Security Headers & Date-Driven Expiration: Verifies delivery of OWASP headers (`nosniff`, `DENY`, HSTS, CSP), verifies `X-Powered-By` header is stripped, and guarantees subscription expiration is enforced by actual timestamps (`current_period_end < Date.now()`).
- **Milestone 5 SaaS Administration & Subscription Management Suite** (`backend/tests/subscriptions_admin.test.ts` - 25 tests):
  - Platform Administration RBAC: Blocks unauthorized access to admin APIs (401/403), allows platform admin to manage shops, tiers, and platform KPI metrics.
  - Subscription Boundaries: Shop owner plan change requests only record `requested_plan_id` without self-elevation; rejects nonexistent plans (404).
  - Cross-Shop Isolation: Prevents Shop 1 Owner from accessing Shop 2 subscription details (403).
  - Quota Enforcement: Atomic staff ceilings (`addShopMemberWithQuota`) and product catalog ceilings (`createProductWithQuota`).
  - Suspension & Expiration: Suspended and expired shops reject new customer orders (403), existing orders remain accessible, reactivating shop restores order acceptance.
  - Admin Audit Logs: Administrative mutations generate structured audit log entries.
- **Milestone 4 Order Lifecycle, Notifications & Timeline Test Suite** (`backend/tests/notifications_lifecycle.test.ts` - 14 tests):
  - In-app notification creation for customer and shop staff upon order placement.
  - Granular lifecycle transitions: `Pending` -> `Accepted` -> `Preparing` -> `Ready` -> `Completed`.
  - Notification unread counters and read status mutation.
  - Cross-tenant notification isolation (401/404/denied).
  - Chronological timeline history and cross-tenant view authorization checks.
- **Milestone 3 Product Catalogue, Inventory & Cart Suite** (`backend/tests/inventory_cart.test.ts` - 15 tests):
  - Product Catalog & Authorization: Public customer listing, staff product creation, customer creation rejection (403), tenant isolation between shop owners, staff delete prevention (owner-only), negative price and stock rejection.
  - Inventory Management & Validation: Excess quantity rejection, invalid quantity validation, atomic stock deduction on order, repeated cancellation/rejection idempotency, concurrent updates safety.
  - Cart & Cross-Shop Defense: Server-side price tamper override, cross-shop cart submission rejection, unified orders combining printing and stationery, complete rollback on inventory exhaustion.
- **Milestone 2 Multi-Tenancy & Database Security Suite** (`backend/tests/multitenancy.test.ts` - 25 tests):
  - Cross-Shop Isolation: Shop A cannot view, modify, or leak Shop B orders, documents, or products.
  - Membership Authorization & Hierarchy: Shop staff can perform operations; revoked staff immediately lose access; role clamping prevents privilege escalation to admin.
  - Identifier Tampering Defense: Tampering `orderId` or `shopId` in URL/body is rejected.
  - Database Referential Integrity: Foreign keys reject nonexistent shops; CHECK constraints reject negative prices/stocks; duplicate memberships rejected; cascade deletes verified.
- **Milestone 1 Security Suite** (`backend/tests/security.test.ts` - 25 tests):
  - Uniform auth errors, enumeration protection, public registration role clamp.
  - RBAC checks for customer, shopkeeper, and platform admin.
  - Server-calculated price tamper resistance.
  - Private document streaming access controls.
  - Order status transitions and atomic single-use pickup verification.
- **Pricing Engine Suite** (`backend/tests/pricing.test.ts` - 6 tests):
  - Document parameter validation (A4/A3, B&W/colour, duplex, binding, lamination).

**Total Verified Test Count: 131 tests passing across 36 test suites (0 failures, 0 skipped).**

### Database Backup & Recovery Commands
- Take a consistent snapshot backup of database and print documents:
  ```bash
  cd backend
  npm run backup
  ```
- Run isolated test recovery verification (verifies SHA-256 and `PRAGMA integrity_check` without touching live database):
  ```bash
  cd backend
  npm run restore:verify
  ```

### Production Build
- Backend TypeScript compilation:
  ```bash
  cd backend
  npm run build
  ```
- Frontend TypeScript & Vite build:
  ```bash
  cd frontend
  npm run build
  ```

For detailed production setup, process management, reverse proxy configuration, and disaster recovery runbooks, refer to:
- [DEPLOYMENT.md](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/DEPLOYMENT.md)
- [BACKUP_AND_RECOVERY.md](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/BACKUP_AND_RECOVERY.md)
- [SECURITY_CHECKLIST.md](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/SECURITY_CHECKLIST.md)


---

## 8. Seed Accounts & Manual Testing Guide

| Account Role | Email | Password | Shop Association |
| :--- | :--- | :--- | :--- |
| **Platform Admin** | `admin@localpickup.com` | `password123` | Global Platform Oversight |
| **Shop 1 Owner** | `shop1@abc.com` | `password123` | QuickPrint Central (Shop 1) |
| **Customer** | `customer@gmail.com` | `password123` | Standard Customer Account |

### Manual Verification Workflows

1. **Platform Administration Flow (`/admin`)**:
   - Log in as Platform Admin (`admin@localpickup.com` / `password123`).
   - Navigate to `http://localhost:5173/admin`.
   - Review platform KPI cards (Total Shops, Active Shops, Trial Shops, Expired Subscriptions, Suspended Shops, Orders, Revenue).
   - In **Shops & Subscriptions**:
     - Search for "QuickPrint" or filter by status (`ACTIVE`, `TRIAL`, `SUSPENDED`).
     - Click **Manage Subscription** on a shop:
       - Change subscription plan (e.g. from Starter to Pro) with a note.
       - Extend trial period by 14 days.
       - Toggle shop status to `SUSPENDED` and notice the status update.
   - In **Subscription Plans**:
     - Review active tiers and subscriber counts.
     - Click **+ Create New Plan** to add a custom tier with custom staff and product ceilings.
   - In **Administrative Audit Logs**:
     - Verify your recent plan assignments and status changes are recorded with timestamp, target ID, actor name, and metadata.

2. **Shop Owner Subscription & Billing Flow (`/dashboard`)**:
   - Log in as Shopkeeper (`shop1@abc.com` / `password123`).
   - Navigate to `http://localhost:5173/dashboard`.
   - Click the **💳 Subscription & Plan** tab:
     - Review active tier badge, monthly rate, and status.
     - Review live resource usage progress bars for **Staff Accounts** and **Product Catalogue**.
     - Review available tiers in the comparison cards.
     - Click **Request Plan Change** on an available plan. Observe the pending request banner appear.
     - Review the **Subscription Change History** table showing historical plan transitions and administrator reasons.

3. **Shopkeeper Inventory Management & Pickup Verification**:
   - On `/dashboard`, open **Products & Inventory**:
     - Review total products, inventory units, and low-stock alerts.
     - Click **+ Add Product** to add a stationery item (enforces plan limit).
     - Click **Edit** on an existing product to update price, stock level, or availability.
   - Switch to **Orders & Pickups**:
     - Review incoming orders showing both stationery items and print jobs.
     - Click **Mark Ready for Pickup**.
     - Enter the customer's pickup code and click **Verify & Hand Over** to atomically complete the order.

4. **Customer Catalogue & Shopping Cart Flow**:
   - Log in as Customer (`customer@gmail.com` / `password123`).
   - Navigate to `http://localhost:5173/shops/1`.
   - Browse stationery items, check live stock badges, and click **Add to Cart**.
   - Open the slide-over `CartDrawer` via the navbar icon.
   - Proceed to `/pickup`, choose a pickup time slot, and click **Confirm Booking**.
   - Review the booking confirmation on `/booking-success` with pickup code and QR code.

