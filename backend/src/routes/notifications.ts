import { Router, Request, Response } from "express";
import { repository } from "../database";
import { authenticateToken } from "../middleware/auth";

const router = Router();

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : (param || "");

// All notification routes require authentication
router.use(authenticateToken);

// GET /api/notifications - List notifications for the authenticated user
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const rawLimit = req.query.limit;
    const limit = Math.min(Math.max(parseInt(typeof rawLimit === "string" ? rawLimit : "50", 10) || 50, 1), 100);

    const notifications = repository.getNotificationsByUser(user.id, limit);

    res.json({
      success: true,
      notifications: notifications.map((n) => ({
        id: n.id,
        userId: n.user_id,
        shopId: n.shop_id,
        orderId: n.order_id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.is_read === 1,
        createdAt: n.created_at,
      })),
    });
  } catch (error) {
    console.error("Fetch notifications error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/notifications/unread-count - Get count of unread notifications
router.get("/unread-count", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const count = repository.getUnreadNotificationCount(user.id);
    res.json({
      success: true,
      count,
    });
  } catch (error) {
    console.error("Fetch unread notification count error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/notifications/:id/read - Mark a single notification as read
router.patch("/:id/read", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const id = getParam(req.params.id);

    const updated = repository.markNotificationAsRead(id, user.id);
    if (!updated) {
      res.status(404).json({ error: "Notification not found or access denied" });
      return;
    }

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/notifications/mark-all-read - Mark all unread notifications as read
router.post("/mark-all-read", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const updatedCount = repository.markAllNotificationsAsRead(user.id);

    res.json({
      success: true,
      message: "All notifications marked as read",
      updatedCount,
    });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
