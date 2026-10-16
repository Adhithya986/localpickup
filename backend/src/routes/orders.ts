import { Router, Request, Response } from "express";
import crypto from "crypto";
import { repository, OrderStatus } from "../database";
import { documentUpload } from "../middleware/upload";
import { authenticateToken, optionalAuthenticateToken, isPlatformAdmin } from "../middleware/auth";
import { orderRateLimiter } from "../middleware/rateLimiter";
import { validatePrintOptions, calculatePrintPrice } from "../pricing";
import { DBOrder } from "../db/repository";

const router = Router();

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : (param || "");

// Permitted status transitions
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Pending: ["Accepted", "Preparing", "Ready", "Rejected", "Cancelled"],
  Accepted: ["Preparing", "Ready", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Completed", "Cancelled"],
  Completed: [],
  Rejected: [],
  Cancelled: [],
};

// Map DBOrder to client-facing Order format
function formatClientOrder(order: DBOrder) {
  const pj = order.print_job;
  return {
    id: order.id,
    shopId: order.shop_id,
    shopName: order.shop_name || "Print Shop",
    customerId: order.customer_id || undefined,
    customerEmail: order.customer_email || undefined,
    fileName: pj?.original_file_name || "document.pdf",
    storageKey: pj?.storage_key || "",
    filePath: pj?.file_path || `/api/documents/${order.id}`,
    fileMime: pj?.file_mime || "application/pdf",
    fileSizeBytes: pj?.file_size_bytes || 0,
    paper: pj?.paper_size || "A4",
    colour: pj?.color_mode || "bw",
    sides: pj?.sides || "single",
    copies: pj?.copies || 1,
    binding: (pj?.binding || 0) === 1,
    lamination: (pj?.lamination || 0) === 1,
    total: order.total_amount,
    pickupTime: order.pickup_time,
    pickupToken: order.pickup_token,
    pickupTokenHash: order.pickup_token_hash,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    verifiedBy: order.verified_by_user_id || undefined,
    verifiedAt: order.verified_at || undefined,
    statusHistory: order.history?.map((h) => ({
      status: h.to_status,
      changedAt: h.created_at,
      changedBy: h.changed_by_name,
      note: h.note,
    })) || [],
  };
}

// POST /api/orders - Create an order
router.post(
  "/",
  orderRateLimiter,
  optionalAuthenticateToken,
  documentUpload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Document file is required for printing" });
        return;
      }

      const { shopId, pickupTime } = req.body;

      if (!shopId || typeof shopId !== "string") {
        res.status(400).json({ error: "Valid shop ID is required" });
        return;
      }

      if (!pickupTime || typeof pickupTime !== "string" || pickupTime.trim() === "") {
        res.status(400).json({ error: "Pickup time is required" });
        return;
      }

      const shop = repository.getShopById(shopId);
      if (!shop) {
        res.status(404).json({ error: "Selected shop does not exist" });
        return;
      }

      if (shop.subscription_status === "SUSPENDED") {
        res.status(403).json({ error: "This shop is temporarily unable to accept new orders." });
        return;
      }

      // Validate print configuration options
      const validation = validatePrintOptions(req.body);
      if (!validation.isValid || !validation.validatedOptions) {
        res.status(400).json({ error: validation.error || "Invalid print options" });
        return;
      }

      // Parse pricing config if present
      const shopPricing = shop.pricing_config_json ? JSON.parse(shop.pricing_config_json) : undefined;
      const pricing = calculatePrintPrice(validation.validatedOptions, {
        id: shop.id,
        name: shop.name,
        description: shop.description || "",
        distance: shop.distance || "",
        price: shop.price_starting || "",
        rating: shop.rating.toString(),
        pricingConfig: shopPricing,
      });

      // Generate cryptographically secure, unpredictable order ID and pickup token
      const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
      const orderId = `LP-${randomHex}`;
      const pickupToken = crypto.randomBytes(6).toString("hex").toUpperCase();
      const pickupTokenHash = crypto.createHash("sha256").update(pickupToken).digest("hex");

      const createdOrder = repository.createPrintOrder({
        orderId,
        shopId: shop.id,
        customerId: req.user?.id || null,
        customerName: req.user?.name || "Guest Customer",
        customerEmail: req.user?.email || null,
        pickupTime: pickupTime.trim(),
        pickupToken,
        pickupTokenHash,
        totalAmount: pricing.total,
        fileName: req.file.originalname,
        storageKey: req.file.filename,
        filePath: `/api/documents/${orderId}`,
        fileMime: req.file.mimetype,
        fileSizeBytes: req.file.size,
        paper: validation.validatedOptions.paper,
        colour: validation.validatedOptions.colour,
        sides: validation.validatedOptions.sides,
        copies: validation.validatedOptions.copies,
        binding: validation.validatedOptions.binding,
        lamination: validation.validatedOptions.lamination,
      });

      res.status(201).json(formatClientOrder(createdOrder));
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

// GET /api/orders - Get orders scoped by tenant role
router.get("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    let orders: DBOrder[] = [];

    if (isPlatformAdmin(user.role)) {
      const shopIdQuery = req.query.shopId as string | undefined;
      orders = repository.getAllOrders(shopIdQuery);
    } else {
      const memberships = repository.getUserMemberships(user.id);
      if (memberships.length > 0) {
        // Shop Staff / Owner: return orders for all authorized shops
        for (const m of memberships) {
          const shopOrders = repository.getOrdersForShop(m.shop_id);
          orders.push(...shopOrders);
        }
      } else {
        // Customer: only return customer's own orders
        orders = repository.getOrdersForCustomer(user.id, user.email);
      }
    }

    res.json(orders.map((o) => formatClientOrder(o)));
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/orders/:id - Get specific order by ID with tenant checks
router.get("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const order = repository.getOrderById(getParam(req.params.id));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Platform Admin has universal access
    if (isPlatformAdmin(user.role)) {
      res.json(formatClientOrder(order));
      return;
    }

    // Shop Member of this shop has access
    if (repository.isShopMember(order.shop_id, user.id)) {
      res.json(formatClientOrder(order));
      return;
    }

    // Customer who placed order has access
    if (
      (order.customer_id && order.customer_id === user.id) ||
      (order.customer_email && order.customer_email.toLowerCase() === user.email.toLowerCase())
    ) {
      res.json(formatClientOrder(order));
      return;
    }

    res.status(403).json({ error: "Forbidden: You cannot access this order" });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/orders/:id/status - Update order status (Shop Staff / Owner / Admin only)
router.patch("/:id/status", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { status, note } = req.body as { status: OrderStatus; note?: string };

    if (!status || !VALID_TRANSITIONS[status]) {
      res.status(400).json({ error: `Invalid status '${status}'. Must be one of: ${Object.keys(VALID_TRANSITIONS).join(", ")}` });
      return;
    }

    const order = repository.getOrderById(getParam(req.params.id));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Tenant check: only authorized shop staff/owner or platform admin can update status
    if (!isPlatformAdmin(user.role) && !repository.isShopMember(order.shop_id, user.id)) {
      res.status(403).json({ error: "Forbidden: Only authorized shop staff can update order status" });
      return;
    }

    // Validate permitted status transition
    const allowedNextStatuses = VALID_TRANSITIONS[order.status] || [];
    if (!allowedNextStatuses.includes(status) && order.status !== status) {
      res.status(400).json({
        error: `Invalid status transition from '${order.status}' to '${status}'. Allowed: ${allowedNextStatuses.join(", ") || "None (Terminal status)"}`,
      });
      return;
    }

    const updated = repository.updateOrderStatus(order.id, status, {
      id: user.id,
      name: user.name,
      role: user.role,
    }, note);

    res.json(formatClientOrder(updated));
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/orders/:id/verify-pickup - Atomic pickup verification (Shop Staff / Owner only)
router.post("/:id/verify-pickup", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { token } = req.body;

    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "Pickup token or code is required" });
      return;
    }

    const order = repository.getOrderById(getParam(req.params.id));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Authorization: only authorized shop staff/owner or platform admin can verify pickup
    if (!isPlatformAdmin(user.role) && !repository.isShopMember(order.shop_id, user.id)) {
      res.status(403).json({ error: "Forbidden: Only authorized shop staff can verify pickups" });
      return;
    }

    if (order.status === "Completed") {
      res.status(400).json({
        error: `Order ${order.id} has already been verified and collected by customer on ${order.verified_at || "earlier"}.`,
      });
      return;
    }

    if (order.status !== "Ready") {
      res.status(400).json({
        error: `Order cannot be picked up yet. Current status is '${order.status}'. It must be 'Ready' before pickup.`,
      });
      return;
    }

    // Verify token (check against pickupToken or order ID)
    const normalizedInputToken = token.trim().toUpperCase();
    const isValidToken =
      (order.pickup_token && order.pickup_token.toUpperCase() === normalizedInputToken) ||
      order.id.toUpperCase() === normalizedInputToken;

    if (!isValidToken) {
      res.status(400).json({ error: "Invalid pickup verification code. Please check the customer's QR code or token." });
      return;
    }

    const updated = repository.verifyOrderPickup(order.id, {
      id: user.id,
      name: user.name,
    }, "MANUAL_CODE");

    res.json({
      success: true,
      message: `Pickup verified successfully. Order ${order.id} is now Completed.`,
      order: formatClientOrder(updated),
    });
  } catch (error) {
    console.error("Pickup verification error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/orders/:id/cancel - Customer or shop cancellation
router.post("/:id/cancel", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { reason } = req.body;
    const order = repository.getOrderById(getParam(req.params.id));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Customer cancellation checks
    if (!isPlatformAdmin(user.role) && !repository.isShopMember(order.shop_id, user.id)) {
      if (order.customer_id !== user.id && order.customer_email?.toLowerCase() !== user.email.toLowerCase()) {
        res.status(403).json({ error: "Forbidden: You cannot cancel another user's order" });
        return;
      }

      if (order.status !== "Pending" && order.status !== "Accepted") {
        res.status(400).json({
          error: `Cannot cancel order in '${order.status}' status. Document preparation has already commenced.`,
        });
        return;
      }
    }

    const updated = repository.updateOrderStatus(order.id, "Cancelled", {
      id: user.id,
      name: user.name,
      role: user.role,
    }, reason || "Order cancelled");

    res.json({ success: true, message: "Order cancelled successfully", order: formatClientOrder(updated) });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
