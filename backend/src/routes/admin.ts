import { Router, Request, Response } from "express";
import { repository } from "../database";
import { getDatabase } from "../db/sqlite";
import { authenticateToken, requireRoles } from "../middleware/auth";
import { DBShop } from "../db/repository";

const router = Router();

// Protect all admin routes with authentication and Platform Admin role check
router.use(authenticateToken);
router.use(requireRoles("ADMIN", "PLATFORM_ADMIN"));

function formatClientShop(s: DBShop) {
  return {
    id: s.id,
    name: s.name,
    ownerId: s.owner_id,
    subscriptionStatus: s.subscription_status,
    description: s.description || "",
    distance: s.distance || "1.0 km",
    price: s.price_starting || "From ₹2",
    rating: s.rating.toString(),
  };
}

// GET /api/admin/shops
router.get("/shops", async (_req: Request, res: Response): Promise<void> => {
  try {
    const shops = repository.getAllShops();
    res.json(shops.map(formatClientShop));
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/admin/shops/:id/subscription
router.patch("/shops/:id/subscription", async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    const validStatuses = ["ACTIVE", "SUSPENDED", "TRIAL"];

    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const shop = repository.getShopById(id);
    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    const updated = repository.updateShop(shop.id, {
      subscription_status: status as any,
    });

    res.json(formatClientShop(updated!));
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/admin/metrics
router.get("/metrics", async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
    const totalShops = (db.prepare("SELECT COUNT(*) as c FROM shops").get() as any).c;
    const activeShops = (db.prepare("SELECT COUNT(*) as c FROM shops WHERE subscription_status = 'ACTIVE'").get() as any).c;
    const suspendedShops = (db.prepare("SELECT COUNT(*) as c FROM shops WHERE subscription_status = 'SUSPENDED'").get() as any).c;
    const trialShops = (db.prepare("SELECT COUNT(*) as c FROM shops WHERE subscription_status = 'TRIAL'").get() as any).c;
    const totalOrders = (db.prepare("SELECT COUNT(*) as c FROM orders").get() as any).c;
    const completedOrders = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'Completed'").get() as any).c;
    const pendingOrders = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'Pending'").get() as any).c;

    res.json({
      totalUsers,
      totalShops,
      activeShops,
      suspendedShops,
      trialShops,
      totalOrders,
      completedOrders,
      pendingOrders,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
