import { describe, it, before } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { app } from "../src/app";
import { repository, readDB } from "../src/database";
import { getDatabase } from "../src/db/sqlite";

describe("Milestone 3 Product Catalogue, Inventory & Cart Security Suite", () => {
  let shop1OwnerToken = "";
  let shop2OwnerToken = "";
  let shop1StaffToken = "";
  let customerToken = "";

  const shop1Id = "1";
  let shop2Id = "";
  let product1Id = "";
  let product2Id = "";
  let limitedStockProdId = "";

  before(async () => {
    process.env.NODE_ENV = "test";
    await readDB();

    // 1. Log in Shop 1 Owner (shop-1)
    const shop1Res = await request(app)
      .post("/api/auth/login")
      .send({ email: "shop1@abc.com", password: "password123" });
    assert.strictEqual(shop1Res.status, 200);
    shop1OwnerToken = shop1Res.body.token;

    // 2. Register and setup Shop 2 Owner and Shop 2
    const shop2Email = `m3_shop2_${Date.now()}@test.com`;
    const regShop2 = await request(app)
      .post("/api/auth/register")
      .send({
        email: shop2Email,
        password: "password123",
        name: "Shop 2 Merchant",
        role: "SHOP_OWNER",
      });
    shop2OwnerToken = regShop2.body.token;
    const shop2OwnerId = regShop2.body.user.id;
    shop2Id = `shop-m3-${Date.now()}`;

    repository.createShop({
      id: shop2Id,
      name: "Corner Stationery & Xerox",
      slug: `corner-stationery-${Date.now()}`,
      owner_id: shop2OwnerId,
      price_starting: "From ₹2",
      rating: 4.8,
    });
    repository.addShopMember(shop2Id, shop2OwnerId, "OWNER");

    // 3. Register Shop 1 Staff member
    const staffEmail = `m3_staff_${Date.now()}@test.com`;
    const regStaff = await request(app)
      .post("/api/auth/register")
      .send({
        email: staffEmail,
        password: "password123",
        name: "Shop 1 Staff Clerk",
      });
    shop1StaffToken = regStaff.body.token;
    repository.addShopMember(shop1Id, regStaff.body.user.id, "STAFF");

    // 4. Register Customer
    const custEmail = `m3_customer_${Date.now()}@test.com`;
    const regCust = await request(app)
      .post("/api/auth/register")
      .send({
        email: custEmail,
        password: "password123",
        name: "Campus Student",
      });
    customerToken = regCust.body.token;

    // 5. Create Product 1 in Shop 1 (Regular Stock)
    const p1 = repository.createProduct({
      id: `prod-m3-1-${Date.now()}`,
      shop_id: shop1Id,
      name: "Pilot V7 Hi-Tecpoint Pen",
      description: "0.7mm fine point liquid ink pen",
      price: 80,
      stock_quantity: 25,
      is_available: 1,
    });
    product1Id = p1.id;

    // 6. Create Limited Stock Product in Shop 1 (Stock = 5)
    const pLimited = repository.createProduct({
      id: `prod-m3-limited-${Date.now()}`,
      shop_id: shop1Id,
      name: "Casio Scientific Calculator",
      description: "FX-991CW advanced calculator",
      price: 950,
      stock_quantity: 5,
      is_available: 1,
    });
    limitedStockProdId = pLimited.id;

    // 7. Create Product 2 in Shop 2
    const p2 = repository.createProduct({
      id: `prod-m3-2-${Date.now()}`,
      shop_id: shop2Id,
      name: "Drawing Sheet Pad",
      description: "A3 200gsm cartridge sheets",
      price: 150,
      stock_quantity: 30,
      is_available: 1,
    });
    product2Id = p2.id;
  });

  // ====================================================
  // 1. Product Catalog & Authorization
  // ====================================================
  describe("Product Catalog & Authorization", () => {
    it("Public customer can list available products and categories for a shop", async () => {
      const catRes = await request(app).get(`/api/shops/${shop1Id}/categories`);
      assert.strictEqual(catRes.status, 200);
      assert.ok(Array.isArray(catRes.body));

      const prodRes = await request(app).get(`/api/shops/${shop1Id}/products`);
      assert.strictEqual(prodRes.status, 200);
      assert.ok(Array.isArray(prodRes.body));
      const found = prodRes.body.find((p: any) => p.id === product1Id);
      assert.ok(found, "Product 1 should be listed in Shop 1 catalog");
    });

    it("Shop Staff can create a new product (201)", async () => {
      const res = await request(app)
        .post(`/api/shops/${shop1Id}/products`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({
          name: "Highlighter Marker (Yellow)",
          description: "Fluorescent chisel tip",
          price: 30,
          stockQuantity: 40,
        });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.name, "Highlighter Marker (Yellow)");
      assert.strictEqual(res.body.price, 30);
      assert.strictEqual(res.body.stock_quantity, 40);
    });

    it("Customer cannot create a product (403)", async () => {
      const res = await request(app)
        .post(`/api/shops/${shop1Id}/products`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          name: "Unauthorized Product",
          price: 10,
          stockQuantity: 10,
        });
      assert.strictEqual(res.status, 403);
    });

    it("Shop 1 Owner cannot modify Shop 2 products (Tenant Isolation) (403)", async () => {
      const res = await request(app)
        .put(`/api/shops/${shop2Id}/products/${product2Id}`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({ price: 5 });
      assert.strictEqual(res.status, 403);
    });

    it("Shop 1 Staff cannot modify products in Shop 2 (Tenant Isolation) (403)", async () => {
      const res = await request(app)
        .put(`/api/shops/${shop2Id}/products/${product2Id}`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ price: 1 });
      assert.strictEqual(res.status, 403);
    });

    it("Shop Staff cannot delete products (Restricted to OWNER) (403)", async () => {
      const res = await request(app)
        .delete(`/api/shops/${shop1Id}/products/${product1Id}`)
        .set("Authorization", `Bearer ${shop1StaffToken}`);
      assert.strictEqual(res.status, 403);
    });

    it("Rejects invalid negative price when creating product (400)", async () => {
      const res = await request(app)
        .post(`/api/shops/${shop1Id}/products`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({
          name: "Faulty Pen",
          price: -50,
          stockQuantity: 10,
        });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /non-negative/i);
    });

    it("Rejects invalid negative stock quantity (400)", async () => {
      const res = await request(app)
        .post(`/api/shops/${shop1Id}/products`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({
          name: "Faulty Notebook",
          price: 45,
          stockQuantity: -10,
        });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /non-negative/i);
    });
  });

  // ====================================================
  // 2. Inventory Management & Stock Validation
  // ====================================================
  describe("Inventory Management & Stock Validation", () => {
    it("Rejects order when requested quantity exceeds available stock (400)", async () => {
      // Available stock for limitedStockProdId is 5, attempting to buy 10
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "5:00 PM",
          items: [{ productId: limitedStockProdId, quantity: 10 }],
        });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /Insufficient stock/i);

      // Verify stock was not deducted
      const product = repository.getProductById(limitedStockProdId)!;
      assert.strictEqual(product.stock_quantity, 5);
    });

    it("Rejects order with invalid or negative item quantity (400)", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "5:00 PM",
          items: [{ productId: product1Id, quantity: -3 }],
        });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /positive integer/i);
    });

    it("Atomically deducts stock when stationery order is successfully placed (201)", async () => {
      const initialStock = repository.getProductById(limitedStockProdId)!.stock_quantity; // 5

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "6:00 PM",
          items: [{ productId: limitedStockProdId, quantity: 2 }],
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.total, 950 * 2); // 1900
      assert.strictEqual(res.body.items.length, 1);
      assert.strictEqual(res.body.items[0].quantity, 2);

      // Verify stock decreased atomically
      const updatedProduct = repository.getProductById(limitedStockProdId)!;
      assert.strictEqual(updatedProduct.stock_quantity, initialStock - 2); // 5 - 2 = 3
    });

    it("Restores inventory when an order is cancelled", async () => {
      // 1. Order 1 calculator (Stock goes from 3 to 2)
      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "6:30 PM",
          items: [{ productId: limitedStockProdId, quantity: 1 }],
        });
      assert.strictEqual(orderRes.status, 201);
      const orderId = orderRes.body.id;

      let currentStock = repository.getProductById(limitedStockProdId)!.stock_quantity;
      assert.strictEqual(currentStock, 2);

      // 2. Shopkeeper cancels order
      const cancelRes = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Cancelled", note: "Customer requested cancellation" });
      assert.strictEqual(cancelRes.status, 200);

      // 3. Verify stock restored
      currentStock = repository.getProductById(limitedStockProdId)!.stock_quantity;
      assert.strictEqual(currentStock, 3, "Stock should be restored from 2 back to 3 after cancellation");
    });

    it("Repeated cancellation requests cannot restore stock multiple times", async () => {
      // Create order with 1 calculator
      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "6:45 PM",
          items: [{ productId: limitedStockProdId, quantity: 1 }],
        });
      assert.strictEqual(orderRes.status, 201);
      const orderId = orderRes.body.id;

      const stockBeforeCancel = repository.getProductById(limitedStockProdId)!.stock_quantity;

      // 1st cancellation (valid, restores 1)
      const cancel1 = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Cancelled" });
      assert.strictEqual(cancel1.status, 200);

      const stockAfterFirstCancel = repository.getProductById(limitedStockProdId)!.stock_quantity;
      assert.strictEqual(stockAfterFirstCancel, stockBeforeCancel + 1);

      // 2nd cancellation attempt on already cancelled order (must fail and not double-restore stock)
      const cancel2 = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Cancelled" });
      assert.strictEqual(cancel2.status, 400);

      // 3rd cancellation attempt via /cancel endpoint (must also fail)
      const cancel3 = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ reason: "Repeat cancel attempt" });
      assert.strictEqual(cancel3.status, 400);

      // Verify stock remained constant and was not restored again
      const finalStock = repository.getProductById(limitedStockProdId)!.stock_quantity;
      assert.strictEqual(finalStock, stockAfterFirstCancel, "Stock must NOT increase on repeated cancellations");
    });

    it("Repeated rejection cannot restore stock multiple times", async () => {
      const initialStock = repository.getProductById(product1Id)!.stock_quantity;

      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "7:00 PM",
          items: [{ productId: product1Id, quantity: 2 }],
        });
      assert.strictEqual(orderRes.status, 201);
      const orderId = orderRes.body.id;
      assert.strictEqual(repository.getProductById(product1Id)!.stock_quantity, initialStock - 2);

      // 1st rejection: valid, restores 2 stock
      const reject1 = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Rejected", note: "Out of stationery supplies" });
      assert.strictEqual(reject1.status, 200);

      const stockAfterFirstReject = repository.getProductById(product1Id)!.stock_quantity;
      assert.strictEqual(stockAfterFirstReject, initialStock);

      // 2nd rejection attempt on already rejected order (must fail with 400 and not double-restore stock)
      const reject2 = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Rejected" });
      assert.strictEqual(reject2.status, 400);

      // Verify stock remained constant and was not restored again
      assert.strictEqual(
        repository.getProductById(product1Id)!.stock_quantity,
        initialStock,
        "Stock must not be restored twice on repeated rejections"
      );
    });

    it("Customers cannot modify or cancel another customer's order (403)", async () => {
      // 1. Customer 1 places an order
      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "7:10 PM",
          items: [{ productId: product1Id, quantity: 1 }],
        });
      assert.strictEqual(orderRes.status, 201);
      const orderId = orderRes.body.id;

      // 2. Customer 2 registers
      const regCust2 = await request(app)
        .post("/api/auth/register")
        .send({
          email: `cust2_${Date.now()}@test.com`,
          password: "password123",
          name: "Other Customer",
        });
      const customer2Token = regCust2.body.token;

      // 3. Customer 2 attempts to cancel Customer 1's order via POST /api/orders/:id/cancel
      const cancelRes = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set("Authorization", `Bearer ${customer2Token}`)
        .send({ reason: "Malicious cancellation attempt" });
      assert.strictEqual(cancelRes.status, 403);
      assert.match(cancelRes.body.error, /cannot cancel another user's order/i);

      // 4. Customer 2 attempts to change status via PATCH /api/orders/:id/status
      const patchRes = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${customer2Token}`)
        .send({ status: "Cancelled" });
      assert.strictEqual(patchRes.status, 403);
    });

    it("Rejects invalid status transitions (e.g. Pending directly to Completed or backwards)", async () => {
      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "7:00 PM",
          items: [{ productId: limitedStockProdId, quantity: 1 }],
        });
      assert.strictEqual(orderRes.status, 201);
      const orderId = orderRes.body.id;

      // 1. Direct Pending -> Completed without pickup verification is rejected
      const invalidRes1 = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Completed" });
      assert.strictEqual(invalidRes1.status, 400);
      assert.match(invalidRes1.body.error, /invalid status transition/i);

      // 2. Advance to Ready
      const readyRes = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Ready" });
      assert.strictEqual(readyRes.status, 200);

      // 3. Regressing backwards from Ready -> Pending is rejected
      const invalidRes2 = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Pending" });
      assert.strictEqual(invalidRes2.status, 400);
    });

    it("A completed order cannot be cancelled through an ordinary status update", async () => {
      const initialStock = repository.getProductById(limitedStockProdId)!.stock_quantity;

      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "7:15 PM",
          items: [{ productId: limitedStockProdId, quantity: 1 }],
        });
      assert.strictEqual(orderRes.status, 201);
      const orderId = orderRes.body.id;
      const pickupToken = orderRes.body.pickupToken;

      assert.strictEqual(repository.getProductById(limitedStockProdId)!.stock_quantity, initialStock - 1);

      // Advance to Ready
      await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Ready" });

      // Complete via counter pickup verification
      const verifyRes = await request(app)
        .post(`/api/orders/${orderId}/verify-pickup`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ token: pickupToken });
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.body.order.status, "Completed");

      // Attempt to cancel completed order via PATCH /status
      const cancelAttempt1 = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ status: "Cancelled" });
      assert.strictEqual(cancelAttempt1.status, 400);

      // Attempt to cancel completed order via POST /cancel
      const cancelAttempt2 = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set("Authorization", `Bearer ${shop1StaffToken}`)
        .send({ reason: "Try cancelling completed" });
      assert.strictEqual(cancelAttempt2.status, 400);

      // Inventory must NOT be restored
      assert.strictEqual(
        repository.getProductById(limitedStockProdId)!.stock_quantity,
        initialStock - 1,
        "Inventory must not be restored when attempting to cancel a completed order"
      );
    });

    it("Concurrent status updates cannot corrupt inventory", async () => {
      // Create order with 2 units using product1Id (abundant stock)
      const initialStock = repository.getProductById(product1Id)!.stock_quantity;
      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "7:30 PM",
          items: [{ productId: product1Id, quantity: 2 }],
        });
      assert.strictEqual(orderRes.status, 201);
      const orderId = orderRes.body.id;

      assert.strictEqual(repository.getProductById(product1Id)!.stock_quantity, initialStock - 2);

      // Fire 5 concurrent cancellation requests in parallel
      const cancelPromises = [1, 2, 3, 4, 5].map(() =>
        request(app)
          .patch(`/api/orders/${orderId}/status`)
          .set("Authorization", `Bearer ${shop1StaffToken}`)
          .send({ status: "Cancelled", note: "Concurrent cancellation race" })
      );

      const results = await Promise.all(cancelPromises);

      // Exactly ONE should succeed (status 200), and all other 4 must fail (status 400)
      const successCount = results.filter((r) => r.status === 200).length;
      const failCount = results.filter((r) => r.status === 400).length;

      assert.strictEqual(successCount, 1, "Exactly one concurrent cancellation request should succeed");
      assert.strictEqual(failCount, 4, "Concurrent duplicate cancellations must be rejected with 400");

      // Verify stock was restored by exactly 2 (and not 2 * 5 = 10!)
      const finalStock = repository.getProductById(product1Id)!.stock_quantity;
      assert.strictEqual(
        finalStock,
        initialStock,
        "Stock should be restored exactly once despite concurrent cancellation attempts"
      );
    });
  });

  // ====================================================
  // 3. Shopping Cart, Price Tampering & Cross-Shop Defense
  // ====================================================
  describe("Shopping Cart & Cross-Shop Defense", () => {
    it("Overrides client-tampered unit price with server database price", async () => {
      // Pilot Pen is ₹80 in DB, malicious client attempts to send unitPrice: 1 and total: 1
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "7:00 PM",
          total: 1, // Malicious total attempt
          items: [
            {
              productId: product1Id,
              quantity: 2,
              unitPrice: 1, // Malicious unit price attempt
              subtotal: 2,
            },
          ],
        });

      assert.strictEqual(res.status, 201);
      // Expected total: 80 * 2 = 160
      assert.strictEqual(res.body.total, 160, "Server must compute total strictly from database price");
      assert.strictEqual(res.body.items[0].unitPrice, 80);
      assert.strictEqual(res.body.items[0].subtotal, 160);
    });

    it("Rejects cross-shop cart submission (mixing items from Shop 2 into Shop 1 order) (400)", async () => {
      // product2Id belongs to shop2Id, but order is sent to shop1Id
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "7:30 PM",
          items: [
            { productId: product1Id, quantity: 1 },
            { productId: product2Id, quantity: 1 }, // Belong to Shop 2!
          ],
        });

      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /Cross-shop cart error/i);
    });

    it("Supports unified order containing BOTH document printing and stationery products (201)", async () => {
      const initialStock = repository.getProductById(product1Id)!.stock_quantity;
      const dummyPdf = Buffer.from("%PDF-1.4 Mixed Cart Document");

      // Place multipart order with attached document and items JSON
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .field("shopId", shop1Id)
        .field("pickupTime", "8:00 PM")
        .field("paper", "A4")
        .field("colour", "bw")
        .field("sides", "single")
        .field("copies", "2")
        .field("items", JSON.stringify([{ productId: product1Id, quantity: 3 }]))
        .attach("file", dummyPdf, "lecture_notes.pdf");

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id.startsWith("LP-"));
      assert.strictEqual(res.body.pickupTime, "8:00 PM");

      // Printing price: A4 B&W single = 2 * 2 copies = ₹4
      // Stationery price: Pilot Pen 80 * 3 = ₹240
      // Total: 240 + 4 = ₹244
      assert.strictEqual(res.body.total, 244);
      assert.strictEqual(res.body.items.length, 2);
      const stationeryItem = res.body.items.find((it: any) => it.itemType === "PRODUCT");
      const printItem = res.body.items.find((it: any) => it.itemType === "PRINT_JOB");
      assert.ok(stationeryItem, "Stationery item must be present in order");
      assert.strictEqual(stationeryItem.productId, product1Id);
      assert.strictEqual(stationeryItem.quantity, 3);
      assert.ok(printItem, "Print job item must be present in order");
      assert.strictEqual(printItem.quantity, 2);
      assert.strictEqual(res.body.fileName, "lecture_notes.pdf");

      // Verify stock was deducted
      const afterStock = repository.getProductById(product1Id)!.stock_quantity;
      assert.strictEqual(afterStock, initialStock - 3);
    });

    it("Rolls back order creation completely if any item in the cart fails stock check", async () => {
      const p1Initial = repository.getProductById(product1Id)!.stock_quantity;
      const pLimitedInitial = repository.getProductById(limitedStockProdId)!.stock_quantity; // 3

      // Item 1 has sufficient stock, but Item 2 exceeds available stock
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: shop1Id,
          pickupTime: "8:30 PM",
          items: [
            { productId: product1Id, quantity: 2 },
            { productId: limitedStockProdId, quantity: 10 }, // 10 > 3!
          ],
        });

      assert.strictEqual(res.status, 400);

      // Verify rollback: product 1 stock must NOT have decreased
      const p1After = repository.getProductById(product1Id)!.stock_quantity;
      const pLimitedAfter = repository.getProductById(limitedStockProdId)!.stock_quantity;
      assert.strictEqual(p1After, p1Initial, "Product 1 stock should remain unchanged due to atomic rollback");
      assert.strictEqual(pLimitedAfter, pLimitedInitial);
    });
  });
});
