import { Router, Request, Response } from "express";
import crypto from "crypto";
import { repository } from "../database";
import { authenticateToken, isPlatformAdmin } from "../middleware/auth";

const router = Router({ mergeParams: true });
const getParam = (p: string | string[] | undefined): string => Array.isArray(p) ? p[0] : (p || "");

function isAuthorizedShopStaff(req: Request, shopId: string, requiredRole: "OWNER" | "STAFF" = "STAFF"): boolean {
  const user = req.user!;
  if (isPlatformAdmin(user.role)) return true;

  const shop = repository.getShopById(shopId);
  if (!shop) return false;

  if (shop.owner_id === user.id) return true;
  return repository.isShopMember(shopId, user.id, requiredRole);
}

// GET /api/shops/:shopId/categories - Public categories list for a shop
router.get("/:shopId/categories", async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);
    const shop = repository.getShopById(shopId);
    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    const categories = repository.getCategoriesByShop(shopId);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/shops/:shopId/categories - Create a category (Staff / Owner only)
router.post("/:shopId/categories", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);

    if (!isAuthorizedShopStaff(req, shopId)) {
      res.status(403).json({ error: "Forbidden: You are not authorized to add categories to this shop" });
      return;
    }

    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({ error: "Category name is required" });
      return;
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const categoryId = `cat-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

    const category = repository.createCategory({
      id: categoryId,
      shop_id: shopId,
      name: name.trim(),
      slug,
      sort_order: 0,
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/shops/:shopId/products - Public list
router.get("/:shopId/products", async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);
    const categoryId = req.query.category as string | undefined;
    const availableOnly = req.query.availableOnly === "true";

    const shop = repository.getShopById(shopId);
    if (!shop) {
      res.status(404).json({ error: "Shop not found" });
      return;
    }

    const products = repository.getProductsByShop(shopId, categoryId, availableOnly);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/shops/:shopId/products/:id - Public product details
router.get("/:shopId/products/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);
    const id = getParam(req.params.id);
    const product = repository.getProductById(id);

    if (!product || product.shop_id !== shopId) {
      res.status(404).json({ error: "Product not found in this shop" });
      return;
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/shops/:shopId/products - Create a product (Staff / Owner only)
router.post("/:shopId/products", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);

    if (!isAuthorizedShopStaff(req, shopId)) {
      res.status(403).json({ error: "Forbidden: You are not authorized to add products to this shop" });
      return;
    }

    const { name, description, price, stockQuantity, categoryId, imageUrl } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({ error: "Product name is required" });
      return;
    }

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      res.status(400).json({ error: "Price must be a non-negative number" });
      return;
    }

    const numStock = parseInt(stockQuantity, 10);
    if (isNaN(numStock) || numStock < 0) {
      res.status(400).json({ error: "Stock quantity must be a non-negative integer" });
      return;
    }

    // Enforce subscription plan product catalog limit
    const entitlements = repository.getShopEntitlements(shopId);
    if (!entitlements.canAddProduct) {
      res.status(400).json({
        error: `Product catalog limit of ${entitlements.maxProducts} reached for your ${entitlements.plan.name} plan. Please upgrade your subscription to list more products.`,
      });
      return;
    }

    const productId = `prod-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

    const product = repository.createProduct({
      id: productId,
      shop_id: shopId,
      category_id: categoryId || null,
      name: name.trim(),
      description: description ? String(description).trim() : null,
      price: numPrice,
      stock_quantity: numStock,
      is_available: numStock > 0 ? 1 : 0,
      image_url: imageUrl || null,
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/shops/:shopId/products/:id - Update product / inventory
router.put("/:shopId/products/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);
    const id = getParam(req.params.id);

    if (!isAuthorizedShopStaff(req, shopId)) {
      res.status(403).json({ error: "Forbidden: You are not authorized to update products in this shop" });
      return;
    }

    const existing = repository.getProductById(id);
    if (!existing || existing.shop_id !== shopId) {
      res.status(404).json({ error: "Product not found in this shop" });
      return;
    }

    const { name, description, price, stockQuantity, isAvailable, categoryId } = req.body;
    const updates: any = {};

    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (price !== undefined) {
      const p = parseFloat(price);
      if (isNaN(p) || p < 0) {
        res.status(400).json({ error: "Price must be a non-negative number" });
        return;
      }
      updates.price = p;
    }
    if (stockQuantity !== undefined) {
      const s = parseInt(stockQuantity, 10);
      if (isNaN(s) || s < 0) {
        res.status(400).json({ error: "Stock quantity must be a non-negative integer" });
        return;
      }
      updates.stock_quantity = s;
      if (isAvailable === undefined) {
        updates.is_available = s > 0 ? 1 : 0;
      }
    }
    if (isAvailable !== undefined) {
      updates.is_available = isAvailable ? 1 : 0;
    }
    if (categoryId !== undefined) {
      updates.category_id = categoryId || null;
    }

    const updated = repository.updateProduct(id, updates);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /api/shops/:shopId/products/:id - Delete product (Owner only)
router.delete("/:shopId/products/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const shopId = getParam(req.params.shopId);
    const id = getParam(req.params.id);

    if (!isAuthorizedShopStaff(req, shopId, "OWNER")) {
      res.status(403).json({ error: "Forbidden: Only shop owners can delete products" });
      return;
    }

    const existing = repository.getProductById(id);
    if (!existing || existing.shop_id !== shopId) {
      res.status(404).json({ error: "Product not found in this shop" });
      return;
    }

    repository.deleteProduct(id);
    res.json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
