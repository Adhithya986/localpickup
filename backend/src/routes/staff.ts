import { Router, Request, Response } from "express";
import { repository } from "../database";
import { authenticateToken, isPlatformAdmin } from "../middleware/auth";

const router = Router({ mergeParams: true });
const getParam = (p: string | string[] | undefined): string => Array.isArray(p) ? p[0] : (p || "");

// Helper to check if requester can manage staff for this shop
function canManageShopStaff(req: Request, shopId: string): boolean {
  const user = req.user!;
  if (isPlatformAdmin(user.role)) return true;

  const shop = repository.getShopById(shopId);
  if (!shop) return false;

  // Primary owner or OWNER role member can manage staff
  if (shop.owner_id === user.id) return true;
  return repository.isShopMember(shopId, user.id, "OWNER");
}

// GET /api/shops/:shopId/staff - List staff members
router.get("/:shopId/staff", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);
    const shop = repository.getShopById(shopId);

    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    const user = req.user!;
    const isAuthorized =
      isPlatformAdmin(user.role) ||
      shop.owner_id === user.id ||
      repository.isShopMember(shopId, user.id);

    if (!isAuthorized) {
      res.status(403).json({ error: "Forbidden: You are not authorized to view staff for this shop" });
      return;
    }

    const members = repository.getShopMembers(shopId);
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/shops/:shopId/staff - Add a staff member
router.post("/:shopId/staff", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);
    const { email, role } = req.body;

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Valid user email is required" });
      return;
    }

    const shop = repository.getShopById(shopId);
    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    if (!canManageShopStaff(req, shopId)) {
      res.status(403).json({ error: "Forbidden: Only the shop owner can manage staff" });
      return;
    }

    // Security: Shop owners can NEVER grant administrative privileges
    const assignedRole = role === "OWNER" ? "OWNER" : "STAFF";

    const targetUser = repository.getUserByEmail(email);
    if (!targetUser) {
      res.status(404).json({ error: `User with email '${email}' was not found. They must register an account first.` });
      return;
    }

    // Enforce subscription plan staff limit for new staff members
    const isAlreadyMember = repository.isShopMember(shopId, targetUser.id);
    if (!isAlreadyMember) {
      const entitlements = repository.getShopEntitlements(shopId);
      if (!entitlements.canAddStaff) {
        res.status(400).json({
          error: `Staff account limit of ${entitlements.maxStaff} reached for your ${entitlements.plan.name} plan. Please upgrade your subscription to add more staff.`,
        });
        return;
      }
    }

    // Add membership
    const member = repository.addShopMember(shopId, targetUser.id, assignedRole);

    res.status(201).json({
      success: true,
      message: `User ${targetUser.name} (${targetUser.email}) added as ${assignedRole}`,
      member,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// DELETE /api/shops/:shopId/staff/:userId - Remove a staff member
router.delete("/:shopId/staff/:userId", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);
    const userId = getParam(req.params.userId);

    const shop = repository.getShopById(shopId);
    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    if (!canManageShopStaff(req, shopId)) {
      res.status(403).json({ error: "Forbidden: Only the shop owner can remove staff members" });
      return;
    }

    if (shop.owner_id === userId) {
      res.status(400).json({ error: "Cannot remove the primary shop owner from the shop" });
      return;
    }

    const removed = repository.removeShopMember(shopId, userId);
    if (!removed) {
      res.status(404).json({ error: "Staff member was not found in this shop" });
      return;
    }

    res.json({
      success: true,
      message: "Staff member access revoked immediately.",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

export default router;
