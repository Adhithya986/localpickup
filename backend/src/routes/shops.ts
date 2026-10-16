import { Router, Request, Response } from "express";
import { repository } from "../database";
import { authenticateToken, isPlatformAdmin } from "../middleware/auth";
import { DBShop } from "../db/repository";

const router = Router();
const getParam = (p: string | string[] | undefined): string => Array.isArray(p) ? p[0] : (p || "");

function formatClientShop(s: DBShop) {
  return {
    id: s.id,
    name: s.name,
    description: s.description || "",
    distance: s.distance || "1.0 km",
    price: s.price_starting || "From ₹2",
    rating: s.rating.toString(),
    ownerId: s.owner_id,
    subscriptionStatus: s.subscription_status === "CANCELLED" ? "SUSPENDED" : s.subscription_status,
    address: s.address || undefined,
    phone: s.phone || undefined,
    pricingConfig: s.pricing_config_json ? JSON.parse(s.pricing_config_json) : undefined,
  };
}

// GET /api/shops - Public shop list
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const shops = repository.getAllShops();
    res.json(shops.map(formatClientShop));
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/shops/mine - Authenticated shopkeeper gets their owned shop
router.get("/mine", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const memberships = repository.getUserMemberships(user.id);
    let shop = memberships[0] ? repository.getShopById(memberships[0].shop_id) : undefined;

    if (!shop) {
      shop = repository.getShopByOwnerId(user.id);
    }

    if (!shop) {
      res.status(404).json({ error: "No shop associated with this user account" });
      return;
    }

    res.json(formatClientShop(shop));
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/shops/:id - Public specific shop
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const shop = repository.getShopById(getParam(req.params.id));
    if (shop) {
      res.json(formatClientShop(shop));
    } else {
      res.status(404).json({ error: "Shop not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/shops/:id - Update shop profile (Owner or Admin only)
router.put("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const shop = repository.getShopById(getParam(req.params.id));

    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    const isOwnerOrAdmin = isPlatformAdmin(user.role) || shop.owner_id === user.id || repository.isShopMember(shop.id, user.id, "OWNER");
    if (!isOwnerOrAdmin) {
      res.status(403).json({ error: "Forbidden: You do not own this shop" });
      return;
    }

    const { name, description, address, phone, pricingConfig } = req.body;
    const updates: Partial<DBShop> = {};

    if (name && typeof name === "string") updates.name = name.trim();
    if (description && typeof description === "string") updates.description = description.trim();
    if (address && typeof address === "string") updates.address = address.trim();
    if (phone && typeof phone === "string") updates.phone = phone.trim();
    if (pricingConfig && typeof pricingConfig === "object") {
      updates.pricing_config_json = JSON.stringify(pricingConfig);
    }

    const updated = repository.updateShop(shop.id, updates);
    res.json(formatClientShop(updated!));
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/shops/:id/subscription - Shop Owner views subscription & usage entitlements
router.get("/:id/subscription", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const shopId = getParam(req.params.id);
    const shop = repository.getShopById(shopId);

    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    const isMemberOrAdmin =
      isPlatformAdmin(user.role) ||
      shop.owner_id === user.id ||
      repository.isShopMember(shop.id, user.id);

    if (!isMemberOrAdmin) {
      res.status(403).json({ error: "Forbidden: You are not authorized to view subscription for this shop" });
      return;
    }

    const entitlements = repository.getShopEntitlements(shop.id);
    const history = repository.getSubscriptionHistory(shop.id);
    const availablePlans = repository.getAllSubscriptionPlans();

    res.json({
      subscription: entitlements.sub,
      plan: entitlements.plan,
      entitlements,
      usage: {
        staffCount: entitlements.currentStaffCount,
        maxStaff: entitlements.maxStaff,
        canAddStaff: entitlements.canAddStaff,
        productCount: entitlements.currentProductCount,
        maxProducts: entitlements.maxProducts,
        canAddProduct: entitlements.canAddProduct,
      },
      status: entitlements.status,
      canAcceptOrders: entitlements.canAcceptOrders,
      isSuspended: entitlements.isSuspended,
      isExpired: entitlements.isExpired,
      isPastDue: entitlements.isPastDue,
      availablePlans,
      plans: availablePlans,
      history,
    });
  } catch (error) {
    console.error("Fetch shop subscription error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/shops/:id/subscription/request-change - Shop Owner requests plan upgrade / change
router.post("/:id/subscription/request-change", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const shopId = getParam(req.params.id);
    const shop = repository.getShopById(shopId);

    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    const isOwnerOrAdmin =
      isPlatformAdmin(user.role) ||
      shop.owner_id === user.id ||
      repository.isShopMember(shop.id, user.id, "OWNER");

    if (!isOwnerOrAdmin) {
      res.status(403).json({ error: "Forbidden: Only the shop owner can request subscription changes" });
      return;
    }

    const { requestedPlanId } = req.body;
    if (!requestedPlanId || typeof requestedPlanId !== "string") {
      res.status(400).json({ error: "Valid target plan ID is required" });
      return;
    }

    const targetPlan = repository.getSubscriptionPlanById(requestedPlanId);
    if (!targetPlan) {
      res.status(404).json({ error: "Requested subscription plan was not found" });
      return;
    }

    const updatedSub = repository.requestPlanChange(shop.id, targetPlan.id);

    // Send notification to shop owner
    repository.createNotification({
      userId: user.id,
      shopId: shop.id,
      type: "PLAN_REQUEST_SUBMITTED",
      title: "Plan Upgrade Request Submitted",
      message: `Your request to switch to the '${targetPlan.name}' plan (₹${targetPlan.monthly_price}/mo) has been recorded and submitted for administrator approval.`,
    });

    res.json({
      success: true,
      message: `Upgrade request to '${targetPlan.name}' submitted successfully. A platform administrator will review and activate your plan.`,
      subscription: updatedSub,
    });
  } catch (error: any) {
    console.error("Request plan change error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

export default router;
