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

## 4. Automated Testing

The backend includes a comprehensive automated test suite verifying security, multi-tenancy, and pricing logic:

```bash
cd backend
npm test
```

### Test Suites (49 Tests Total)
- **Milestone 2 Multi-Tenancy & Database Security Suite** (`backend/tests/multitenancy.test.ts`):
  - **Cross-Shop Isolation**: Shop A cannot view, modify, or leak Shop B orders, documents, or products.
  - **Membership Authorization & Hierarchy**: Shop staff can perform operations; revoked staff immediately lose access; role clamping prevents privilege escalation to admin.
  - **Identifier Tampering Defense**: Tampering `orderId` or `shopId` in URL/body is rejected.
  - **Database Referential Integrity**: Foreign keys reject nonexistent shops; CHECK constraints reject negative prices/stocks; duplicate memberships rejected; cascade deletes verified.
- **Milestone 1 Security Suite** (`backend/tests/security.test.ts`):
  - Uniform auth errors, enumeration protection, public registration role clamp.
  - RBAC checks for customer, shopkeeper, and platform admin.
  - Server-calculated price tamper resistance.
  - Private document streaming access controls.
  - Order status transitions and atomic single-use pickup verification.
- **Pricing Engine Suite** (`backend/tests/pricing.test.ts`):
  - Document parameter validation (A4/A3, B&W/colour, duplex, binding, lamination).

### Compiling Backend & Frontend
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

---

## 5. Seed Accounts for Manual Testing

| Account Role | Email | Password | Shop Association |
| :--- | :--- | :--- | :--- |
| **Platform Admin** | `admin@localpickup.com` | `password123` | Global Platform |
| **Shop 1 Owner** | `shop1@abc.com` | `password123` | QuickPrint Central (Shop 1) |
| **Customer** | `customer@gmail.com` | `password123` | Customer |
