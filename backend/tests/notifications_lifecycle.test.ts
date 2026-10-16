import { describe, it, before } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { app } from "../src/app";
import { repository, readDB } from "../src/database";

describe("Milestone 4 Order Lifecycle, Notifications & Timeline Test Suite", () => {
  let shop1OwnerToken = "";
  let shop1OwnerId = "";
  let customer1Token = "";
  let customer1Id = "";
  let customer2Token = "";
  let customer2Id = "";
  let shop2OwnerToken = "";
  let shop2OwnerId = "";

  const shop1Id = "1";
  let shop2Id = "";
  let order1Id = "";
  let order1PickupToken = "";
  let notifIdCustomer = "";

  before(async () => {
    process.env.NODE_ENV = "test";
    await readDB();

    // 1. Ensure shop 1 is ACTIVE
    const db = repository["db"];
    db.prepare("UPDATE shops SET subscription_status = 'ACTIVE' WHERE id = '1'").run();

    // 2. Log in Shop 1 Owner (shop1@abc.com)
    const shop1Res = await request(app)
      .post("/api/auth/login")
      .send({ email: "shop1@abc.com", password: "password123" });
    assert.strictEqual(shop1Res.status, 200);
    shop1OwnerToken = shop1Res.body.token;
    shop1OwnerId = shop1Res.body.user.id;

    // 3. Register Customer 1
    const cust1Email = `m4_cust1_${Date.now()}@test.com`;
    const regCust1 = await request(app)
      .post("/api/auth/register")
      .send({
        email: cust1Email,
        password: "password123",
        name: "Milestone 4 Customer 1",
        role: "CUSTOMER",
      });
    assert.strictEqual(regCust1.status, 201);
    customer1Token = regCust1.body.token;
    customer1Id = regCust1.body.user.id;

    // 4. Register Customer 2
    const cust2Email = `m4_cust2_${Date.now()}@test.com`;
    const regCust2 = await request(app)
      .post("/api/auth/register")
      .send({
        email: cust2Email,
        password: "password123",
        name: "Milestone 4 Customer 2",
        role: "CUSTOMER",
      });
    assert.strictEqual(regCust2.status, 201);
    customer2Token = regCust2.body.token;
    customer2Id = regCust2.body.user.id;

    // 5. Register Shop 2 Owner and Shop 2
    const shop2Email = `m4_shop2_${Date.now()}@test.com`;
    const regShop2 = await request(app)
      .post("/api/auth/register")
      .send({
        email: shop2Email,
        password: "password123",
        name: "Milestone 4 Shop 2 Owner",
        role: "SHOP_OWNER",
      });
    assert.strictEqual(regShop2.status, 201);
    shop2OwnerToken = regShop2.body.token;
    shop2OwnerId = regShop2.body.user.id;
    shop2Id = `shop-m4-${Date.now()}`;

    repository.createShop({
      id: shop2Id,
      name: "Shop 2 Enterprise Prints",
      slug: `shop-2-enterprise-${Date.now()}`,
      owner_id: shop2OwnerId,
      price_starting: "From ₹3",
      rating: 4.9,
    });
    repository.addShopMember(shop2Id, shop2OwnerId, "OWNER");
  });

  describe("A. Order Placement & Notification Generation", () => {
    it("generates in-app notifications for both customer and shop staff upon order placement", async () => {
      const dummyDoc = Buffer.from("%PDF-1.4 Milestone 4 Test Document");
      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customer1Token}`)
        .field("shopId", shop1Id)
        .field("pickupTime", "2026-10-25T15:00:00")
        .field("paper", "A4")
        .field("colour", "bw")
        .field("sides", "single")
        .field("copies", "2")
        .attach("file", dummyDoc, "project_doc.pdf");

      assert.strictEqual(orderRes.status, 201);
      order1Id = orderRes.body.id;
      order1PickupToken = orderRes.body.pickupToken;
      assert.ok(order1Id);
      assert.ok(order1PickupToken);

      // Verify customer received ORDER_PLACED notification
      const custNotifRes = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(custNotifRes.status, 200);
      assert.ok(Array.isArray(custNotifRes.body.notifications));

      const custNotif = custNotifRes.body.notifications.find(
        (n: any) => n.orderId === order1Id && n.type === "ORDER_PLACED"
      );
      assert.ok(custNotif, "Customer should receive ORDER_PLACED notification");
      assert.strictEqual(custNotif.isRead, false);
      notifIdCustomer = custNotif.id;

      // Verify shop owner received ORDER_PLACED notification
      const shopNotifRes = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${shop1OwnerToken}`);
      assert.strictEqual(shopNotifRes.status, 200);

      const shopNotif = shopNotifRes.body.notifications.find(
        (n: any) => n.orderId === order1Id && n.type === "ORDER_PLACED"
      );
      assert.ok(shopNotif, "Shopkeeper should receive ORDER_PLACED notification");
      assert.strictEqual(shopNotif.isRead, false);
    });
  });

  describe("B. Granular Order Lifecycle Transitions & Customer Alerts", () => {
    it("transitions Pending -> Accepted and notifies customer", async () => {
      const res = await request(app)
        .patch(`/api/orders/${order1Id}/status`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({ status: "Accepted" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "Accepted");

      // Verify customer received ORDER_ACCEPTED notification
      const notifRes = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(notifRes.status, 200);

      const notif = notifRes.body.notifications.find(
        (n: any) => n.orderId === order1Id && n.type === "ORDER_ACCEPTED"
      );
      assert.ok(notif, "Customer should receive ORDER_ACCEPTED notification");
    });

    it("transitions Accepted -> Preparing and notifies customer", async () => {
      const res = await request(app)
        .patch(`/api/orders/${order1Id}/status`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({ status: "Preparing" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "Preparing");

      // Verify customer received ORDER_PREPARING notification
      const notifRes = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${customer1Token}`);
      const notif = notifRes.body.notifications.find(
        (n: any) => n.orderId === order1Id && n.type === "ORDER_PREPARING"
      );
      assert.ok(notif, "Customer should receive ORDER_PREPARING notification");
    });

    it("transitions Preparing -> Ready and notifies customer with pickup instructions", async () => {
      const res = await request(app)
        .patch(`/api/orders/${order1Id}/status`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({ status: "Ready" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, "Ready");

      // Verify customer received ORDER_READY notification
      const notifRes = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${customer1Token}`);
      const notif = notifRes.body.notifications.find(
        (n: any) => n.orderId === order1Id && n.type === "ORDER_READY"
      );
      assert.ok(notif, "Customer should receive ORDER_READY notification");
      assert.match(notif.message, /ready at the shop counter/i);
    });

    it("atomically verifies pickup with token and dispatches ORDER_COMPLETED notification", async () => {
      const verifyRes = await request(app)
        .post(`/api/orders/${order1Id}/verify-pickup`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`)
        .send({ token: order1PickupToken });
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.body.order.status, "Completed");

      // Verify customer received ORDER_COMPLETED notification
      const notifRes = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${customer1Token}`);
      const notif = notifRes.body.notifications.find(
        (n: any) => n.orderId === order1Id && n.type === "ORDER_COMPLETED"
      );
      assert.ok(notif, "Customer should receive ORDER_COMPLETED notification");
    });
  });

  describe("C. Notification Read Status & Counters", () => {
    it("returns accurate unread notification count", async () => {
      const countRes = await request(app)
        .get("/api/notifications/unread-count")
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(countRes.status, 200);
      assert.ok(countRes.body.count >= 4, "Customer should have at least 4 unread notifications");
    });

    it("marks a single notification as read and decrements count", async () => {
      const beforeCountRes = await request(app)
        .get("/api/notifications/unread-count")
        .set("Authorization", `Bearer ${customer1Token}`);
      const initialCount = beforeCountRes.body.count;

      const readRes = await request(app)
        .patch(`/api/notifications/${notifIdCustomer}/read`)
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(readRes.status, 200);

      const afterCountRes = await request(app)
        .get("/api/notifications/unread-count")
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(afterCountRes.body.count, initialCount - 1);
    });

    it("marks all notifications as read at once", async () => {
      const markAllRes = await request(app)
        .post("/api/notifications/mark-all-read")
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(markAllRes.status, 200);

      const countRes = await request(app)
        .get("/api/notifications/unread-count")
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(countRes.body.count, 0);
    });
  });

  describe("D. Security & Multi-Tenant Notification Isolation", () => {
    it("rejects unauthenticated requests to notifications (401)", async () => {
      const res = await request(app).get("/api/notifications");
      assert.strictEqual(res.status, 401);
    });

    it("prevents Customer 2 from marking Customer 1's notification as read (404/denied)", async () => {
      const res = await request(app)
        .patch(`/api/notifications/${notifIdCustomer}/read`)
        .set("Authorization", `Bearer ${customer2Token}`);
      assert.strictEqual(res.status, 404);
    });
  });

  describe("E. Order Timeline & History API", () => {
    it("returns complete chronological status lifecycle for order", async () => {
      const res = await request(app)
        .get(`/api/orders/${order1Id}/timeline`)
        .set("Authorization", `Bearer ${customer1Token}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.orderId, order1Id);
      assert.ok(Array.isArray(res.body.timeline));

      const statuses = res.body.timeline.map((t: any) => t.toStatus);
      assert.ok(statuses.includes("Pending"));
      assert.ok(statuses.includes("Accepted"));
      assert.ok(statuses.includes("Preparing"));
      assert.ok(statuses.includes("Ready"));
      assert.ok(statuses.includes("Completed"));
    });

    it("blocks unauthorized Customer 2 from viewing Customer 1's order timeline (403)", async () => {
      const res = await request(app)
        .get(`/api/orders/${order1Id}/timeline`)
        .set("Authorization", `Bearer ${customer2Token}`);
      assert.strictEqual(res.status, 403);
    });

    it("blocks Shop 2 Owner from viewing Shop 1's order timeline (403)", async () => {
      const res = await request(app)
        .get(`/api/orders/${order1Id}/timeline`)
        .set("Authorization", `Bearer ${shop2OwnerToken}`);
      assert.strictEqual(res.status, 403);
    });

    it("allows Shop 1 Owner to view Shop 1 order timeline (200)", async () => {
      const res = await request(app)
        .get(`/api/orders/${order1Id}/timeline`)
        .set("Authorization", `Bearer ${shop1OwnerToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.orderId, order1Id);
    });
  });
});
