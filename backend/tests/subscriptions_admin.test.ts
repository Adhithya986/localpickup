import { describe, it, before } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { app } from "../src/app";
import { repository, readDB } from "../src/database";
import { getDatabase } from "../src/db/sqlite";

describe("Milestone 5 SaaS Administration & Subscription Management Test Suite", () => {
  let adminToken = "";
  let shop1OwnerToken = "";
  let customer1Token = "";
  let customer2Token = "";

  const uniqueId = Date.now();
  let testShopId = `test-sub-shop-${uniqueId}`;
  let testShopOwnerToken = "";
  let testShopOwnerId = "";
  let otherShopId = `test-other-shop-${uniqueId}`;
  let otherShopOwnerToken = "";

  let microPlanId = `plan_micro_${uniqueId}`;

  before(async () => {
    process.env.NODE_ENV = "test";
    await readDB();

    // 1. Admin Login
    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@localpickup.com", password: "password123" });
    assert.strictEqual(adminRes.status, 200, "Admin login failed");
    adminToken = adminRes.body.token;

    // 2. Shop 1 Owner Login
    const shop1Res = await request(app)
      .post("/api/auth/login")
      .send({ email: "shop1@abc.com", password: "password123" });
    assert.strictEqual(shop1Res.status, 200, "Shop 1 login failed");
    shop1OwnerToken = shop1Res.body.token;

    // 3. Customer 1 Registration
    const cust1Res = await request(app)
      .post("/api/auth/register")
      .send({
        email: `sub_cust1_${uniqueId}@test.com`,
        password: "password123",
        name: "Sub Customer 1",
        role: "CUSTOMER",
      });
    assert.strictEqual(cust1Res.status, 201);
    customer1Token = cust1Res.body.token;

    // 4. Customer 2 Registration
    const cust2Res = await request(app)
      .post("/api/auth/register")
      .send({
        email: `sub_cust2_${uniqueId}@test.com`,
        password: "password123",
        name: "Sub Customer 2",
        role: "CUSTOMER",
      });
    assert.strictEqual(cust2Res.status, 201);
    customer2Token = cust2Res.body.token;

    // 5. Create Test Shop Owner & Shop
    const ownerRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: `sub_owner_${uniqueId}@test.com`,
        password: "password123",
        name: "Sub Shop Owner",
        role: "SHOP_OWNER",
      });
    assert.strictEqual(ownerRes.status, 201);
    testShopOwnerToken = ownerRes.body.token;
    testShopOwnerId = ownerRes.body.user.id;

    repository.createShop({
      id: testShopId,
      name: "Subscription Test Store",
      description: "Store for quota & lifecycle verification",
      owner_id: testShopOwnerId,
      address: "123 Quota Way",
      phone: "555-0199",
      is_active: 1,
      subscription_status: "ACTIVE",
    });

    // 6. Create Other Shop Owner & Other Shop
    const otherOwnerRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: `other_owner_${uniqueId}@test.com`,
        password: "password123",
        name: "Other Shop Owner",
        role: "SHOP_OWNER",
      });
    assert.strictEqual(otherOwnerRes.status, 201);
    otherShopOwnerToken = otherOwnerRes.body.token;

    repository.createShop({
      id: otherShopId,
      name: "Other Isolated Shop",
      description: "Store for cross-tenant defense",
      owner_id: otherOwnerRes.body.user.id,
      address: "456 Isolation St",
      phone: "555-0200",
      is_active: 1,
      subscription_status: "ACTIVE",
    });

    // 7. Admin creates Micro Plan with tight quotas for testing (maxStaff: 2, maxProducts: 2)
    const planRes = await request(app)
      .post("/api/admin/plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        id: microPlanId,
        name: `Micro Test Plan ${uniqueId}`,
        slug: `micro-test-${uniqueId}`,
        monthlyPrice: 199,
        maximumStaff: 2,
        maximumProducts: 2,
        analyticsLevel: "BASIC",
        features: ["PRINT_BOOKING", "STATIONERY_CATALOGUE"],
      });
    assert.strictEqual(planRes.status, 201, "Admin plan creation failed: " + JSON.stringify(planRes.body));

    // Assign Micro Plan to testShopId
    const assignRes = await request(app)
      .patch(`/api/admin/shops/${testShopId}/subscription`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        planId: microPlanId,
        status: "ACTIVE",
        reason: "Initial setup for automated test suite",
      });
    assert.strictEqual(assignRes.status, 200, "Admin plan assignment failed");
  });

  describe("A. Platform Administration & Role-Based Authorization", () => {
    it("blocks unauthenticated access to admin endpoints (401)", async () => {
      const res1 = await request(app).get("/api/admin/metrics");
      assert.strictEqual(res1.status, 401);

      const res2 = await request(app).get("/api/admin/shops");
      assert.strictEqual(res2.status, 401);

      const res3 = await request(app).get("/api/admin/plans");
      assert.strictEqual(res3.status, 401);

      const res4 = await request(app).get("/api/admin/audit-logs");
      assert.strictEqual(res4.status, 401);
    });

    it("blocks customers from accessing platform admin endpoints (403)", async () => {
      const res = await request(app)
        .get("/api/admin/metrics")
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(res.status, 403);
    });

    it("blocks shop owners from accessing platform admin endpoints (403)", async () => {
      const res = await request(app)
        .get("/api/admin/metrics")
        .set("Authorization", `Bearer ${testShopOwnerToken}`);
      assert.strictEqual(res.status, 403);
    });

    it("blocks shop owners from directly altering subscription via admin endpoint (403)", async () => {
      const res = await request(app)
        .patch(`/api/admin/shops/${testShopId}/subscription`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({ planId: "plan_enterprise", status: "ACTIVE" });
      assert.strictEqual(res.status, 403);
    });

    it("allows platform admin to retrieve platform metrics, shops, and plans (200)", async () => {
      const metricsRes = await request(app)
        .get("/api/admin/metrics")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.strictEqual(metricsRes.status, 200);
      assert.ok(typeof metricsRes.body.totalShops === "number");
      assert.ok(typeof metricsRes.body.totalOrders === "number");

      const shopsRes = await request(app)
        .get("/api/admin/shops")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.strictEqual(shopsRes.status, 200);
      assert.ok(Array.isArray(shopsRes.body));

      const plansRes = await request(app)
        .get("/api/admin/plans")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.strictEqual(plansRes.status, 200);
      assert.ok(Array.isArray(plansRes.body));
    });
  });

  describe("B. Subscription Billing Boundaries & Upgrade Requests", () => {
    it("shop owner requesting plan upgrade only records requested_plan_id without unauthorized self-elevation", async () => {
      const res = await request(app)
        .post(`/api/shops/${testShopId}/subscription/request-change`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({ requestedPlanId: "plan_enterprise" });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.subscription.requested_plan_id, "plan_enterprise");
      // CRITICAL: plan_id MUST still be microPlanId until authorized by admin!
      assert.strictEqual(res.body.subscription.plan_id, microPlanId);

      // Verify in DB repository directly
      const sub = repository.getShopSubscription(testShopId);
      assert.strictEqual(sub?.plan_id, microPlanId);
      assert.strictEqual(sub?.requested_plan_id, "plan_enterprise");
    });

    it("rejects plan change request referencing non-existent plan (404)", async () => {
      const res = await request(app)
        .post(`/api/shops/${testShopId}/subscription/request-change`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({ requestedPlanId: "plan_non_existent" });
      assert.strictEqual(res.status, 404);
    });
  });

  describe("C. Cross-Shop Subscription Isolation", () => {
    it("prevents Shop 1 Owner from viewing Shop 2 subscription details (403)", async () => {
      const res = await request(app)
        .get(`/api/shops/${otherShopId}/subscription`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`);
      assert.strictEqual(res.status, 403);
    });

    it("prevents Shop 1 Owner from requesting plan changes for Shop 2 (403)", async () => {
      const res = await request(app)
        .post(`/api/shops/${otherShopId}/subscription/request-change`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({ requestedPlanId: "plan_starter" });
      assert.strictEqual(res.status, 403);
    });

    it("prevents customers from accessing shop subscription details (403)", async () => {
      const res = await request(app)
        .get(`/api/shops/${testShopId}/subscription`)
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(res.status, 403);
    });
  });

  describe("D. Staff Quota Ceiling Enforcement", () => {
    let staff1Email = `staff1_${uniqueId}@test.com`;
    let staff2Email = `staff2_${uniqueId}@test.com`;
    let staff3Email = `staff3_${uniqueId}@test.com`;

    before(async () => {
      // Register staff accounts first so they exist in user repository
      await request(app).post("/api/auth/register").send({ email: staff1Email, password: "password123", name: "Staff Member 1", role: "CUSTOMER" });
      await request(app).post("/api/auth/register").send({ email: staff2Email, password: "password123", name: "Staff Member 2", role: "CUSTOMER" });
      await request(app).post("/api/auth/register").send({ email: staff3Email, password: "password123", name: "Staff Member 3", role: "CUSTOMER" });
    });

    it("allows adding staff members up to maximum_staff ceiling (2 staff)", async () => {
      // 1st Staff
      const res1 = await request(app)
        .post(`/api/shops/${testShopId}/staff`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({ email: staff1Email, name: "Staff Member 1" });
      assert.strictEqual(res1.status, 201);

      // 2nd Staff
      const res2 = await request(app)
        .post(`/api/shops/${testShopId}/staff`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({ email: staff2Email, name: "Staff Member 2" });
      assert.strictEqual(res2.status, 201);
    });

    it("blocks adding staff member exceeding plan limit (400)", async () => {
      // 3rd Staff exceeds micro plan limit of 2 staff
      const res3 = await request(app)
        .post(`/api/shops/${testShopId}/staff`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({ email: staff3Email, name: "Staff Member 3" });

      assert.strictEqual(res3.status, 400);
      assert.ok(res3.body.error.includes("limit") && res3.body.error.includes("reached"));
    });

    it("entitlements API accurately reflects current staff count and quota saturation", async () => {
      const res = await request(app)
        .get(`/api/shops/${testShopId}/subscription`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.entitlements.currentStaffCount, 2);
      assert.strictEqual(res.body.entitlements.maxStaff, 2);
      assert.strictEqual(res.body.entitlements.canAddStaff, false);
    });
  });

  describe("E. Product Catalogue Limit Enforcement", () => {
    it("allows creating products up to maximum_products limit (2 products)", async () => {
      const res1 = await request(app)
        .post(`/api/shops/${testShopId}/products`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({
          name: "Test Notebook",
          price: 45,
          stockQuantity: 20,
        });
      assert.strictEqual(res1.status, 201);

      const res2 = await request(app)
        .post(`/api/shops/${testShopId}/products`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({
          name: "Gel Pen Blue",
          price: 15,
          stockQuantity: 50,
        });
      assert.strictEqual(res2.status, 201);
    });

    it("blocks creating product exceeding plan limit (400)", async () => {
      const res3 = await request(app)
        .post(`/api/shops/${testShopId}/products`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`)
        .send({
          name: "Highlighter Marker",
          price: 30,
          stockQuantity: 10,
        });
      assert.strictEqual(res3.status, 400);
      assert.ok(res3.body.error.includes("limit") && res3.body.error.includes("reached"));
    });
  });

  describe("F. Suspended and Expired Subscription Restrictions & Order Access", () => {
    let orderBeforeSuspensionId = "";

    before(async () => {
      // Temporarily elevate plan so we can place an initial order
      const prodRes = await request(app)
        .get(`/api/shops/${testShopId}/products`)
        .set("Authorization", `Bearer ${customer1Token}`);
      const testProd = prodRes.body[0];

      // Customer places valid order while shop is ACTIVE
      const ordRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customer1Token}`)
        .send({
          shopId: testShopId,
          pickupTime: "17:30",
          items: [{ productId: testProd.id, quantity: 1 }],
        });
      assert.strictEqual(ordRes.status, 201);
      orderBeforeSuspensionId = ordRes.body.id;
    });

    it("admin suspends shop subscription", async () => {
      const res = await request(app)
        .patch(`/api/admin/shops/${testShopId}/subscription`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          status: "SUSPENDED",
          reason: "Payment dispute investigation",
        });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.subscription.status, "SUSPENDED");
    });

    it("suspended shop rejects new customer orders (403)", async () => {
      const prodRes = await request(app)
        .get(`/api/shops/${testShopId}/products`)
        .set("Authorization", `Bearer ${customer2Token}`);
      const testProd = prodRes.body[0];

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customer2Token}`)
        .send({
          shopId: testShopId,
          pickupTime: "18:00",
          items: [{ productId: testProd.id, quantity: 1 }],
        });
      assert.strictEqual(res.status, 403);
      assert.ok(res.body.error.includes("suspended"));
    });

    it("existing orders remain accessible when shop is suspended", async () => {
      // Customer can still view their existing order
      const custRes = await request(app)
        .get(`/api/orders/${orderBeforeSuspensionId}`)
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(custRes.status, 200);
      assert.strictEqual(custRes.body.id, orderBeforeSuspensionId);

      // Shop owner can still view their existing orders
      const shopRes = await request(app)
        .get(`/api/orders/${orderBeforeSuspensionId}`)
        .set("Authorization", `Bearer ${testShopOwnerToken}`);
      assert.strictEqual(shopRes.status, 200);
    });

    it("admin transitions shop to EXPIRED status", async () => {
      const res = await request(app)
        .patch(`/api/admin/shops/${testShopId}/subscription`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          status: "EXPIRED",
          reason: "Trial grace period ended",
        });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.subscription.status, "EXPIRED");
    });

    it("expired shop rejects new customer orders (403)", async () => {
      const prodRes = await request(app)
        .get(`/api/shops/${testShopId}/products`)
        .set("Authorization", `Bearer ${customer1Token}`);
      const testProd = prodRes.body[0];

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customer1Token}`)
        .send({
          shopId: testShopId,
          pickupTime: "18:30",
          items: [{ productId: testProd.id, quantity: 1 }],
        });
      assert.strictEqual(res.status, 403);
      assert.ok(res.body.error.includes("expired"));
    });

    it("reactivating shop restores order acceptance", async () => {
      const reactivateRes = await request(app)
        .patch(`/api/admin/shops/${testShopId}/subscription`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          status: "ACTIVE",
          reason: "Payment verified by finance team",
        });
      assert.strictEqual(reactivateRes.status, 200);

      const prodRes = await request(app)
        .get(`/api/shops/${testShopId}/products`)
        .set("Authorization", `Bearer ${customer1Token}`);
      const testProd = prodRes.body[0];

      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customer1Token}`)
        .send({
          shopId: testShopId,
          pickupTime: "19:00",
          items: [{ productId: testProd.id, quantity: 1 }],
        });
      assert.strictEqual(orderRes.status, 201);
    });
  });

  describe("G. Admin Audit Logs & Subscription History", () => {
    it("admin operations generate structured audit log entries", async () => {
      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.logs));
      assert.ok(res.body.logs.length > 0);

      const shopLogs = res.body.logs.filter((log: any) => log.targetId === testShopId || log.target_id === testShopId);
      assert.ok(shopLogs.length >= 2, "Expected audit logs for shop status and plan updates");

      // Verify passwords and tokens are never logged in details
      for (const log of res.body.logs) {
        if (log.details) {
          const detailStr = JSON.stringify(log.details);
          assert.strictEqual(detailStr.includes("password"), false);
          assert.strictEqual(detailStr.includes("token"), false);
        }
      }
    });

    it("subscription history records all plan and status transitions", async () => {
      const res = await request(app)
        .get(`/api/admin/shops/${testShopId}/subscription-history`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length >= 3);

      const statuses = res.body.map((h: any) => h.to_status || h.new_status);
      assert.ok(statuses.includes("SUSPENDED"));
      assert.ok(statuses.includes("EXPIRED"));
      assert.ok(statuses.includes("ACTIVE"));
    });
  });

  describe("H. Subscription State Transitions & Invalid State Handling", () => {
    it("rejects invalid subscription status values (400)", async () => {
      const res = await request(app)
        .patch(`/api/admin/shops/${testShopId}/subscription`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "INVALID_STATE_XYZ" });
      assert.strictEqual(res.status, 400);
    });

    it("admin can extend trial date for shops on trial", async () => {
      // First put shop on TRIAL
      await request(app)
        .patch(`/api/admin/shops/${testShopId}/subscription`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "TRIAL", reason: "Evaluating features" });

      const newDate = new Date(Date.now() + 30 * 86400000).toISOString();
      const extendRes = await request(app)
        .patch(`/api/admin/shops/${testShopId}/subscription`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ trialEndsAt: newDate, reason: "Courtesy trial extension" });

      assert.strictEqual(extendRes.status, 200);
      assert.strictEqual(extendRes.body.subscription.trial_ends_at, newDate);
    });
  });
});
