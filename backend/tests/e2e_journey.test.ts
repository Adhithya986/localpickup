import { describe, it, before } from "node:test";
import assert from "node:assert";
import request from "supertest";
import path from "path";
import fs from "fs";
import { app } from "../src/app";
import { repository, readDB } from "../src/database";

describe("Milestone 6 End-to-End Customer Journey & Production Hardening Suite", () => {
  const uniqueId = Date.now();

  let customerToken = "";
  let customerUser: any = null;
  let customer2Token = "";
  let customer2User: any = null;
  let shopOwnerToken = "";
  let shopOwnerUser: any = null;
  let shopStaffToken = "";
  let shopStaffUser: any = null;

  let testShopId = `shop-e2e-${uniqueId}`;
  let stationeryProdId = `prod-e2e-pen-${uniqueId}`;
  let initialStock = 50;
  let unitPrice = 25.0;

  let mixedOrderId = "";
  let pickupToken = "";
  let testDocumentPath = "";

  before(async () => {
    process.env.NODE_ENV = "test";
    await readDB();

    // 1. Create a dummy test file for document upload
    const uploadsDir = path.resolve(__dirname, "../uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    testDocumentPath = path.join(uploadsDir, `test_doc_${uniqueId}.pdf`);
    fs.writeFileSync(testDocumentPath, "%PDF-1.4 Mock Assignment Document for Print", "utf8");

    // 2. Register Customer 1
    const custRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: `e2e_cust_${uniqueId}@test.com`,
        password: "password123",
        name: "Akshaya Customer",
        role: "CUSTOMER",
      });
    assert.strictEqual(custRes.status, 201);
    customerToken = custRes.body.token;
    customerUser = custRes.body.user;

    // 3. Register Customer 2 (isolated second customer)
    const cust2Res = await request(app)
      .post("/api/auth/register")
      .send({
        email: `e2e_cust2_${uniqueId}@test.com`,
        password: "password123",
        name: "Other Customer",
        role: "CUSTOMER",
      });
    assert.strictEqual(cust2Res.status, 201);
    customer2Token = cust2Res.body.token;
    customer2User = cust2Res.body.user;

    // 4. Register Shop Owner
    const ownerRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: `e2e_owner_${uniqueId}@test.com`,
        password: "password123",
        name: "Shop Owner Dave",
        role: "SHOP_OWNER",
      });
    assert.strictEqual(ownerRes.status, 201);
    shopOwnerToken = ownerRes.body.token;
    shopOwnerUser = ownerRes.body.user;

    // 5. Create E2E Shop under Enterprise plan so limits don't interfere
    repository.createShop({
      id: testShopId,
      name: "FastPrint & Stationery Hub",
      description: "Premier college campus self-pickup counter",
      owner_id: shopOwnerUser.id,
      address: "Campus Gate 3, Ground Floor",
      phone: "9876543210",
      is_active: 1,
      subscription_status: "ACTIVE",
    });
    repository.assignShopPlan(testShopId, "plan_enterprise", shopOwnerUser.id, "Setup E2E shop");

    // 6. Register & Add Shop Staff
    const staffUserRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: `e2e_staff_${uniqueId}@test.com`,
        password: "password123",
        name: "Counter Staff Bob",
        role: "CUSTOMER",
      });
    assert.strictEqual(staffUserRes.status, 201);
    shopStaffUser = staffUserRes.body.user;

    const addStaffRes = await request(app)
      .post(`/api/shops/${testShopId}/staff`)
      .set("Authorization", `Bearer ${shopOwnerToken}`)
      .send({
        email: shopStaffUser.email,
        role: "STAFF",
      });
    assert.strictEqual(addStaffRes.status, 201);

    // Login as staff
    const staffLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: shopStaffUser.email, password: "password123" });
    assert.strictEqual(staffLoginRes.status, 200);
    shopStaffToken = staffLoginRes.body.token;

    // 7. Create a Stationery Product
    repository.createProduct({
      id: stationeryProdId,
      shop_id: testShopId,
      name: "Engineering Graph Notebook",
      description: "160 pages spiral bound",
      price: unitPrice,
      stock_quantity: initialStock,
      is_available: 1,
    });
  });

  // =========================================================================
  // JOURNEY PART 1: 17-STEP CUSTOMER JOURNEY (MIXED ORDER: PRINT + STATIONERY)
  // =========================================================================
  describe("A. 17-Step Mixed Self-Pickup Journey (Print + Stationery)", () => {
    it("Step 1: Customer logs in and validates authentication", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.email, customerUser.email);
    });

    it("Step 2: Customer selects the printing shop", async () => {
      const res = await request(app)
        .get(`/api/shops/${testShopId}`)
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, testShopId);
      assert.strictEqual(res.body.name, "FastPrint & Stationery Hub");
    });

    it("Step 3: Customer browses available stationery products", async () => {
      const res = await request(app)
        .get(`/api/shops/${testShopId}/products`)
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      const found = res.body.find((p: any) => p.id === stationeryProdId);
      assert.ok(found);
      assert.strictEqual(found.stock_quantity, initialStock);
    });

    it("Steps 4-8: Customer prepares mixed cart with document upload and submits order", async () => {
      // Step 4: Product selection (2 notebooks @ 25 = 50)
      // Step 5: Upload document
      // Step 6: Select print options (A4, colour, double-sided, 2 copies, spiral binding)
      // Step 7: Server calculates accurate price
      const printOptions = {
        paper: "A4",
        colour: "colour",
        sides: "double",
        copies: 2,
        binding: true,
        lamination: false,
      };

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .field("shopId", testShopId)
        .field("pickupTime", "16:30")
        .field(
          "items",
          JSON.stringify([
            {
              productId: stationeryProdId,
              quantity: 2,
            },
          ])
        )
        .field("printJob", JSON.stringify(printOptions))
        .attach("file", testDocumentPath);

      assert.strictEqual(res.status, 201, `Order placement failed: ${JSON.stringify(res.body)}`);

      // Step 9: Order confirmation received
      mixedOrderId = res.body.id;
      pickupToken = res.body.pickupToken;
      assert.ok(mixedOrderId && (mixedOrderId.startsWith("LP-") || mixedOrderId.startsWith("ord-")), "Order ID must have valid format");
      assert.ok(pickupToken, "Pickup token must be issued");
      assert.strictEqual(res.body.status, "Pending");

      // Verify server price calculation:
      // Stationery: 2 * 25 = 50
      // Print calculation: A4 Colour (base 2 + colour 3 - double 1 = 4) * 2 copies = 8 + binding (20) = 28
      // Total = 50 + 28 = 78.0
      assert.strictEqual(res.body.total, 78.0);
    });

    it("Step 10: Customer views order timeline and notifications", async () => {
      // Timeline check
      const timelineRes = await request(app)
        .get(`/api/orders/${mixedOrderId}/timeline`)
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(timelineRes.status, 200);
      assert.ok(timelineRes.body.timeline && timelineRes.body.timeline.length >= 1);
      assert.strictEqual(timelineRes.body.timeline[0].toStatus, "Pending");

      // Notification check
      const notifRes = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(notifRes.status, 200);
      const notifications = notifRes.body.notifications || [];
      const placedNotif = notifications.find((n: any) => n.orderId === mixedOrderId);
      assert.ok(placedNotif, "Placed notification must exist");
      assert.strictEqual(placedNotif.type, "ORDER_PLACED");
    });

    it("Step 11: Shopkeeper accepts the order", async () => {
      const res = await request(app)
        .patch(`/api/orders/${mixedOrderId}/status`)
        .set("Authorization", `Bearer ${shopOwnerToken}`)
        .send({ status: "Accepted", note: "Files queued for high-speed laser print" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "Accepted");
    });

    it("Step 12: Shopkeeper prepares the order", async () => {
      const res = await request(app)
        .patch(`/api/orders/${mixedOrderId}/status`)
        .set("Authorization", `Bearer ${shopStaffToken}`)
        .send({ status: "Preparing", note: "Documents printed, spiral binding applied" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "Preparing");
    });

    it("Step 13: Shopkeeper marks order Ready for self-pickup", async () => {
      const res = await request(app)
        .patch(`/api/orders/${mixedOrderId}/status`)
        .set("Authorization", `Bearer ${shopStaffToken}`)
        .send({ status: "Ready", note: "Placed at Counter 2" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "Ready");

      // Customer receives ready notification
      const notifRes = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(notifRes.status, 200);
      const readyNotifications = notifRes.body.notifications || [];
      const readyNotif = readyNotifications.find((n: any) => n.orderId === mixedOrderId && n.type === "ORDER_READY");
      assert.ok(readyNotif, "Customer must receive ready notification");
    });

    it("Step 14-15: Customer visits physical counter; Staff verifies pickup code", async () => {
      // Cross-tenant check: Unauthorized customer or staff from another shop cannot verify pickup (403)
      const crossRes = await request(app)
        .post(`/api/orders/${mixedOrderId}/verify-pickup`)
        .set("Authorization", `Bearer ${customer2Token}`)
        .send({ token: pickupToken });
      assert.strictEqual(crossRes.status, 403);

      // Rejection of wrong pickup code
      const wrongCodeRes = await request(app)
        .post(`/api/orders/${mixedOrderId}/verify-pickup`)
        .set("Authorization", `Bearer ${shopStaffToken}`)
        .send({ pickupCode: "INVALID123" });
      assert.strictEqual(wrongCodeRes.status, 400);

      // Successful verification with valid pickup code
      const verifyRes = await request(app)
        .post(`/api/orders/${mixedOrderId}/verify-pickup`)
        .set("Authorization", `Bearer ${shopStaffToken}`)
        .send({ token: pickupToken });
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.body.status, "Completed");
    });

    it("Step 16: Order is marked Completed and duplicate pickup verification is blocked", async () => {
      const dupRes = await request(app)
        .post(`/api/orders/${mixedOrderId}/verify-pickup`)
        .set("Authorization", `Bearer ${shopStaffToken}`)
        .send({ token: pickupToken });
      assert.strictEqual(dupRes.status, 400);
      assert.ok(dupRes.body.error.includes("already been verified"));
    });

    it("Step 17: Inventory deduction remains permanent and history is verified", async () => {
      const prod = repository.getProductById(stationeryProdId);
      assert.ok(prod);
      // Started with 50, deducted 2 -> exactly 48
      assert.strictEqual(prod.stock_quantity, initialStock - 2);

      // Verify complete lifecycle timeline
      const timelineRes = await request(app)
        .get(`/api/orders/${mixedOrderId}/timeline`)
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(timelineRes.status, 200);
      const statuses = timelineRes.body.timeline.map((h: any) => h.toStatus);
      assert.ok(statuses.includes("Pending"));
      assert.ok(statuses.includes("Accepted"));
      assert.ok(statuses.includes("Preparing"));
      assert.ok(statuses.includes("Ready"));
      assert.ok(statuses.includes("Completed"));
    });
  });

  // =========================================================================
  // JOURNEY PART 2: STATIONERY-ONLY ORDER & CANCELLATION RESTORATION INTEGRITY
  // =========================================================================
  describe("B. Stationery-Only Order & Single-Restoration Integrity", () => {
    let statOrderId = "";
    const orderedQuantity = 5;

    it("places stationery-only order and decrements inventory", async () => {
      const beforeStock = repository.getProductById(stationeryProdId)!.stock_quantity;

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: testShopId,
          pickupTime: "17:00",
          items: [{ productId: stationeryProdId, quantity: orderedQuantity }],
        });

      assert.strictEqual(res.status, 201);
      statOrderId = res.body.id;

      const afterStock = repository.getProductById(stationeryProdId)!.stock_quantity;
      assert.strictEqual(afterStock, beforeStock - orderedQuantity);
    });

    it("unauthorized customer status change attempt is rejected (403)", async () => {
      const res = await request(app)
        .patch(`/api/orders/${statOrderId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "Cancelled", note: "Customer unauthorized status change" });

      assert.strictEqual(res.status, 403);
    });

    it("authorized shop staff cancels order and restores stock exactly once", async () => {
      const stockBeforeCancel = repository.getProductById(stationeryProdId)!.stock_quantity;

      const res = await request(app)
        .patch(`/api/orders/${statOrderId}/status`)
        .set("Authorization", `Bearer ${shopStaffToken}`)
        .send({ status: "Cancelled", note: "Shop out of stock" });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "Cancelled");

      const stockAfterCancel = repository.getProductById(stationeryProdId)!.stock_quantity;
      assert.strictEqual(stockAfterCancel, stockBeforeCancel + orderedQuantity);
    });

    it("repeated cancellation is rejected and cannot restore stock twice", async () => {
      const stockSnapshot = repository.getProductById(stationeryProdId)!.stock_quantity;

      const res = await request(app)
        .patch(`/api/orders/${statOrderId}/status`)
        .set("Authorization", `Bearer ${shopStaffToken}`)
        .send({ status: "Cancelled", note: "Second cancellation attempt" });

      // Should be rejected because order is already in a terminal status
      assert.strictEqual(res.status, 400);

      const stockAfterRepeat = repository.getProductById(stationeryProdId)!.stock_quantity;
      assert.strictEqual(stockAfterRepeat, stockSnapshot, "Stock must NOT increase on repeated cancellation");
    });

    it("completed order cannot be cancelled through ordinary status update", async () => {
      const res = await request(app)
        .patch(`/api/orders/${mixedOrderId}/status`)
        .set("Authorization", `Bearer ${shopStaffToken}`)
        .send({ status: "Cancelled" });

      assert.strictEqual(res.status, 400);
    });
  });

  // =========================================================================
  // JOURNEY PART 3: PRINT-ONLY ORDER & DOCUMENT STORAGE ISOLATION
  // =========================================================================
  describe("C. Print-Only Order & Document Access Controls", () => {
    let printOrderId = "";

    it("places print-only order with uploaded PDF", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .field("shopId", testShopId)
        .field("pickupTime", "18:00")
        .field(
          "printJob",
          JSON.stringify({
            paper: "A4",
            colour: "bw",
            sides: "single",
            copies: 1,
            binding: false,
            lamination: false,
          })
        )
        .attach("file", testDocumentPath);

      assert.strictEqual(res.status, 201);
      printOrderId = res.body.id;
      assert.ok(res.body.pickupToken);
    });

    it("owner and placing customer can download print document", async () => {
      // Customer 1 downloads document
      const custDownload = await request(app)
        .get(`/api/documents/${printOrderId}`)
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(custDownload.status, 200);

      // Shop Staff downloads document for printing
      const staffDownload = await request(app)
        .get(`/api/documents/${printOrderId}`)
        .set("Authorization", `Bearer ${shopStaffToken}`);
      assert.strictEqual(staffDownload.status, 200);
    });

    it("Customer 2 cannot download Customer 1's document (403)", async () => {
      const unauthDownload = await request(app)
        .get(`/api/documents/${printOrderId}`)
        .set("Authorization", `Bearer ${customer2Token}`);
      assert.strictEqual(unauthDownload.status, 403);
    });
  });

  // =========================================================================
  // JOURNEY PART 4: SECURITY HEADERS & SUBSCRIPTION DATE ENFORCEMENT
  // =========================================================================
  describe("D. Production Security Headers & Date-Driven Subscription Expiration", () => {
    it("verifies OWASP production security headers are delivered on responses", async () => {
      const res = await request(app).get("/api/health");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
      assert.strictEqual(res.headers["x-frame-options"], "DENY");
      assert.strictEqual(res.headers["x-xss-protection"], "0");
      assert.strictEqual(res.headers["referrer-policy"], "strict-origin-when-cross-origin");
      assert.ok(res.headers["strict-transport-security"]);
      assert.strictEqual(res.headers["x-powered-by"], undefined, "X-Powered-By header must be stripped");
    });

    it("enforces subscription expiration based on past period end date", async () => {
      const expiredShopId = `shop-expired-date-${uniqueId}`;
      repository.createShop({
        id: expiredShopId,
        name: "Expired Sub Shop",
        owner_id: shopOwnerUser.id,
        is_active: 1,
        subscription_status: "ACTIVE",
      });

      // Update subscription dates so that current_period_end is in the past
      const db = repository["db"];
      db.prepare(`
        UPDATE shop_subscriptions
        SET status = 'ACTIVE', current_period_end = datetime('now', '-2 days'), updated_at = datetime('now')
        WHERE shop_id = ?
      `).run(expiredShopId);

      // Verify entitlements API marks it expired
      const entitlements = repository.getShopEntitlements(expiredShopId);
      assert.strictEqual(entitlements.isExpired, true, "Shop must be marked expired when period end is past");
      assert.strictEqual(entitlements.canAcceptOrders, false);

      // Attempt to place an order to this shop should be rejected with 403
      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          shopId: expiredShopId,
          pickupTime: "19:00",
          items: [{ productId: stationeryProdId, quantity: 1 }],
        });
      assert.strictEqual(orderRes.status, 403);
      assert.ok(orderRes.body.error.includes("expired"));
    });
  });
});
