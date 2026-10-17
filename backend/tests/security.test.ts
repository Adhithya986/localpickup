import { describe, it, before } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { app } from "../src/app";
import { readDB, writeDB } from "../src/database";

describe("Milestone 1 Security & Authentication Suite", () => {
  let adminToken = "";
  let shopToken = "";
  let customerToken = "";
  let otherCustomerToken = "";

  before(async () => {
    process.env.NODE_ENV = "test";
    await readDB(); // Warm up db and hash passwords

    // 1. Log in admin
    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@localpickup.com", password: "password123" });
    assert.strictEqual(adminRes.status, 200, "Admin login failed");
    adminToken = adminRes.body.token;

    // 2. Log in shopkeeper
    const shopRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "shop1@abc.com", password: "password123" });
    assert.strictEqual(shopRes.status, 200, "Shop login failed");
    shopToken = shopRes.body.token;

    // 3. Log in customer
    const custRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "customer@gmail.com", password: "password123" });
    assert.strictEqual(custRes.status, 200, "Customer login failed");
    customerToken = custRes.body.token;

    // 4. Register a second test customer for isolation testing
    const randEmail = `isolated_${Date.now()}@test.com`;
    const regRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: randEmail,
        password: "password123",
        name: "Isolated Customer",
        role: "CUSTOMER",
      });
    assert.strictEqual(regRes.status, 201, "Customer 2 registration failed");
    otherCustomerToken = regRes.body.token;
  });

  describe("Authentication & Registration Security", () => {
    it("should reject invalid login credentials with uniform generic error", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@localpickup.com", password: "wrongpassword" });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error, "Invalid email or password");
    });

    it("should reject non-existent user with same generic error (prevent enumeration)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nonexistent@user.com", password: "password123" });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error, "Invalid email or password");
    });

    it("should prevent public self-registration from gaining ADMIN privileges", async () => {
      const hackerEmail = `hacker_${Date.now()}@test.com`;
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: hackerEmail,
          password: "password123",
          name: "Hacker Attempt",
          role: "ADMIN", // Malicious attempt to escalate to ADMIN
        });
      assert.strictEqual(res.status, 201);
      assert.notStrictEqual(res.body.role, "ADMIN");
      assert.strictEqual(res.body.role, "CUSTOMER", "Role must default to CUSTOMER");
    });
  });

  describe("Role-Based Access Control (RBAC)", () => {
    it("should reject unauthenticated requests to protected endpoints", async () => {
      const resOrders = await request(app).get("/api/orders");
      assert.strictEqual(resOrders.status, 401);

      const resAdmin = await request(app).get("/api/admin/shops");
      assert.strictEqual(resAdmin.status, 401);
    });

    it("should reject customer access to platform admin endpoints (403)", async () => {
      const res = await request(app)
        .get("/api/admin/shops")
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(res.status, 403);
    });

    it("should reject shopkeeper access to platform admin endpoints (403)", async () => {
      const res = await request(app)
        .get("/api/admin/shops")
        .set("Authorization", `Bearer ${shopToken}`);
      assert.strictEqual(res.status, 403);
    });

    it("should allow platform admin to access admin endpoints (200)", async () => {
      const res = await request(app)
        .get("/api/admin/shops")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe("Server-Side Price Calculation & Tamper Resistance", () => {
    it("should override client-tampered price with server-calculated price", async () => {
      const dummyFile = Buffer.from("%PDF-1.4 test document content");

      // Attempt to tamper with price: send total = 0.01
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .field("shopId", "1")
        .field("paper", "A4")
        .field("colour", "bw")
        .field("sides", "single")
        .field("copies", "10")
        .field("binding", "true")
        .field("lamination", "false")
        .field("total", "0.01") // Malicious tampered price!
        .field("pickupTime", "5:00 PM")
        .attach("file", dummyFile, "assignment.pdf");

      assert.strictEqual(res.status, 201);
      // Expected: A4 BW (2) * 10 = 20 + Binding (20) = 40. Client total (0.01) must be ignored!
      assert.strictEqual(res.body.total, 40, "Price tampering was not prevented! Expected server total 40");
      assert.ok(res.body.id.startsWith("LP-"));
      assert.ok(res.body.pickupToken, "Secure pickup token must be generated");
    });
  });

  describe("Document Storage Security & Unauthorized Access", () => {
    let testOrderId = "";
    let testStorageKey = "";

    before(async () => {
      const dummyFile = Buffer.from("Secret document content");
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .field("shopId", "1")
        .field("paper", "A4")
        .field("colour", "bw")
        .field("sides", "single")
        .field("copies", "1")
        .field("pickupTime", "6:00 PM")
        .attach("file", dummyFile, "confidential.pdf");
      testOrderId = res.body.id;
      testStorageKey = res.body.storageKey;
    });

    it("should reject upload of prohibited file extensions with 400 Bad Request", async () => {
      const evilScript = Buffer.from("#!/bin/sh\nrm -rf /");
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .field("shopId", "1")
        .field("pickupTime", "6:00 PM")
        .attach("file", evilScript, "malicious.sh");
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /Unsupported file extension/i);
    });

    it("should block unauthenticated access to customer document", async () => {
      const res = await request(app).get(`/api/documents/${testOrderId}`);
      assert.strictEqual(res.status, 401);
    });

    it("should block another customer from downloading this document (403)", async () => {
      const res = await request(app)
        .get(`/api/documents/${testOrderId}`)
        .set("Authorization", `Bearer ${otherCustomerToken}`);
      assert.strictEqual(res.status, 403);
    });

    it("should allow the customer who placed the order to download the document (200)", async () => {
      const res = await request(app)
        .get(`/api/documents/${testOrderId}`)
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
    });

    it("should allow the shopkeeper of shop 1 to download the document (200)", async () => {
      const res = await request(app)
        .get(`/api/documents/${testOrderId}`)
        .set("Authorization", `Bearer ${shopToken}`);
      assert.strictEqual(res.status, 200);
    });

    it("should block unauthenticated access to direct upload path /uploads/:filename (401)", async () => {
      const res = await request(app).get(`/uploads/${testStorageKey}`);
      assert.strictEqual(res.status, 401);
    });

    it("should enforce tenant isolation on /uploads/:filename and block unauthorized customer (403)", async () => {
      const res = await request(app)
        .get(`/uploads/${testStorageKey}`)
        .set("Authorization", `Bearer ${otherCustomerToken}`);
      assert.strictEqual(res.status, 403);
    });

    it("should allow authorized customer to access /uploads/:filename with security headers (200)", async () => {
      const res = await request(app)
        .get(`/uploads/${testStorageKey}`)
        .set("Authorization", `Bearer ${customerToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
    });
  });

  describe("Order Lifecycle & Atomic Pickup Verification", () => {
    let orderToVerifyId = "";
    let validToken = "";

    before(async () => {
      const dummyFile = Buffer.from("Print assignment");
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .field("shopId", "1")
        .field("paper", "A4")
        .field("colour", "bw")
        .field("sides", "single")
        .field("copies", "1")
        .field("pickupTime", "7:00 PM")
        .attach("file", dummyFile, "test.pdf");
      orderToVerifyId = res.body.id;
      validToken = res.body.pickupToken;
    });

    it("should prevent customer from updating order status (403)", async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToVerifyId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "Ready" });
      assert.strictEqual(res.status, 403);
    });

    it("should prevent illegal status transition: Pending directly to Completed (400)", async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToVerifyId}/status`)
        .set("Authorization", `Bearer ${shopToken}`)
        .send({ status: "Completed" });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /invalid status transition/i);
    });

    it("should allow valid progression: Pending -> Ready", async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToVerifyId}/status`)
        .set("Authorization", `Bearer ${shopToken}`)
        .send({ status: "Ready" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "Ready");
    });

    it("should reject pickup verification with invalid token (400)", async () => {
      const res = await request(app)
        .post(`/api/orders/${orderToVerifyId}/verify-pickup`)
        .set("Authorization", `Bearer ${shopToken}`)
        .send({ token: "WRONGTOKEN" });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /invalid pickup verification code/i);
    });

    it("should verify pickup atomically with valid token and mark Completed (200)", async () => {
      const res = await request(app)
        .post(`/api/orders/${orderToVerifyId}/verify-pickup`)
        .set("Authorization", `Bearer ${shopToken}`)
        .send({ token: validToken });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.order.status, "Completed");
      assert.ok(res.body.order.verifiedAt);
    });

    it("should reject duplicate pickup attempt for already completed order (400)", async () => {
      const res = await request(app)
        .post(`/api/orders/${orderToVerifyId}/verify-pickup`)
        .set("Authorization", `Bearer ${shopToken}`)
        .send({ token: validToken });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /already been verified/i);
    });
  });
});
