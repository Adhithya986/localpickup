import { describe, it, before } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { app } from "../src/app";
import { repository, readDB } from "../src/database";
import { getDatabase } from "../src/db/sqlite";

describe("Milestone 2 Multi-Tenancy & Database Security Suite", () => {
  let adminToken = "";
  let shop1OwnerToken = "";
  let shop2OwnerToken = "";
  let shop1StaffToken = "";
  let customer1Token = "";
  let customer2Token = "";

  let shop1Id = "1";
  let shop2Id = "shop-2-multitenant";

  let order1Id = "";
  let order2Id = "";
  let product1Id = "";
  let product2Id = "";
  let staff1UserId = "";

  before(async () => {
    process.env.NODE_ENV = "test";
    await readDB();

    // 1. Log in Platform Admin
    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@localpickup.com", password: "password123" });
    assert.strictEqual(adminRes.status, 200, "Admin login failed");
    adminToken = adminRes.body.token;

    // 2. Log in Shop 1 Owner (shop-1)
    const shop1Res = await request(app)
      .post("/api/auth/login")
      .send({ email: "shop1@abc.com", password: "password123" });
    assert.strictEqual(shop1Res.status, 200, "Shop 1 login failed");
    shop1OwnerToken = shop1Res.body.token;

    // 3. Register Shop 2 Owner and create Shop 2
    const shop2OwnerEmail = `shop2_owner_${Date.now()}@test.com`;
    const regShop2Owner = await request(app)
      .post("/api/auth/register")
      .send({
        email: shop2OwnerEmail,
        password: "password123",
        name: "Shop 2 Owner",
        role: "SHOP_OWNER",
      });
    assert.strictEqual(regShop2Owner.status, 201);
    shop2OwnerToken = regShop2Owner.body.token;
    const shop2OwnerId = regShop2Owner.body.user.id;

    // Create Shop 2 directly in DB for isolated tenant testing
    const existingShop2 = repository.getShopById(shop2Id);
    if (!existingShop2) {
      repository.createShop({
        id: shop2Id,
        name: "Apex Cyber Prints",
        slug: `apex-cyber-prints-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        owner_id: shop2OwnerId,
        price_starting: "From ₹3",
        rating: 4.9,
      });
    }
    repository.addShopMember(shop2Id, shop2OwnerId, "OWNER");

    // 4. Register Staff 1 and assign to Shop 1
    const staff1Email = `staff1_${Date.now()}@test.com`;
    const regStaff1 = await request(app)
      .post("/api/auth/register")
      .send({
        email: staff1Email,
        password: "password123",
        name: "Shop 1 Assistant",
        role: "CUSTOMER",
      });
    assert.strictEqual(regStaff1.status, 201);
    shop1StaffToken = regStaff1.body.token;
    staff1UserId = regStaff1.body.user.id;

    // Add Staff 1 to Shop 1 via Owner API
    const addStaffRes = await request(app)
      .post(`/api/shops/${shop1Id}/staff`)
      .set("Authorization", `Bearer ${shop1OwnerToken}`)
      .send({ email: staff1Email, role: "STAFF" });
    assert.strictEqual(addStaffRes.status, 201);

    // 5. Register Customer 1
    const cust1Email = `cust1_${Date.now()}@test.com`;
    const regCust1 = await request(app)
      .post("/api/auth/register")
      .send({
        email: cust1Email,
        password: "password123",
        name: "Customer Alpha",
        role: "CUSTOMER",
      });
    customer1Token = regCust1.body.token;

    // 6. Register Customer 2
    const cust2Email = `cust2_${Date.now()}@test.com`;
    const regCust2 = await request(app)
      .post("/api/auth/register")
      .send({
        email: cust2Email,
        password: "password123",
        name: "Customer Beta",
        role: "CUSTOMER",
      });
    customer2Token = regCust2.body.token;

    // 7. Place Order 1 in Shop 1
    const dummyBuffer = Buffer.from("%PDF-1.4 test document 1");
    const order1Res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customer1Token}`)
      .field("shopId", shop1Id)
      .field("pickupTime", "2026-10-20T10:00:00")
      .field("paper", "A4")
      .field("colour", "bw")
      .field("sides", "single")
      .field("copies", "2")
      .attach("file", dummyBuffer, "contract1.pdf");
    assert.strictEqual(order1Res.status, 201);
    order1Id = order1Res.body.id;

    // 8. Place Order 2 in Shop 2
    const dummyBuffer2 = Buffer.from("%PDF-1.4 test document 2");
    const order2Res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customer2Token}`)
      .field("shopId", shop2Id)
      .field("pickupTime", "2026-10-20T11:00:00")
      .field("paper", "A4")
      .field("colour", "colour")
      .field("sides", "double")
      .field("copies", "1")
      .attach("file", dummyBuffer2, "blueprint2.pdf");
    assert.strictEqual(order2Res.status, 201);
    order2Id = order2Res.body.id;

    // 9. Create Product in Shop 1
    const prod1Res = await request(app)
      .post(`/api/shops/${shop1Id}/products`)
      .set("Authorization", `Bearer ${shop1OwnerToken}`)
      .send({
        name: "Parker Jotter Pen",
        price: 250,
        stockQuantity: 20,
      });
    assert.strictEqual(prod1Res.status, 201);
    product1Id = prod1Res.body.id;

    // 10. Create Product in Shop 2
    const prod2Res = await request(app)
      .post(`/api/shops/${shop2Id}/products`)
      .set("Authorization", `Bearer ${shop2OwnerToken}`)
      .send({
        name: "A4 Spiral Notebook",
        price: 85,
        stockQuantity: 50,
      });
    assert.strictEqual(prod2Res.status, 201);
    product2Id = prod2Res.body.id;
  });

  // ====================================================
  // Phase 6.A: Shop Isolation
  // ====================================================
  describe("6.A: Cross-Shop Isolation", () => {
    it("Shop 1 Owner cannot view Shop 2 order details (403)", async () => {
      const res = await request(app)
        .get(`/api/orders/${order2Id}`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`);
      assert.strictEqual(res.status, 403);
      assert.match(res.body.error, /Forbidden/i);
    });

    it("Shop 2 Owner cannot view Shop 1 order details (403)", async () => {
      const res = await request(app)
        .get(`/api/orders/${order1Id}`)
        .set("Authorization", `Bearer ${shop2OwnerToken}`);
      assert.strictEqual(res.status, 403);
      assert.match(res.body.error, /Forbidden/i);
    });

    it("Shop 1 Owner order list does NOT leak Shop 2 orders", async () => {
      const res = await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${shop1OwnerToken}`);
      assert.strictEqual(res.status, 200);
      const orders = res.body as Array<{ id: string; shopId: string }>;
      const leaked = orders.filter((o) => o.shopId === shop2Id);
      assert.strictEqual(leaked.length, 0, "Shop 1 order list contained Shop 2 orders!");
    });

    it("Shop 1 Owner cannot modify Shop 2 order status (403)", async () => {
      const res = await request(app)
        .patch(`/api/orders/${order2Id}/status`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({ status: "Accepted" });
      assert.strictEqual(res.status, 403);
      assert.match(res.body.error, /Forbidden/i);
    });

    it("Shop 1 Owner cannot download Shop 2 private customer document (403)", async () => {
      const res = await request(app)
        .get(`/api/documents/${order2Id}`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`);
      assert.strictEqual(res.status, 403);
    });

    it("Shop 1 Owner cannot add products to Shop 2 (403)", async () => {
      const res = await request(app)
        .post(`/api/shops/${shop2Id}/products`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({
          name: "Illicit Product",
          price: 10,
          stockQuantity: 5,
        });
      assert.strictEqual(res.status, 403);
    });

    it("Shop 1 Owner cannot modify Shop 2 products or inventory (403)", async () => {
      const res = await request(app)
        .put(`/api/shops/${shop2Id}/products/${product2Id}`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({ price: 1, stockQuantity: 0 });
      assert.strictEqual(res.status, 403);
    });

    it("Shop 1 Owner cannot delete Shop 2 products (403)", async () => {
      const res = await request(app)
        .delete(`/api/shops/${shop2Id}/products/${product2Id}`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`);
      assert.strictEqual(res.status, 403);
    });
  });

  // ====================================================
  // Phase 6.B: Membership Authorization & Role Hierarchy
  // ====================================================
  describe("6.B: Membership Authorization & Role Hierarchy", () => {
    it("Authorized Staff member of Shop 1 CAN view Shop 1 orders (200)", async () => {
      const res = await request(app)
        .get(`/api/orders/${order1Id}`)
        .set("Authorization", `Bearer ${shop1StaffToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, order1Id);
    });

    it("Authorized Staff member of Shop 1 CAN update order status (200)", async () => {
      const res = await request(app)
        .patch(`/api/orders/${order1Id}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Accepted" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "Accepted");
    });

    it("Shop 1 Staff cannot delete Shop 1 products (Only OWNER role can delete) (403)", async () => {
      const res = await request(app)
        .delete(`/api/shops/${shop1Id}/products/${product1Id}`)
        .set("Authorization", `Bearer ${shop1StaffToken}`);
      assert.strictEqual(res.status, 403);
      assert.match(res.body.error, /Only shop owners/i);
    });

    it("Shop 1 Staff cannot add/invite new staff members (403)", async () => {
      const res = await request(app)
        .post(`/api/shops/${shop1Id}/staff`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ email: "random@test.com", role: "STAFF" });
      assert.strictEqual(res.status, 403);
    });

    it("Shop Owner CANNOT grant platform ADMIN privileges (Role clamp)", async () => {
      const dummyUserEmail = `dummy_${Date.now()}@test.com`;
      await request(app).post("/api/auth/register").send({
        email: dummyUserEmail,
        password: "password123",
        name: "Test Escalation",
      });

      const res = await request(app)
        .post(`/api/shops/${shop1Id}/staff`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({ email: dummyUserEmail, role: "ADMIN" }); // Malicious role
      assert.strictEqual(res.status, 201);
      // Ensure member role is clamped to STAFF or OWNER, never ADMIN
      assert.notStrictEqual(res.body.member.role, "ADMIN");
      assert.strictEqual(res.body.member.role, "STAFF");
    });

    it("Removing staff member revokes their access immediately", async () => {
      // 1. Remove staff1 from Shop 1
      const delRes = await request(app)
        .delete(`/api/shops/${shop1Id}/staff/${staff1UserId}`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`);
      assert.strictEqual(delRes.status, 200);

      // 2. Staff 1 attempts to view Shop 1 orders -> MUST BE 403
      const orderRes = await request(app)
        .get(`/api/orders/${order1Id}`)
        .set("Authorization", `Bearer ${shop1StaffToken}`);
      assert.strictEqual(orderRes.status, 403, "Revoked staff was still able to access shop order!");

      // 3. Staff 1 attempts to download Shop 1 document -> MUST BE 403
      const docRes = await request(app)
        .get(`/api/documents/${order1Id}`)
        .set("Authorization", `Bearer ${shop1StaffToken}`);
      assert.strictEqual(docRes.status, 403, "Revoked staff was still able to access customer document!");
    });

    it("Customer cannot access shop staff administration (403)", async () => {
      const res = await request(app)
        .get(`/api/shops/${shop1Id}/staff`)
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(res.status, 403);
    });

    it("Shopkeeper cannot access platform admin endpoints (403)", async () => {
      const res = await request(app)
        .get("/api/admin/shops")
        .set("Authorization", `Bearer ${shop1OwnerToken}`);
      assert.strictEqual(res.status, 403);
    });
  });

  // ====================================================
  // Phase 6.C: Identifier Tampering & Impersonation
  // ====================================================
  describe("6.C: Identifier Tampering Defense", () => {
    it("Customer cannot view another customer's order by tampering orderId in URL (403)", async () => {
      // Customer 1 attempts to access Order 2 (owned by Customer 2)
      const res = await request(app)
        .get(`/api/orders/${order2Id}`)
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(res.status, 403);
    });

    it("Customer cannot download another customer's document by tampering orderId (403)", async () => {
      // Customer 1 attempts to download document of Order 2
      const res = await request(app)
        .get(`/api/documents/${order2Id}`)
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(res.status, 403);
    });

    it("Client cannot bypass product shop scope by mismatching shopId in path and body", async () => {
      // Shop 2 owner attempts to put a product belonging to Shop 1 under Shop 2 route
      const res = await request(app)
        .put(`/api/shops/${shop2Id}/products/${product1Id}`)
        .set("Authorization", `Bearer ${shop2OwnerToken}`)
        .send({ name: "Tampered Product", price: 10 });
      assert.strictEqual(res.status, 404, "Mismatched shop/product ID should return 404 Not Found");
    });

    it("Shop owner cannot update profile of another shop (403)", async () => {
      const res = await request(app)
        .put(`/api/shops/${shop2Id}`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({ name: "Hostile Takeover Shop" });
      assert.strictEqual(res.status, 403);
      assert.match(res.body.error, /Forbidden/i);
    });
  });

  // ====================================================
  // Phase 6.D: Database Referential Integrity & Constraints
  // ====================================================
  describe("6.D: Database Referential Integrity & Schema Constraints", () => {
    const db = getDatabase();

    it("Database rejects inserting an order referencing a nonexistent shop (FK violation)", () => {
      assert.throws(
        () => {
          db.prepare(`
            INSERT INTO orders (id, shop_id, pickup_time, pickup_token, pickup_token_hash, total_amount, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run("invalid-order-1", "nonexistent-shop-999", "2026-10-20T10:00:00", "123456", "hash123", 50, "Pending");
        },
        /FOREIGN KEY constraint failed/i,
        "Expected foreign key constraint violation on nonexistent shop_id"
      );
    });

    it("Database rejects negative price for products (CHECK constraint violation)", () => {
      assert.throws(
        () => {
          db.prepare(`
            INSERT INTO products (id, shop_id, name, price, stock_quantity)
            VALUES (?, ?, ?, ?, ?)
          `).run("invalid-prod-1", shop1Id, "Negative Price Item", -10.5, 5);
        },
        /CHECK constraint failed/i,
        "Expected check constraint violation on negative price"
      );
    });

    it("Database rejects negative stock quantity (CHECK constraint violation)", () => {
      assert.throws(
        () => {
          db.prepare(`
            INSERT INTO products (id, shop_id, name, price, stock_quantity)
            VALUES (?, ?, ?, ?, ?)
          `).run("invalid-prod-2", shop1Id, "Negative Stock Item", 10.0, -5);
        },
        /CHECK constraint failed/i,
        "Expected check constraint violation on negative stock quantity"
      );
    });

    it("Database rejects duplicate shop_members for same (shop_id, user_id) via UNIQUE constraint", () => {
      assert.throws(
        () => {
          db.prepare(`
            INSERT INTO shop_members (id, shop_id, user_id, role)
            VALUES (?, ?, ?, ?)
          `).run("dup-1", shop1Id, "admin-1", "STAFF");

          // Second direct insert without ON CONFLICT should fail
          db.prepare(`
            INSERT INTO shop_members (id, shop_id, user_id, role)
            VALUES (?, ?, ?, ?)
          `).run("dup-2", shop1Id, "admin-1", "STAFF");
        },
        /UNIQUE constraint failed/i,
        "Expected UNIQUE constraint violation on duplicate (shop_id, user_id)"
      );
    });

    it("Cascade delete: deleting an order cascades to order_items, print_jobs, and status history", () => {
      // Create a dedicated order for cascade testing
      const testOrderId = `cascade-test-${Date.now()}`;
      db.prepare(`
        INSERT INTO orders (id, shop_id, pickup_time, pickup_token, pickup_token_hash, total_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(testOrderId, shop1Id, "2026-10-20T10:00:00", "000000", "hash000", 25, "Pending");

      const testItemId = `item-${testOrderId}`;
      db.prepare(`
        INSERT INTO order_items (id, order_id, item_type, title, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(testItemId, testOrderId, "PRINT_JOB", "Test Print", 1, 25, 25);

      db.prepare(`
        INSERT INTO print_jobs (
          id, order_id, order_item_id, original_file_name, storage_key, file_path,
          paper_size, color_mode, sides, copies, calculated_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(`pj-${testOrderId}`, testOrderId, testItemId, "test.pdf", "test.pdf", "/uploads/test.pdf", "A4", "bw", "single", 1, 25);

      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status)
        VALUES (?, ?, ?, ?)
      `).run(`hist-${testOrderId}`, testOrderId, null, "Pending");

      // Verify records exist
      const beforeItems = db.prepare("SELECT COUNT(*) as c FROM order_items WHERE order_id = ?").get(testOrderId) as { c: number };
      const beforePj = db.prepare("SELECT COUNT(*) as c FROM print_jobs WHERE order_id = ?").get(testOrderId) as { c: number };
      const beforeHist = db.prepare("SELECT COUNT(*) as c FROM order_status_history WHERE order_id = ?").get(testOrderId) as { c: number };
      assert.strictEqual(beforeItems.c, 1);
      assert.strictEqual(beforePj.c, 1);
      assert.strictEqual(beforeHist.c, 1);

      // Now delete the parent order
      db.prepare("DELETE FROM orders WHERE id = ?").run(testOrderId);

      // Verify cascade deleted children
      const afterItems = db.prepare("SELECT COUNT(*) as c FROM order_items WHERE order_id = ?").get(testOrderId) as { c: number };
      const afterPj = db.prepare("SELECT COUNT(*) as c FROM print_jobs WHERE order_id = ?").get(testOrderId) as { c: number };
      const afterHist = db.prepare("SELECT COUNT(*) as c FROM order_status_history WHERE order_id = ?").get(testOrderId) as { c: number };
      assert.strictEqual(afterItems.c, 0, "order_items was not cascade deleted");
      assert.strictEqual(afterPj.c, 0, "print_jobs was not cascade deleted");
      assert.strictEqual(afterHist.c, 0, "order_status_history was not cascade deleted");
    });
  });
});
