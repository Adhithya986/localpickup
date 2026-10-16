import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

export interface MigrationSummary {
  appliedCount: number;
  usersMigrated: number;
  shopsMigrated: number;
  ordersMigrated: number;
  productsCreated: number;
  backupPath?: string;
}

export function runMigrations(db: DatabaseSync): MigrationSummary {
  // Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedMigrations = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as Array<{ name: string }>).map((r) => r.name)
  );

  let appliedCount = 0;
  let usersMigrated = 0;
  let shopsMigrated = 0;
  let ordersMigrated = 0;
  let productsCreated = 0;
  let backupPath: string | undefined;

  // ----------------------------------------------------
  // Migration 001: Core SaaS Relational Schema
  // ----------------------------------------------------
  if (!appliedMigrations.has("001_core_saas_schema")) {
    db.exec(`
      -- Users Table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        global_role TEXT NOT NULL CHECK(global_role IN ('ADMIN', 'PLATFORM_ADMIN', 'CUSTOMER', 'SHOP_OWNER', 'SHOPKEEPER', 'SHOP_STAFF')) DEFAULT 'CUSTOMER',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      -- Shops Table
      CREATE TABLE IF NOT EXISTS shops (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        description TEXT,
        distance TEXT,
        price_starting TEXT,
        rating REAL DEFAULT 5.0,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        subscription_status TEXT NOT NULL CHECK(subscription_status IN ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED')) DEFAULT 'TRIAL',
        address TEXT,
        phone TEXT,
        pricing_config_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);

      -- Shop Memberships (Staff & Owner access control)
      CREATE TABLE IF NOT EXISTS shop_members (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('OWNER', 'STAFF')) DEFAULT 'STAFF',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_shop_members_user ON shop_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_shop_members_shop ON shop_members(shop_id);

      -- Categories Table
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, slug)
      );

      CREATE INDEX IF NOT EXISTS idx_categories_shop ON categories(shop_id);

      -- Products Table (Physical stationery products)
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL CHECK(price >= 0),
        stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
        is_available INTEGER NOT NULL DEFAULT 1 CHECK(is_available IN (0, 1)),
        image_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

      -- Orders Table
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
        customer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        customer_name TEXT,
        customer_email TEXT,
        pickup_time TEXT NOT NULL,
        pickup_token TEXT NOT NULL,
        pickup_token_hash TEXT NOT NULL,
        total_amount REAL NOT NULL CHECK(total_amount >= 0),
        status TEXT NOT NULL CHECK(status IN ('Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Rejected', 'Cancelled')) DEFAULT 'Pending',
        verified_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        verified_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      -- Order Items Table
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        item_type TEXT NOT NULL CHECK(item_type IN ('PRODUCT', 'PRINT_JOB')),
        title TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity >= 1),
        unit_price REAL NOT NULL CHECK(unit_price >= 0),
        subtotal REAL NOT NULL CHECK(subtotal >= 0)
      );

      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

      -- Print Jobs Table
      CREATE TABLE IF NOT EXISTS print_jobs (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        order_item_id TEXT REFERENCES order_items(id) ON DELETE CASCADE,
        original_file_name TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_mime TEXT,
        file_size_bytes INTEGER,
        paper_size TEXT NOT NULL CHECK(paper_size IN ('A4', 'A3')),
        color_mode TEXT NOT NULL CHECK(color_mode IN ('bw', 'colour')),
        sides TEXT NOT NULL CHECK(sides IN ('single', 'double')),
        copies INTEGER NOT NULL CHECK(copies >= 1),
        binding INTEGER NOT NULL DEFAULT 0 CHECK(binding IN (0, 1)),
        lamination INTEGER NOT NULL DEFAULT 0 CHECK(lamination IN (0, 1)),
        calculated_price REAL NOT NULL CHECK(calculated_price >= 0)
      );

      CREATE INDEX IF NOT EXISTS idx_print_jobs_order ON print_jobs(order_id);

      -- Order Status History Table
      CREATE TABLE IF NOT EXISTS order_status_history (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        changed_by_name TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history(order_id);

      -- Pickup Verifications Table
      CREATE TABLE IF NOT EXISTS pickup_verifications (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        verified_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        verified_by_name TEXT NOT NULL,
        verified_at TEXT NOT NULL DEFAULT (datetime('now')),
        method TEXT NOT NULL CHECK(method IN ('MANUAL_CODE', 'QR_SCAN')) DEFAULT 'MANUAL_CODE'
      );
    `);

    db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run("001_core_saas_schema");
    appliedCount++;
  }

  // ----------------------------------------------------
  // Migration 002: Ingest and Preserve Existing Data from data.json
  // ----------------------------------------------------
  if (!appliedMigrations.has("002_ingest_json_data")) {
    const jsonPath = path.resolve(__dirname, "..", "..", "data.json");
    if (fs.existsSync(jsonPath)) {
      // 1. Back up existing data.json before reading
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupPath = path.resolve(__dirname, "..", "..", `data.backup.${timestamp}.json`);
      fs.copyFileSync(jsonPath, backupPath);

      const rawJson = fs.readFileSync(jsonPath, "utf-8");
      const jsonData = JSON.parse(rawJson);

      const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users (id, email, password_hash, name, global_role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertShop = db.prepare(`
        INSERT OR IGNORE INTO shops (id, name, slug, description, distance, price_starting, rating, owner_id, subscription_status, pricing_config_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMember = db.prepare(`
        INSERT OR IGNORE INTO shop_members (id, shop_id, user_id, role, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertCategory = db.prepare(`
        INSERT OR IGNORE INTO categories (id, shop_id, name, slug, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertProduct = db.prepare(`
        INSERT OR IGNORE INTO products (id, shop_id, category_id, name, description, price, stock_quantity, is_available)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertOrder = db.prepare(`
        INSERT OR IGNORE INTO orders (id, shop_id, customer_id, customer_email, pickup_time, pickup_token, pickup_token_hash, total_amount, status, verified_by_user_id, verified_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertOrderItem = db.prepare(`
        INSERT OR IGNORE INTO order_items (id, order_id, product_id, item_type, title, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertPrintJob = db.prepare(`
        INSERT OR IGNORE INTO print_jobs (id, order_id, order_item_id, original_file_name, storage_key, file_path, file_mime, file_size_bytes, paper_size, color_mode, sides, copies, binding, lamination, calculated_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertHistory = db.prepare(`
        INSERT OR IGNORE INTO order_status_history (id, order_id, from_status, to_status, changed_by_name, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertVerification = db.prepare(`
        INSERT OR IGNORE INTO pickup_verifications (id, order_id, verified_by_user_id, verified_by_name, verified_at, method)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Begin transaction for atomic data migration
      db.exec("BEGIN TRANSACTION;");

      try {
        // A. Users
        if (Array.isArray(jsonData.users)) {
          for (const u of jsonData.users) {
            insertUser.run(
              u.id,
              u.email.toLowerCase().trim(),
              u.password || "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012",
              u.name,
              u.role || "CUSTOMER",
              u.createdAt || new Date().toISOString(),
              u.createdAt || new Date().toISOString()
            );
            usersMigrated++;
          }
        }

        // B. Shops
        if (Array.isArray(jsonData.shops)) {
          for (const s of jsonData.shops) {
            const ownerId = s.ownerId || "shop-1";
            insertShop.run(
              s.id,
              s.name,
              s.slug || `shop-${s.id}`,
              s.description || "",
              s.distance || "",
              s.price || "From ₹2",
              parseFloat(s.rating) || 5.0,
              ownerId,
              s.subscriptionStatus || "ACTIVE",
              JSON.stringify(s.pricingConfig || {
                a4BwPrice: 2,
                a4ColourPrice: 5,
                a3BwPrice: 4,
                a3ColourPrice: 7,
                doubleSideDiscount: 1,
                bindingPrice: 20,
                laminationPrice: 10,
              }),
              new Date().toISOString()
            );

            // Create owner membership
            insertMember.run(`mem-${s.id}-${ownerId}`, s.id, ownerId, "OWNER", new Date().toISOString());

            // Create initial categories & sample stationery products
            const printCatId = `cat-${s.id}-printing`;
            const statCatId = `cat-${s.id}-stationery`;
            insertCategory.run(printCatId, s.id, "Document Printing", "printing", 1);
            insertCategory.run(statCatId, s.id, "Stationery & Supplies", "stationery", 2);

            // Add standard stationery products for the shop
            const sampleProducts = [
              { name: "Ballpoint Pen (Blue)", desc: "Smooth ink 0.7mm tip", price: 10, stock: 100 },
              { name: "Ballpoint Pen (Black)", desc: "Quick-drying black ink", price: 10, stock: 100 },
              { name: "Ruled Notebook (200 Pages)", desc: "A4 spiral softbound", price: 60, stock: 50 },
              { name: "Practical Record Book", desc: "Hardbound college lab record book", price: 90, stock: 40 },
              { name: "Document Stick File", desc: "Transparent folder for submissions", price: 15, stock: 80 },
            ];

            for (let i = 0; i < sampleProducts.length; i++) {
              const sp = sampleProducts[i];
              insertProduct.run(
                `prod-${s.id}-${i + 1}`,
                s.id,
                statCatId,
                sp.name,
                sp.desc,
                sp.price,
                sp.stock,
                1
              );
              productsCreated++;
            }

            shopsMigrated++;
          }
        }

        // C. Orders
        if (Array.isArray(jsonData.orders)) {
          for (const o of jsonData.orders) {
            const pickupToken = o.pickupToken || o.id.replace("LP-", "") || "CODE123";
            const tokenHash = o.pickupTokenHash || "hash";
            const verifiedUserId = o.verifiedBy?.includes("(") ? o.verifiedBy.split("(")[1].replace(")", "").trim() : "shop-1";

            insertOrder.run(
              o.id,
              o.shopId || "1",
              o.customerId || null,
              o.customerEmail || null,
              o.pickupTime || "8:00 PM",
              pickupToken,
              tokenHash,
              o.total || 0,
              o.status || "Pending",
              o.verifiedAt ? verifiedUserId : null,
              o.verifiedAt || null,
              o.createdAt || new Date().toISOString(),
              o.updatedAt || o.createdAt || new Date().toISOString()
            );

            // Create Order Item
            const orderItemId = `item-${o.id}-1`;
            insertOrderItem.run(
              orderItemId,
              o.id,
              null,
              "PRINT_JOB",
              `Document Print (${o.paper || "A4"}, ${o.colour === "colour" ? "Color" : "B&W"})`,
              o.copies || 1,
              o.total || 0,
              o.total || 0
            );

            // Create Print Job
            insertPrintJob.run(
              `job-${o.id}-1`,
              o.id,
              orderItemId,
              o.fileName || "document.pdf",
              o.storageKey || path.basename(o.filePath || "file.pdf"),
              o.filePath || `/api/documents/${o.id}`,
              o.fileMime || "application/pdf",
              o.fileSizeBytes || 1024,
              o.paper || "A4",
              o.colour || "bw",
              o.sides || "single",
              o.copies || 1,
              o.binding ? 1 : 0,
              o.lamination ? 1 : 0,
              o.total || 0
            );

            // Order status history
            if (Array.isArray(o.statusHistory)) {
              for (let hIdx = 0; hIdx < o.statusHistory.length; hIdx++) {
                const h = o.statusHistory[hIdx];
                insertHistory.run(
                  `hist-${o.id}-${hIdx}`,
                  o.id,
                  null,
                  h.status,
                  h.changedBy || "System",
                  h.note || "",
                  h.changedAt || o.createdAt || new Date().toISOString()
                );
              }
            } else {
              insertHistory.run(
                `hist-${o.id}-0`,
                o.id,
                null,
                o.status || "Pending",
                "System",
                "Initial order record",
                o.createdAt || new Date().toISOString()
              );
            }

            // Pickup verification record if completed
            if (o.status === "Completed" && o.verifiedAt) {
              insertVerification.run(
                `ver-${o.id}`,
                o.id,
                verifiedUserId,
                o.verifiedBy || "Shop Staff",
                o.verifiedAt,
                "MANUAL_CODE"
              );
            }

            ordersMigrated++;
          }
        }

        db.exec("COMMIT;");
        db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run("002_ingest_json_data");
        appliedCount++;
      } catch (err) {
        db.exec("ROLLBACK;");
        throw err;
      }
    }
  }

  return {
    appliedCount,
    usersMigrated,
    shopsMigrated,
    ordersMigrated,
    productsCreated,
    backupPath,
  };
}
