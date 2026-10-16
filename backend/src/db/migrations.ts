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

  // ----------------------------------------------------
  // Migration 003: In-App Notifications Schema
  // ----------------------------------------------------
  if (!appliedMigrations.has("003_notifications")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        shop_id TEXT,
        order_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
    `);

    db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run("003_notifications");
    appliedCount++;
  }

  // ----------------------------------------------------
  // Migration 004: SaaS Subscriptions, Plan Limits & Admin Audit Logs
  // ----------------------------------------------------
  if (!appliedMigrations.has("004_subscriptions_admin_audit")) {
    db.exec(`
      -- 1. Subscription Plans
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        monthly_price REAL NOT NULL DEFAULT 0 CHECK(monthly_price >= 0),
        maximum_staff INTEGER NOT NULL DEFAULT 1 CHECK(maximum_staff >= 1),
        maximum_products INTEGER NOT NULL DEFAULT 10 CHECK(maximum_products >= 0),
        analytics_level TEXT NOT NULL CHECK(analytics_level IN ('BASIC', 'STANDARD', 'ADVANCED')) DEFAULT 'BASIC',
        feature_config_json TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- 2. Shop Subscriptions
      CREATE TABLE IF NOT EXISTS shop_subscriptions (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
        status TEXT NOT NULL CHECK(status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'SUSPENDED', 'CANCELLED')),
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        trial_ends_at TEXT,
        current_period_start TEXT NOT NULL DEFAULT (datetime('now')),
        current_period_end TEXT NOT NULL DEFAULT (datetime('now', '+30 days')),
        cancelled_at TEXT,
        requested_plan_id TEXT REFERENCES subscription_plans(id),
        requested_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id)
      );

      CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_shop ON shop_subscriptions(shop_id);
      CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_status ON shop_subscriptions(status);

      -- 3. Subscription History
      CREATE TABLE IF NOT EXISTS subscription_history (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        from_plan_id TEXT REFERENCES subscription_plans(id),
        to_plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
        from_status TEXT,
        to_status TEXT NOT NULL,
        changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sub_history_shop ON subscription_history(shop_id);
      CREATE INDEX IF NOT EXISTS idx_sub_history_created ON subscription_history(created_at);

      -- 4. Admin Audit Logs
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        actor_name TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL CHECK(target_type IN ('SHOP', 'SUBSCRIPTION', 'PLAN', 'USER')),
        target_id TEXT NOT NULL,
        details_json TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON admin_audit_logs(actor_user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON admin_audit_logs(target_type, target_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON admin_audit_logs(created_at);
    `);

    // Seed default subscription plans
    const insertPlan = db.prepare(`
      INSERT OR IGNORE INTO subscription_plans 
      (id, name, slug, description, monthly_price, maximum_staff, maximum_products, analytics_level, feature_config_json, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    insertPlan.run(
      "plan_trial",
      "14-Day Free Trial",
      "trial",
      "Full access to evaluate LocalPickup for your print shop",
      0,
      2,
      15,
      "BASIC",
      JSON.stringify({ allow_custom_branding: false, allow_volume_discounts: true, allow_priority_queue: true })
    );

    insertPlan.run(
      "plan_starter",
      "Starter Merchant",
      "starter",
      "Essential tools for neighborhood stationery & copy shops",
      499,
      3,
      50,
      "BASIC",
      JSON.stringify({ allow_custom_branding: false, allow_volume_discounts: true, allow_priority_queue: true })
    );

    insertPlan.run(
      "plan_pro",
      "Professional Shop",
      "pro",
      "For busy campus xerox centers and expanding stationery stores",
      1499,
      10,
      250,
      "STANDARD",
      JSON.stringify({ allow_custom_branding: true, allow_volume_discounts: true, allow_priority_queue: true, export_reports: true })
    );

    insertPlan.run(
      "plan_enterprise",
      "Enterprise Fleet",
      "enterprise",
      "High volume fleet operations with dedicated SLA & unlimited scale",
      3999,
      500,
      5000,
      "ADVANCED",
      JSON.stringify({ allow_custom_branding: true, allow_volume_discounts: true, allow_priority_queue: true, export_reports: true, dedicated_support: true })
    );

    // Ingest existing shops into shop_subscriptions
    const existingShops = db.prepare("SELECT * FROM shops").all() as Array<{
      id: string;
      subscription_status: string;
      created_at: string;
    }>;

    const insertSub = db.prepare(`
      INSERT OR IGNORE INTO shop_subscriptions
      (id, shop_id, plan_id, status, started_at, trial_ends_at, current_period_start, current_period_end, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertHistory = db.prepare(`
      INSERT INTO subscription_history
      (id, shop_id, from_plan_id, to_plan_id, from_status, to_status, reason, created_at)
      VALUES (?, ?, NULL, ?, NULL, ?, ?, ?)
    `);

    for (const s of existingShops) {
      const subId = `sub-${s.id}`;
      const startedAt = s.created_at || new Date().toISOString();
      const trialEnds = new Date(new Date(startedAt).getTime() + 14 * 86400000).toISOString();
      const periodEnd = new Date(new Date(startedAt).getTime() + 30 * 86400000).toISOString();

      let planId = "plan_trial";
      let status = "TRIAL";

      if (s.subscription_status === "ACTIVE") {
        planId = "plan_starter";
        status = "ACTIVE";
      } else if (s.subscription_status === "SUSPENDED") {
        planId = "plan_trial";
        status = "SUSPENDED";
      }

      insertSub.run(
        subId,
        s.id,
        planId,
        status,
        startedAt,
        status === "TRIAL" ? trialEnds : null,
        startedAt,
        periodEnd,
        startedAt,
        startedAt
      );

      insertHistory.run(
        `subhist-${s.id}-init`,
        s.id,
        planId,
        status,
        "Initial legacy migration ingest",
        startedAt
      );
    }

    db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run("004_subscriptions_admin_audit");
    appliedCount++;
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
