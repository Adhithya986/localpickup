import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./sqlite";

export interface DBUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  global_role: string;
  created_at: string;
  updated_at: string;
}

export interface DBShop {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  distance: string | null;
  price_starting: string | null;
  rating: number;
  owner_id: string;
  subscription_status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
  address: string | null;
  phone: string | null;
  pricing_config_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBShopMember {
  id: string;
  shop_id: string;
  user_id: string;
  role: "OWNER" | "STAFF";
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
}

export interface DBProduct {
  id: string;
  shop_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  is_available: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBOrder {
  id: string;
  shop_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  pickup_time: string;
  pickup_token: string;
  pickup_token_hash: string;
  total_amount: number;
  status: "Pending" | "Accepted" | "Preparing" | "Ready" | "Completed" | "Rejected" | "Cancelled";
  verified_by_user_id: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  // Hydrated properties
  shop_name?: string;
  print_job?: DBPrintJob;
  items?: DBOrderItem[];
  history?: DBOrderStatusHistory[];
}

export interface DBOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  item_type: "PRODUCT" | "PRINT_JOB";
  title: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface DBPrintJob {
  id: string;
  order_id: string;
  order_item_id: string | null;
  original_file_name: string;
  storage_key: string;
  file_path: string;
  file_mime: string | null;
  file_size_bytes: number | null;
  paper_size: "A4" | "A3";
  color_mode: "bw" | "colour";
  sides: "single" | "double";
  copies: number;
  binding: number;
  lamination: number;
  calculated_price: number;
}

export interface DBOrderStatusHistory {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  changed_by_user_id: string | null;
  changed_by_name: string | null;
  note: string | null;
  created_at: string;
}

export class Repository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  // ----------------------------------------------------
  // User Operations
  // ----------------------------------------------------
  getUserById(id: string): DBUser | undefined {
    return this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as DBUser | undefined;
  }

  getUserByEmail(email: string): DBUser | undefined {
    return this.db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email.toLowerCase().trim()) as unknown as DBUser | undefined;
  }

  createUser(user: { id: string; email: string; password_hash: string; name: string; global_role: string }): DBUser {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO users (id, email, password_hash, name, global_role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(user.id, user.email.toLowerCase().trim(), user.password_hash, user.name, user.global_role, now, now);

    return this.getUserById(user.id)!;
  }

  // ----------------------------------------------------
  // Shop Operations
  // ----------------------------------------------------
  getAllShops(): DBShop[] {
    return this.db.prepare("SELECT * FROM shops ORDER BY rating DESC").all() as unknown as DBShop[];
  }

  getShopById(id: string): DBShop | undefined {
    return this.db.prepare("SELECT * FROM shops WHERE id = ?").get(id) as unknown as DBShop | undefined;
  }

  getShopByOwnerId(ownerId: string): DBShop | undefined {
    return this.db.prepare("SELECT * FROM shops WHERE owner_id = ?").get(ownerId) as unknown as DBShop | undefined;
  }

  createShop(shop: {
    id: string;
    name: string;
    slug?: string;
    description?: string;
    distance?: string;
    price_starting?: string;
    owner_id: string;
    pricing_config_json?: string;
  }): DBShop {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO shops (id, name, slug, description, distance, price_starting, rating, owner_id, subscription_status, pricing_config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 5.0, ?, 'TRIAL', ?, ?, ?)
    `).run(
      shop.id,
      shop.name,
      shop.slug || `shop-${shop.id}`,
      shop.description || "",
      shop.distance || "1.0 km",
      shop.price_starting || "From ₹2",
      shop.owner_id,
      shop.pricing_config_json || null,
      now,
      now
    );

    // Create OWNER membership
    this.db.prepare(`
      INSERT OR IGNORE INTO shop_members (id, shop_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, ?, 'OWNER', ?, ?)
    `).run(`mem-${shop.id}-${shop.owner_id}`, shop.id, shop.owner_id, now, now);

    return this.getShopById(shop.id)!;
  }

  updateShop(id: string, updates: Partial<DBShop>): DBShop | undefined {
    const existing = this.getShopById(id);
    if (!existing) return undefined;

    const name = updates.name !== undefined ? updates.name : existing.name;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const address = updates.address !== undefined ? updates.address : existing.address;
    const phone = updates.phone !== undefined ? updates.phone : existing.phone;
    const pricing_config_json = updates.pricing_config_json !== undefined ? updates.pricing_config_json : existing.pricing_config_json;
    const subscription_status = updates.subscription_status !== undefined ? updates.subscription_status : existing.subscription_status;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE shops
      SET name = ?, description = ?, address = ?, phone = ?, pricing_config_json = ?, subscription_status = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description, address, phone, pricing_config_json, subscription_status, now, id);

    return this.getShopById(id);
  }

  // ----------------------------------------------------
  // Shop Membership Operations (Staff & Owners)
  // ----------------------------------------------------
  getShopMembers(shopId: string): DBShopMember[] {
    return this.db.prepare(`
      SELECT m.*, u.name as user_name, u.email as user_email
      FROM shop_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.shop_id = ?
      ORDER BY m.role DESC, m.created_at ASC
    `).all(shopId) as unknown as DBShopMember[];
  }

  getUserMemberships(userId: string): Array<{ shop_id: string; shop_name: string; role: string }> {
    return this.db.prepare(`
      SELECT m.shop_id, s.name as shop_name, m.role
      FROM shop_members m
      JOIN shops s ON m.shop_id = s.id
      WHERE m.user_id = ?
    `).all(userId) as unknown as Array<{ shop_id: string; shop_name: string; role: string }>;
  }

  isShopMember(shopId: string, userId: string, requiredRole?: "OWNER" | "STAFF"): boolean {
    const member = this.db.prepare(`
      SELECT role FROM shop_members
      WHERE shop_id = ? AND user_id = ?
    `).get(shopId, userId) as unknown as { role: string } | undefined;

    if (member) {
      if (requiredRole === "OWNER") return member.role === "OWNER";
      return true; // If STAFF required, OWNER also satisfies it
    }

    const shop = this.getShopById(shopId);
    if (shop && shop.owner_id === userId) {
      return true;
    }

    return false;
  }

  addShopMember(shopId: string, userId: string, role: "OWNER" | "STAFF" = "STAFF"): DBShopMember {
    const now = new Date().toISOString();
    const id = `mem-${shopId}-${userId}-${Date.now()}`;
    this.db.prepare(`
      INSERT INTO shop_members (id, shop_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
    `).run(id, shopId, userId, role, now, now);

    return this.db.prepare(`
      SELECT m.*, u.name as user_name, u.email as user_email
      FROM shop_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.shop_id = ? AND m.user_id = ?
    `).get(shopId, userId) as unknown as DBShopMember;
  }

  removeShopMember(shopId: string, userId: string): boolean {
    const shop = this.getShopById(shopId);
    if (shop && shop.owner_id === userId) {
      throw new Error("Cannot remove primary shop owner from staff list");
    }

    const res = this.db.prepare("DELETE FROM shop_members WHERE shop_id = ? AND user_id = ?").run(shopId, userId);
    return res.changes > 0;
  }

  // ----------------------------------------------------
  // Product & Category Operations
  // ----------------------------------------------------
  getProductsByShop(shopId: string, categoryId?: string): DBProduct[] {
    if (categoryId) {
      return this.db.prepare(`
        SELECT * FROM products
        WHERE shop_id = ? AND category_id = ?
        ORDER BY name ASC
      `).all(shopId, categoryId) as unknown as DBProduct[];
    }
    return this.db.prepare(`
      SELECT * FROM products
      WHERE shop_id = ?
      ORDER BY name ASC
    `).all(shopId) as unknown as DBProduct[];
  }

  getProductById(id: string): DBProduct | undefined {
    return this.db.prepare("SELECT * FROM products WHERE id = ?").get(id) as unknown as DBProduct | undefined;
  }

  createProduct(data: {
    id: string;
    shop_id: string;
    category_id?: string | null;
    name: string;
    description?: string | null;
    price: number;
    stock_quantity: number;
    is_available?: number;
    image_url?: string | null;
  }): DBProduct {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO products (id, shop_id, category_id, name, description, price, stock_quantity, is_available, image_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.shop_id,
      data.category_id || null,
      data.name,
      data.description || null,
      data.price,
      data.stock_quantity,
      data.is_available !== undefined ? data.is_available : 1,
      data.image_url || null,
      now,
      now
    );

    return this.getProductById(data.id)!;
  }

  updateProduct(id: string, updates: Partial<DBProduct>): DBProduct | undefined {
    const existing = this.getProductById(id);
    if (!existing) return undefined;

    const name = updates.name !== undefined ? updates.name : existing.name;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const price = updates.price !== undefined ? updates.price : existing.price;
    const stock_quantity = updates.stock_quantity !== undefined ? updates.stock_quantity : existing.stock_quantity;
    const is_available = updates.is_available !== undefined ? updates.is_available : existing.is_available;
    const category_id = updates.category_id !== undefined ? updates.category_id : existing.category_id;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE products
      SET name = ?, description = ?, price = ?, stock_quantity = ?, is_available = ?, category_id = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description, price, stock_quantity, is_available, category_id, now, id);

    return this.getProductById(id);
  }

  deleteProduct(id: string): boolean {
    const res = this.db.prepare("DELETE FROM products WHERE id = ?").run(id);
    return res.changes > 0;
  }

  // ----------------------------------------------------
  // Order Operations
  // ----------------------------------------------------
  getOrderById(id: string): DBOrder | undefined {
    const order = this.db.prepare(`
      SELECT o.*, s.name as shop_name
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      WHERE o.id = ?
    `).get(id) as unknown as DBOrder | undefined;

    if (!order) return undefined;

    // Attach print job details
    order.print_job = this.db.prepare("SELECT * FROM print_jobs WHERE order_id = ?").get(id) as unknown as DBPrintJob | undefined;

    // Attach items
    order.items = this.db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(id) as unknown as DBOrderItem[];

    // Attach history
    order.history = this.db.prepare("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC").all(id) as unknown as DBOrderStatusHistory[];

    return order;
  }

  getOrdersForCustomer(customerId: string, customerEmail?: string): DBOrder[] {
    const rows = this.db.prepare(`
      SELECT o.*, s.name as shop_name
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      WHERE o.customer_id = ? OR (o.customer_email IS NOT NULL AND o.customer_email = ? COLLATE NOCASE)
      ORDER BY o.created_at DESC
    `).all(customerId, customerEmail || "") as unknown as DBOrder[];

    return rows.map((order) => this.hydrateOrder(order));
  }

  getOrdersForShop(shopId: string): DBOrder[] {
    const rows = this.db.prepare(`
      SELECT o.*, s.name as shop_name
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      WHERE o.shop_id = ?
      ORDER BY o.created_at DESC
    `).all(shopId) as unknown as DBOrder[];

    return rows.map((order) => this.hydrateOrder(order));
  }

  getAllOrders(shopIdFilter?: string): DBOrder[] {
    if (shopIdFilter) {
      return this.getOrdersForShop(shopIdFilter);
    }
    const rows = this.db.prepare(`
      SELECT o.*, s.name as shop_name
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      ORDER BY o.created_at DESC
    `).all() as unknown as DBOrder[];

    return rows.map((order) => this.hydrateOrder(order));
  }

  private hydrateOrder(order: DBOrder): DBOrder {
    order.print_job = this.db.prepare("SELECT * FROM print_jobs WHERE order_id = ?").get(order.id) as unknown as DBPrintJob | undefined;
    return order;
  }

  createPrintOrder(params: {
    orderId: string;
    shopId: string;
    customerId?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    pickupTime: string;
    pickupToken: string;
    pickupTokenHash: string;
    totalAmount: number;
    // Print job details
    fileName: string;
    storageKey: string;
    filePath: string;
    fileMime?: string | null;
    fileSizeBytes?: number | null;
    paper: "A4" | "A3";
    colour: "bw" | "colour";
    sides: "single" | "double";
    copies: number;
    binding: boolean;
    lamination: boolean;
  }): DBOrder {
    const now = new Date().toISOString();

    this.db.exec("BEGIN TRANSACTION;");
    try {
      // 1. Insert order
      this.db.prepare(`
        INSERT INTO orders (id, shop_id, customer_id, customer_name, customer_email, pickup_time, pickup_token, pickup_token_hash, total_amount, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
      `).run(
        params.orderId,
        params.shopId,
        params.customerId || null,
        params.customerName || null,
        params.customerEmail || null,
        params.pickupTime,
        params.pickupToken,
        params.pickupTokenHash,
        params.totalAmount,
        now,
        now
      );

      // 2. Insert order item
      const orderItemId = `item-${params.orderId}-1`;
      this.db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, item_type, title, quantity, unit_price, subtotal)
        VALUES (?, ?, NULL, 'PRINT_JOB', ?, ?, ?, ?)
      `).run(
        orderItemId,
        params.orderId,
        `Document Print (${params.paper}, ${params.colour === "colour" ? "Color" : "B&W"})`,
        params.copies,
        params.totalAmount,
        params.totalAmount
      );

      // 3. Insert print job
      this.db.prepare(`
        INSERT INTO print_jobs (id, order_id, order_item_id, original_file_name, storage_key, file_path, file_mime, file_size_bytes, paper_size, color_mode, sides, copies, binding, lamination, calculated_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `job-${params.orderId}-1`,
        params.orderId,
        orderItemId,
        params.fileName,
        params.storageKey,
        params.filePath,
        params.fileMime || "application/pdf",
        params.fileSizeBytes || 0,
        params.paper,
        params.colour,
        params.sides,
        params.copies,
        params.binding ? 1 : 0,
        params.lamination ? 1 : 0,
        params.totalAmount
      );

      // 4. Insert status history
      this.db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_name, note, created_at)
        VALUES (?, ?, NULL, 'Pending', ?, 'Order placed by customer', ?)
      `).run(
        `hist-${params.orderId}-0`,
        params.orderId,
        params.customerName || "Customer",
        now
      );

      this.db.exec("COMMIT;");
      return this.getOrderById(params.orderId)!;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  updateOrderStatus(
    orderId: string,
    newStatus: "Pending" | "Accepted" | "Preparing" | "Ready" | "Completed" | "Rejected" | "Cancelled",
    user: { id?: string; name: string; role: string },
    note?: string
  ): DBOrder {
    const existing = this.getOrderById(orderId);
    if (!existing) throw new Error("Order not found");

    const now = new Date().toISOString();

    this.db.exec("BEGIN TRANSACTION;");
    try {
      this.db.prepare(`
        UPDATE orders
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(newStatus, now, orderId);

      this.db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, changed_by_name, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${orderId}-${Date.now()}`,
        orderId,
        existing.status,
        newStatus,
        user.id || null,
        `${user.name} (${user.role})`,
        note || `Status updated to ${newStatus}`,
        now
      );

      this.db.exec("COMMIT;");
      return this.getOrderById(orderId)!;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  verifyOrderPickup(
    orderId: string,
    user: { id: string; name: string },
    method: "MANUAL_CODE" | "QR_SCAN" = "MANUAL_CODE"
  ): DBOrder {
    const existing = this.getOrderById(orderId);
    if (!existing) throw new Error("Order not found");

    const now = new Date().toISOString();

    this.db.exec("BEGIN TRANSACTION;");
    try {
      this.db.prepare(`
        UPDATE orders
        SET status = 'Completed', verified_by_user_id = ?, verified_at = ?, updated_at = ?
        WHERE id = ?
      `).run(user.id, now, now, orderId);

      this.db.prepare(`
        INSERT INTO pickup_verifications (id, order_id, verified_by_user_id, verified_by_name, verified_at, method)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `ver-${orderId}`,
        orderId,
        user.id,
        user.name,
        now,
        method
      );

      this.db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, changed_by_name, note, created_at)
        VALUES (?, ?, 'Ready', 'Completed', ?, ?, 'Pickup verified at shop counter. Handover complete.', ?)
      `).run(
        `hist-${orderId}-${Date.now()}`,
        orderId,
        user.id,
        `${user.name} (STAFF)`,
        now
      );

      this.db.exec("COMMIT;");
      return this.getOrderById(orderId)!;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }
}
