"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const database_1 = require("../src/database");
(0, node_test_1.describe)("Milestone 1 Security & Authentication Suite", () => {
    let adminToken = "";
    let shopToken = "";
    let customerToken = "";
    let otherCustomerToken = "";
    (0, node_test_1.before)(async () => {
        process.env.NODE_ENV = "test";
        await (0, database_1.readDB)(); // Warm up db and hash passwords
        // 1. Log in admin
        const adminRes = await (0, supertest_1.default)(app_1.app)
            .post("/api/auth/login")
            .send({ email: "admin@localpickup.com", password: "password123" });
        node_assert_1.default.strictEqual(adminRes.status, 200, "Admin login failed");
        adminToken = adminRes.body.token;
        // 2. Log in shopkeeper
        const shopRes = await (0, supertest_1.default)(app_1.app)
            .post("/api/auth/login")
            .send({ email: "shop1@abc.com", password: "password123" });
        node_assert_1.default.strictEqual(shopRes.status, 200, "Shop login failed");
        shopToken = shopRes.body.token;
        // 3. Log in customer
        const custRes = await (0, supertest_1.default)(app_1.app)
            .post("/api/auth/login")
            .send({ email: "customer@gmail.com", password: "password123" });
        node_assert_1.default.strictEqual(custRes.status, 200, "Customer login failed");
        customerToken = custRes.body.token;
        // 4. Register a second test customer for isolation testing
        const randEmail = `isolated_${Date.now()}@test.com`;
        const regRes = await (0, supertest_1.default)(app_1.app)
            .post("/api/auth/register")
            .send({
            email: randEmail,
            password: "password123",
            name: "Isolated Customer",
            role: "CUSTOMER",
        });
        node_assert_1.default.strictEqual(regRes.status, 201, "Customer 2 registration failed");
        otherCustomerToken = regRes.body.token;
    });
    (0, node_test_1.describe)("Authentication & Registration Security", () => {
        (0, node_test_1.it)("should reject invalid login credentials with uniform generic error", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .post("/api/auth/login")
                .send({ email: "admin@localpickup.com", password: "wrongpassword" });
            node_assert_1.default.strictEqual(res.status, 401);
            node_assert_1.default.strictEqual(res.body.error, "Invalid email or password");
        });
        (0, node_test_1.it)("should reject non-existent user with same generic error (prevent enumeration)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .post("/api/auth/login")
                .send({ email: "nonexistent@user.com", password: "password123" });
            node_assert_1.default.strictEqual(res.status, 401);
            node_assert_1.default.strictEqual(res.body.error, "Invalid email or password");
        });
        (0, node_test_1.it)("should prevent public self-registration from gaining ADMIN privileges", async () => {
            const hackerEmail = `hacker_${Date.now()}@test.com`;
            const res = await (0, supertest_1.default)(app_1.app)
                .post("/api/auth/register")
                .send({
                email: hackerEmail,
                password: "password123",
                name: "Hacker Attempt",
                role: "ADMIN", // Malicious attempt to escalate to ADMIN
            });
            node_assert_1.default.strictEqual(res.status, 201);
            node_assert_1.default.notStrictEqual(res.body.role, "ADMIN");
            node_assert_1.default.strictEqual(res.body.role, "CUSTOMER", "Role must default to CUSTOMER");
        });
    });
    (0, node_test_1.describe)("Role-Based Access Control (RBAC)", () => {
        (0, node_test_1.it)("should reject unauthenticated requests to protected endpoints", async () => {
            const resOrders = await (0, supertest_1.default)(app_1.app).get("/api/orders");
            node_assert_1.default.strictEqual(resOrders.status, 401);
            const resAdmin = await (0, supertest_1.default)(app_1.app).get("/api/admin/shops");
            node_assert_1.default.strictEqual(resAdmin.status, 401);
        });
        (0, node_test_1.it)("should reject customer access to platform admin endpoints (403)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get("/api/admin/shops")
                .set("Authorization", `Bearer ${customerToken}`);
            node_assert_1.default.strictEqual(res.status, 403);
        });
        (0, node_test_1.it)("should reject shopkeeper access to platform admin endpoints (403)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get("/api/admin/shops")
                .set("Authorization", `Bearer ${shopToken}`);
            node_assert_1.default.strictEqual(res.status, 403);
        });
        (0, node_test_1.it)("should allow platform admin to access admin endpoints (200)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get("/api/admin/shops")
                .set("Authorization", `Bearer ${adminToken}`);
            node_assert_1.default.strictEqual(res.status, 200);
            node_assert_1.default.ok(Array.isArray(res.body));
        });
    });
    (0, node_test_1.describe)("Server-Side Price Calculation & Tamper Resistance", () => {
        (0, node_test_1.it)("should override client-tampered price with server-calculated price", async () => {
            const dummyFile = Buffer.from("%PDF-1.4 test document content");
            // Attempt to tamper with price: send total = 0.01
            const res = await (0, supertest_1.default)(app_1.app)
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
            node_assert_1.default.strictEqual(res.status, 201);
            // Expected: A4 BW (2) * 10 = 20 + Binding (20) = 40. Client total (0.01) must be ignored!
            node_assert_1.default.strictEqual(res.body.total, 40, "Price tampering was not prevented! Expected server total 40");
            node_assert_1.default.ok(res.body.id.startsWith("LP-"));
            node_assert_1.default.ok(res.body.pickupToken, "Secure pickup token must be generated");
        });
    });
    (0, node_test_1.describe)("Document Storage Security & Unauthorized Access", () => {
        let testOrderId = "";
        (0, node_test_1.before)(async () => {
            const dummyFile = Buffer.from("Secret document content");
            const res = await (0, supertest_1.default)(app_1.app)
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
        });
        (0, node_test_1.it)("should block unauthenticated access to customer document", async () => {
            const res = await (0, supertest_1.default)(app_1.app).get(`/api/documents/${testOrderId}`);
            node_assert_1.default.strictEqual(res.status, 401);
        });
        (0, node_test_1.it)("should block another customer from downloading this document (403)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get(`/api/documents/${testOrderId}`)
                .set("Authorization", `Bearer ${otherCustomerToken}`);
            node_assert_1.default.strictEqual(res.status, 403);
        });
        (0, node_test_1.it)("should allow the customer who placed the order to download the document (200)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get(`/api/documents/${testOrderId}`)
                .set("Authorization", `Bearer ${customerToken}`);
            node_assert_1.default.strictEqual(res.status, 200);
            node_assert_1.default.strictEqual(res.headers["x-content-type-options"], "nosniff");
        });
        (0, node_test_1.it)("should allow the shopkeeper of shop 1 to download the document (200)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get(`/api/documents/${testOrderId}`)
                .set("Authorization", `Bearer ${shopToken}`);
            node_assert_1.default.strictEqual(res.status, 200);
        });
    });
    (0, node_test_1.describe)("Order Lifecycle & Atomic Pickup Verification", () => {
        let orderToVerifyId = "";
        let validToken = "";
        (0, node_test_1.before)(async () => {
            const dummyFile = Buffer.from("Print assignment");
            const res = await (0, supertest_1.default)(app_1.app)
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
        (0, node_test_1.it)("should prevent customer from updating order status (403)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .patch(`/api/orders/${orderToVerifyId}/status`)
                .set("Authorization", `Bearer ${customerToken}`)
                .send({ status: "Ready" });
            node_assert_1.default.strictEqual(res.status, 403);
        });
        (0, node_test_1.it)("should prevent illegal status transition: Pending directly to Completed (400)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .patch(`/api/orders/${orderToVerifyId}/status`)
                .set("Authorization", `Bearer ${shopToken}`)
                .send({ status: "Completed" });
            node_assert_1.default.strictEqual(res.status, 400);
            node_assert_1.default.match(res.body.error, /invalid status transition/i);
        });
        (0, node_test_1.it)("should allow valid progression: Pending -> Ready", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .patch(`/api/orders/${orderToVerifyId}/status`)
                .set("Authorization", `Bearer ${shopToken}`)
                .send({ status: "Ready" });
            node_assert_1.default.strictEqual(res.status, 200);
            node_assert_1.default.strictEqual(res.body.status, "Ready");
        });
        (0, node_test_1.it)("should reject pickup verification with invalid token (400)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .post(`/api/orders/${orderToVerifyId}/verify-pickup`)
                .set("Authorization", `Bearer ${shopToken}`)
                .send({ token: "WRONGTOKEN" });
            node_assert_1.default.strictEqual(res.status, 400);
            node_assert_1.default.match(res.body.error, /invalid pickup verification code/i);
        });
        (0, node_test_1.it)("should verify pickup atomically with valid token and mark Completed (200)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .post(`/api/orders/${orderToVerifyId}/verify-pickup`)
                .set("Authorization", `Bearer ${shopToken}`)
                .send({ token: validToken });
            node_assert_1.default.strictEqual(res.status, 200);
            node_assert_1.default.strictEqual(res.body.success, true);
            node_assert_1.default.strictEqual(res.body.order.status, "Completed");
            node_assert_1.default.ok(res.body.order.verifiedAt);
        });
        (0, node_test_1.it)("should reject duplicate pickup attempt for already completed order (400)", async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .post(`/api/orders/${orderToVerifyId}/verify-pickup`)
                .set("Authorization", `Bearer ${shopToken}`)
                .send({ token: validToken });
            node_assert_1.default.strictEqual(res.status, 400);
            node_assert_1.default.match(res.body.error, /already been verified/i);
        });
    });
});
