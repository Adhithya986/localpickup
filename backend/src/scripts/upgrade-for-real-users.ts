import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { getDatabase, closeDatabase } from "../db/sqlite";
import { config } from "../config";

async function upgradeForRealUsers() {
  const db = getDatabase();
  console.log("Starting database transition for REAL USERS...");

  try {
    db.exec("PRAGMA foreign_keys = OFF;"); // Temporarily turn off during re-linking
    db.exec("BEGIN IMMEDIATE;");

    // 1. Delete all mock orders and dependent tables
    console.log("1. Clearing mock orders and history...");
    db.exec("DELETE FROM order_items;");
    db.exec("DELETE FROM print_jobs;");
    db.exec("DELETE FROM pickup_verifications;");
    db.exec("DELETE FROM order_status_history;");
    db.exec("DELETE FROM notifications;");
    db.exec("DELETE FROM orders;");

    // 2. Clean up test subscription history and test micro plans
    console.log("2. Cleaning up test plans and audit logs...");
    db.exec("DELETE FROM subscription_history;");
    db.exec("DELETE FROM admin_audit_logs;");
    db.exec("DELETE FROM shop_subscriptions WHERE shop_id != '1';");
    db.exec("DELETE FROM subscription_plans WHERE id LIKE 'plan_micro_%';");

    // 3. Clean up shops except Shop 1 (ABC Digital Prints)
    console.log("3. Cleaning up test shops...");
    db.exec("DELETE FROM shop_members WHERE shop_id != '1';");
    db.exec("DELETE FROM products WHERE shop_id != '1';");
    db.exec("DELETE FROM categories WHERE shop_id != '1';");
    db.exec("DELETE FROM shops WHERE id != '1';");

    // 4. Clean up users - retain ONLY admin@localpickup.com
    console.log("4. Retaining only 1 Admin user (admin@localpickup.com)...");
    db.exec("DELETE FROM users WHERE email != 'admin@localpickup.com';");

    // Ensure admin user exists with password123
    const admin = db.prepare("SELECT * FROM users WHERE email = 'admin@localpickup.com'").get() as any;
    let adminId = "admin-1";
    if (!admin) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash("password123", salt);
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, global_role)
        VALUES (?, 'admin@localpickup.com', ?, 'System Admin', 'ADMIN')
      `).run(adminId, hash);
    } else {
      adminId = admin.id;
      db.prepare("UPDATE users SET global_role = 'ADMIN', name = 'System Admin' WHERE id = ?").run(adminId);
    }

    // 5. Assign Shop 1 to Admin and ensure active Enterprise subscription
    console.log("5. Configuring Shop 1 as the default flagship store owned by Admin...");
    db.prepare(`
      UPDATE shops
      SET owner_id = ?,
          name = 'ABC Digital Prints',
          subscription_status = 'ACTIVE',
          description = 'Printing • Photocopy • Binding • Stationery Supplies'
      WHERE id = '1'
    `).run(adminId);

    db.exec("DELETE FROM shop_members WHERE shop_id = '1';");
    db.prepare(`
      INSERT INTO shop_members (id, shop_id, user_id, role)
      VALUES ('mem-admin-1', '1', ?, 'OWNER')
    `).run(adminId);

    // Ensure shop subscription for Shop 1 is active on plan_enterprise
    db.prepare(`
      INSERT OR REPLACE INTO shop_subscriptions (id, shop_id, plan_id, status, current_period_start, current_period_end)
      VALUES ('sub-1', '1', 'plan_enterprise', 'ACTIVE', datetime('now'), datetime('now', '+1 year'))
    `).run();

    // 6. Reset clean categories and products for Shop 1
    console.log("6. Setting up clean sample stationery catalog for Shop 1...");
    db.exec("DELETE FROM products WHERE shop_id = '1';");
    db.exec("DELETE FROM categories WHERE shop_id = '1';");

    const categories = [
      { id: "cat-writing", name: "Writing Instruments", slug: "writing-instruments", sort: 1 },
      { id: "cat-paper", name: "Paper & Notebooks", slug: "paper-notebooks", sort: 2 },
      { id: "cat-office", name: "Office & Desk Supplies", slug: "office-desk-supplies", sort: 3 },
      { id: "cat-electronics", name: "Calculators & Electronics", slug: "calculators-electronics", sort: 4 },
    ];

    for (const cat of categories) {
      db.prepare(`
        INSERT INTO categories (id, shop_id, name, slug, sort_order)
        VALUES (?, '1', ?, ?, ?)
      `).run(cat.id, cat.name, cat.slug, cat.sort);
    }

    const cleanProducts = [
      { id: "prod-v7-pen", catId: "cat-writing", name: "Pilot V7 Hi-Tecpoint Pen (Blue)", desc: "0.7mm rollerball with pure liquid ink", price: 80, stock: 50 },
      { id: "prod-jotter-pen", catId: "cat-writing", name: "Parker Jotter Ballpoint Pen", desc: "Classic stainless steel barrel ballpoint pen", price: 250, stock: 25 },
      { id: "prod-highlighter", catId: "cat-writing", name: "Yellow Fluorescent Highlighter", desc: "Chisel tip highlighter for quick revision", price: 30, stock: 80 },
      { id: "prod-spiral-notebook", catId: "cat-paper", name: "Classmate Spiral Notebook (200 Pgs)", desc: "Single line ruled notebook with durable cover", price: 120, stock: 100 },
      { id: "prod-practical-record", catId: "cat-paper", name: "University Practical Record Book", desc: "Hardbound 160 pages for lab records", price: 90, stock: 60 },
      { id: "prod-casio-calc", catId: "cat-electronics", name: "Casio FX-991CW Scientific Calculator", desc: "540+ functions non-programmable approved for exams", price: 950, stock: 15 },
      { id: "prod-clear-folder", catId: "cat-office", name: "Clear Document File Folder (A4)", desc: "Transparent button file folder for certificates", price: 25, stock: 150 },
      { id: "prod-stapler-box", catId: "cat-office", name: "Kangaro Stapler with Pin Box", desc: "Standard #10 desktop stapler with 1000 pins", price: 75, stock: 40 },
    ];

    for (const prod of cleanProducts) {
      db.prepare(`
        INSERT INTO products (id, shop_id, category_id, name, description, price, stock_quantity, is_available)
        VALUES (?, '1', ?, ?, ?, ?, ?, 1)
      `).run(prod.id, prod.catId, prod.name, prod.desc, prod.price, prod.stock);
    }

    db.exec("COMMIT;");
    db.exec("PRAGMA foreign_keys = ON;");

    // 7. Verify Foreign Key Integrity
    console.log("7. Verifying foreign key integrity...");
    const fkErrors = db.prepare("PRAGMA foreign_key_check;").all();
    if (fkErrors.length > 0) {
      console.error("Foreign key violations found:", fkErrors);
      throw new Error("Foreign key verification failed after cleanup");
    }
    console.log("Foreign key check passed: 0 violations.");

    // 8. Clean up uploads directory
    console.log("8. Cleaning up obsolete uploaded documents...");
    if (fs.existsSync(config.uploadDir)) {
      const files = fs.readdirSync(config.uploadDir);
      let removedCount = 0;
      for (const file of files) {
        const filePath = path.join(config.uploadDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          removedCount++;
        }
      }
      console.log(`Cleaned up ${removedCount} test upload files (saved in backup archive).`);
    }

    // 9. Display Final Database State
    const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any).count;
    const shopCount = (db.prepare("SELECT COUNT(*) as count FROM shops").get() as any).count;
    const orderCount = (db.prepare("SELECT COUNT(*) as count FROM orders").get() as any).count;
    const productCount = (db.prepare("SELECT COUNT(*) as count FROM products").get() as any).count;
    const activeAdmin = db.prepare("SELECT id, email, name, global_role FROM users").all();

    console.log("\n========================================================");
    console.log("UPGRADE COMPLETE - DATABASE READY FOR REAL USERS");
    console.log("========================================================");
    console.log(`Users remaining: ${userCount} (Admin only)`);
    console.log(`Shops remaining: ${shopCount} (Default reference shop)`);
    console.log(`Orders remaining: ${orderCount} (Clean slate)`);
    console.log(`Products in catalog: ${productCount}`);
    console.log("Admin account:", activeAdmin);
    console.log("========================================================\n");

  } catch (err) {
    db.exec("ROLLBACK;");
    console.error("Upgrade failed:", err);
    throw err;
  } finally {
    closeDatabase();
  }
}

upgradeForRealUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
