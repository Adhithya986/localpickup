import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { repository } from "../database";
import { authenticateToken, isPlatformAdmin } from "../middleware/auth";
import { config } from "../config";

const router = Router();

// GET /api/documents/:orderId
router.get("/:orderId", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.orderId;
    const orderId = Array.isArray(rawId) ? rawId[0] : rawId;
    const order = repository.getOrderById(orderId);

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const user = req.user!;
    let isAuthorized = false;

    // 1. Platform Admin has universal access
    if (isPlatformAdmin(user.role)) {
      isAuthorized = true;
    }

    // 2. Order Customer has access
    if (order.customer_id && order.customer_id === user.id) {
      isAuthorized = true;
    }
    if (order.customer_email && order.customer_email.toLowerCase() === user.email.toLowerCase()) {
      isAuthorized = true;
    }

    // 3. Shop Owner or Staff of the assigned shop has access
    if (repository.isShopMember(order.shop_id, user.id)) {
      isAuthorized = true;
    }

    // Legacy fallback: if placed without customer_id
    if (!order.customer_id && !order.customer_email) {
      const shop = repository.getShopById(order.shop_id);
      if (shop && (shop.owner_id === user.id || isPlatformAdmin(user.role))) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      res.status(403).json({ error: "Access denied: You are not authorized to view this document." });
      return;
    }

    // Resolve file path on disk
    const pj = order.print_job;
    let fullFilePath: string;

    if (pj?.storage_key) {
      fullFilePath = path.join(config.uploadDir, pj.storage_key);
    } else if (pj?.file_path) {
      const filename = path.basename(pj.file_path);
      fullFilePath = path.join(config.uploadDir, filename);
    } else {
      res.status(404).json({ error: "Document file record not found" });
      return;
    }

    if (!fs.existsSync(fullFilePath)) {
      res.status(404).json({ error: "File not found on storage server" });
      return;
    }

    const originalName = pj?.original_file_name || "document.pdf";
    const mimeType = pj?.file_mime || "application/pdf";

    // Secure streaming headers
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(originalName)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-transform, max-age=3600");
    res.setHeader("Content-Type", mimeType);

    const fileStream = fs.createReadStream(fullFilePath);
    fileStream.on("error", (err) => {
      console.error("File stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream file" });
      }
    });

    fileStream.pipe(res);
  } catch (error) {
    console.error("Document access error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
