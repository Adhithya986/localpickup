import { Router, Request, Response } from "express";
import { repository } from "../database";
import { getDatabase } from "../db/sqlite";
import { authenticateToken, requireRoles } from "../middleware/auth";
import { DBShop } from "../db/repository";

const router = Router();

// Protect all admin routes with authentication and Platform Admin role check
router.use(authenticateToken);
router.use(requireRoles("ADMIN", "PLATFORM_ADMIN"));

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : (param || "");

// ----------------------------------------------------
// A. Platform Overview & Metrics
// ----------------------------------------------------
router.get("/metrics", async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
    const totalCustomers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE global_role = 'CUSTOMER'").get() as any).c;
    const totalShops = (db.prepare("SELECT COUNT(*) as c FROM shops").get() as any).c;
    const activeShops = (db.prepare("SELECT COUNT(*) as c FROM shop_subscriptions WHERE status = 'ACTIVE'").get() as any).c;
    const suspendedShops = (db.prepare("SELECT COUNT(*) as c FROM shop_subscriptions WHERE status = 'SUSPENDED'").get() as any).c;
    const trialShops = (db.prepare("SELECT COUNT(*) as c FROM shop_subscriptions WHERE status = 'TRIAL'").get() as any).c;
    const expiredShops = (db.prepare("SELECT COUNT(*) as c FROM shop_subscriptions WHERE status = 'EXPIRED'").get() as any).c;
    const totalOrders = (db.prepare("SELECT COUNT(*) as c FROM orders").get() as any).c;
    const completedOrders = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'Completed'").get() as any).c;
    const pendingOrders = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'Pending'").get() as any).c;

    const revRow = db.prepare("SELECT SUM(total_amount) as total FROM orders WHERE status = 'Completed'").get() as any;
    const totalRevenue = revRow && revRow.total ? Math.round(revRow.total * 100) / 100 : 0;

    res.json({
      success: true,
      totalUsers,
      totalCustomers,
      totalShops,
      activeShops,
      suspendedShops,
      trialShops,
      expiredShops,
      totalOrders,
      completedOrders,
      pendingOrders,
      totalRevenue,
    });
  } catch (error) {
    console.error("Admin metrics error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------------------------------------------
// B. Shop Management & Directory
// ----------------------------------------------------
router.get("/shops", async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const shops = repository.getAllShops();

    const formatted = shops.map((s) => {
      const sub = repository.getShopSubscription(s.id);
      const owner = repository.getUserById(s.owner_id);

      const staffCount = (db.prepare("SELECT COUNT(*) as c FROM shop_members WHERE shop_id = ?").get(s.id) as any)?.c || 0;
      const productCount = (db.prepare("SELECT COUNT(*) as c FROM products WHERE shop_id = ?").get(s.id) as any)?.c || 0;
      const orderCount = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE shop_id = ?").get(s.id) as any)?.c || 0;
      const revRow = db.prepare("SELECT SUM(total_amount) as total FROM orders WHERE shop_id = ? AND status = 'Completed'").get(s.id) as any;
      const revenue = revRow && revRow.total ? Math.round(revRow.total * 100) / 100 : 0;

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        ownerId: s.owner_id,
        ownerName: owner?.name || "Unknown",
        ownerEmail: owner?.email || "Unknown",
        subscriptionStatus: sub?.status || s.subscription_status,
        planId: sub?.plan_id || "plan_starter",
        planName: sub?.plan?.name || "Standard Plan",
        trialEndsAt: sub?.trial_ends_at || null,
        currentPeriodEnd: sub?.current_period_end || null,
        requestedPlanId: sub?.requested_plan_id || null,
        requestedPlanName: sub?.requested_plan?.name || null,
        staffCount: Number(staffCount),
        maxStaff: sub?.plan?.maximum_staff || 3,
        productCount: Number(productCount),
        maxProducts: sub?.plan?.maximum_products || 50,
        orderCount: Number(orderCount),
        revenue,
        rating: s.rating,
        priceStarting: s.price_starting,
        createdAt: s.created_at,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error("Admin fetch shops error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/shops/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.id);
    const shop = repository.getShopById(shopId);
    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    const entitlements = repository.getShopEntitlements(shopId);
    const owner = repository.getUserById(shop.owner_id);
    const history = repository.getSubscriptionHistory(shopId);
    const staff = repository.getShopMembers(shopId);

    res.json({
      shop,
      owner,
      entitlements,
      staff,
      subscriptionHistory: history,
    });
  } catch (error) {
    console.error("Admin get shop details error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------------------------------------------
// C. Subscription Management
// ----------------------------------------------------
router.patch("/shops/:id/subscription", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const shopId = getParam(req.params.id);
    const shop = repository.getShopById(shopId);
    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    const { planId, status, extendDays, trialEndsAt, notes, reason } = req.body;
    let updatedSub = repository.getShopSubscription(shopId);

    // 1. Assign or change plan
    if (planId && typeof planId === "string") {
      updatedSub = repository.assignShopPlan(shopId, planId, user.id, notes || reason || "Admin assigned plan");
      repository.createAdminAuditLog({
        actorUserId: user.id,
        actorName: user.name,
        action: "PLAN_ASSIGNED",
        targetType: "SUBSCRIPTION",
        targetId: shopId,
        details: { planId, notes: notes || reason },
        ipAddress: req.ip,
      });
    }

    // 2. Extend trial
    if ((extendDays && typeof extendDays === "number" && extendDays > 0) || (trialEndsAt && typeof trialEndsAt === "string")) {
      if (trialEndsAt && typeof trialEndsAt === "string") {
        const db = getDatabase();
        const now = new Date().toISOString();
        db.prepare("UPDATE shop_subscriptions SET trial_ends_at = ?, status = 'TRIAL', updated_at = ? WHERE shop_id = ?").run(trialEndsAt, now, shopId);
        db.prepare("UPDATE shops SET subscription_status = 'TRIAL' WHERE id = ?").run(shopId);
        updatedSub = repository.getShopSubscription(shopId);
      } else {
        updatedSub = repository.extendShopTrial(shopId, extendDays, user.id);
      }
      repository.createAdminAuditLog({
        actorUserId: user.id,
        actorName: user.name,
        action: "TRIAL_EXTENDED",
        targetType: "SUBSCRIPTION",
        targetId: shopId,
        details: { extendDays, trialEndsAt, notes: notes || reason },
        ipAddress: req.ip,
      });
    }

    // 3. Update status (e.g., ACTIVE, SUSPENDED, EXPIRED, CANCELLED)
    if (status && typeof status === "string") {
      const validStatuses = ["TRIAL", "ACTIVE", "PAST_DUE", "EXPIRED", "SUSPENDED", "CANCELLED"];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: `Invalid subscription status. Allowed: ${validStatuses.join(", ")}` });
        return;
      }

      updatedSub = repository.updateShopSubscriptionStatus(shopId, status as any, user.id, notes || `Status changed to ${status}`);
      repository.createAdminAuditLog({
        actorUserId: user.id,
        actorName: user.name,
        action: status === "SUSPENDED" ? "STATUS_SUSPENDED" : status === "ACTIVE" ? "STATUS_ACTIVATED" : "STATUS_CHANGED",
        targetType: "SHOP",
        targetId: shopId,
        details: { status, notes },
        ipAddress: req.ip,
      });
    }

    res.json({
      success: true,
      message: "Subscription updated successfully",
      subscription: updatedSub,
    });
  } catch (error: any) {
    console.error("Admin update subscription error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

router.get("/shops/:id/subscription-history", async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.id);
    const history = repository.getSubscriptionHistory(shopId);
    res.json(history);
  } catch (error) {
    console.error("Admin fetch subscription history error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------------------------------------------
// D. Subscription Plans Management
// ----------------------------------------------------
router.get("/plans", async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const plans = repository.getAllSubscriptionPlans(true);

    const plansWithCounts = plans.map((p) => {
      const countRow = db.prepare("SELECT COUNT(*) as c FROM shop_subscriptions WHERE plan_id = ? AND status = 'ACTIVE'").get(p.id) as any;
      return {
        ...p,
        activeSubscribers: Number(countRow?.c || 0),
        features: p.feature_config_json ? JSON.parse(p.feature_config_json) : {},
      };
    });

    res.json(plansWithCounts);
  } catch (error) {
    console.error("Admin fetch plans error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/plans", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id, name, slug: providedSlug, description, monthlyPrice, maximumStaff, maximumProducts, analyticsLevel, features } = req.body;

    if (!name) {
      res.status(400).json({ error: "Plan name is required" });
      return;
    }

    const slug = providedSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const plan = repository.createSubscriptionPlan({
      id: id || undefined,
      name,
      slug,
      description,
      monthly_price: Number(monthlyPrice) || 0,
      maximum_staff: Math.max(1, parseInt(maximumStaff, 10) || 1),
      maximum_products: Math.max(0, parseInt(maximumProducts, 10) || 10),
      analytics_level: analyticsLevel || "BASIC",
      feature_config_json: features ? JSON.stringify(features) : undefined,
    });

    repository.createAdminAuditLog({
      actorUserId: user.id,
      actorName: user.name,
      action: "PLAN_CREATED",
      targetType: "PLAN",
      targetId: plan.id,
      details: { name, slug, monthlyPrice },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, plan });
  } catch (error: any) {
    console.error("Admin create plan error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

router.patch("/plans/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const planId = getParam(req.params.id);
    const { name, description, monthlyPrice, maximumStaff, maximumProducts, analyticsLevel, isActive } = req.body;

    const updated = repository.updateSubscriptionPlan(planId, {
      name,
      description,
      monthly_price: monthlyPrice !== undefined ? Number(monthlyPrice) : undefined,
      maximum_staff: maximumStaff !== undefined ? Number(maximumStaff) : undefined,
      maximum_products: maximumProducts !== undefined ? Number(maximumProducts) : undefined,
      analytics_level: analyticsLevel,
      is_active: isActive !== undefined ? (isActive ? 1 : 0) : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    repository.createAdminAuditLog({
      actorUserId: user.id,
      actorName: user.name,
      action: "PLAN_UPDATED",
      targetType: "PLAN",
      targetId: planId,
      details: req.body,
      ipAddress: req.ip,
    });

    res.json({ success: true, plan: updated });
  } catch (error: any) {
    console.error("Admin update plan error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// ----------------------------------------------------
// E. Administrative Audit Logs
// ----------------------------------------------------
router.get("/audit-logs", async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Math.max(parseInt(typeof req.query.limit === "string" ? req.query.limit : "50", 10) || 50, 1), 100);
    const offset = Math.max(parseInt(typeof req.query.offset === "string" ? req.query.offset : "0", 10) || 0, 0);

    const logs = repository.getAdminAuditLogs(limit, offset);
    res.json({
      success: true,
      logs: logs.map((l) => ({
        id: l.id,
        actorUserId: l.actor_user_id,
        actorName: l.actor_name,
        action: l.action,
        targetType: l.target_type,
        targetId: l.target_id,
        details: l.details_json ? JSON.parse(l.details_json) : null,
        ipAddress: l.ip_address,
        createdAt: l.created_at,
      })),
    });
  } catch (error) {
    console.error("Admin fetch audit logs error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
