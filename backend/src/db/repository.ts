import { DatabaseSync } from "node:sqlite";
import crypto from "crypto";
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

export interface DBCategory {
  id: string;
  shop_id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
}

export interface UnifiedOrderParams {
  orderId: string;
  shopId: string;
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  pickupTime: string;
  pickupToken: string;
  pickupTokenHash: string;
  totalAmount: number;
  items: Array<{
    productId: string;
    title: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  printJob?: {
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
    calculatedPrice: number;
  };
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

export interface DBNotification {
  id: string;
  user_id: string;
  shop_id: string | null;
  order_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

export interface DBSubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthly_price: number;
  maximum_staff: number;
  maximum_products: number;
  analytics_level: "BASIC" | "STANDARD" | "ADVANCED";
  feature_config_json: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface DBShopSubscription {
  id: string;
  shop_id: string;
  plan_id: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "SUSPENDED" | "CANCELLED";
  started_at: string;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancelled_at: string | null;
  requested_plan_id: string | null;
  requested_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  plan?: DBSubscriptionPlan;
  requested_plan?: DBSubscriptionPlan;
}

export interface DBSubscriptionHistory {
  id: string;
  shop_id: string;
  from_plan_id: string | null;
  to_plan_id: string;
  from_status: string | null;
  to_status: string;
  changed_by_user_id: string | null;
  reason: string | null;
  created_at: string;
  from_plan_name?: string;
  to_plan_name?: string;
  changed_by_name?: string;
}

export interface DBAdminAuditLog {
  id: string;
  actor_user_id: string;
  actor_name: string;
  action: string;
  target_type: "SHOP" | "SUBSCRIPTION" | "PLAN" | "USER";
  target_id: string;
  details_json: string | null;
  ip_address: string | null;
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

    // Initialize Trial Subscription
    const subId = `sub-${shop.id}`;
    const trialEnds = new Date(Date.now() + 14 * 86400000).toISOString();
    const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
    this.db.prepare(`
      INSERT OR IGNORE INTO shop_subscriptions (id, shop_id, plan_id, status, started_at, trial_ends_at, current_period_start, current_period_end, created_at, updated_at)
      VALUES (?, ?, 'plan_trial', 'TRIAL', ?, ?, ?, ?, ?, ?)
    `).run(subId, shop.id, now, trialEnds, now, periodEnd, now, now);

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
  getCategoriesByShop(shopId: string): DBCategory[] {
    return this.db.prepare(`
      SELECT * FROM categories
      WHERE shop_id = ?
      ORDER BY sort_order ASC, name ASC
    `).all(shopId) as unknown as DBCategory[];
  }

  createCategory(data: { id: string; shop_id: string; name: string; slug: string; sort_order?: number }): DBCategory {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO categories (id, shop_id, name, slug, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_id, slug) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order
    `).run(data.id, data.shop_id, data.name, data.slug, data.sort_order || 0, now);

    return this.db.prepare("SELECT * FROM categories WHERE id = ?").get(data.id) as unknown as DBCategory;
  }

  getProductsByShop(shopId: string, categoryId?: string, onlyAvailable: boolean = false): DBProduct[] {
    let query = "SELECT * FROM products WHERE shop_id = ?";
    const params: any[] = [shopId];

    if (categoryId) {
      query += " AND category_id = ?";
      params.push(categoryId);
    }

    if (onlyAvailable) {
      query += " AND is_available = 1 AND stock_quantity > 0";
    }

    query += " ORDER BY name ASC";
    return this.db.prepare(query).all(...params) as unknown as DBProduct[];
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
    order.items = this.db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id) as unknown as DBOrderItem[];
    order.history = this.db.prepare("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC").all(order.id) as unknown as DBOrderStatusHistory[];
    return order;
  }

  createUnifiedOrder(params: UnifiedOrderParams): DBOrder {
    const now = new Date().toISOString();

    this.db.exec("BEGIN TRANSACTION;");
    try {
      // 1. Validate & atomically deduct inventory for stationery items
      if (params.items && params.items.length > 0) {
        for (const it of params.items) {
          const updateRes = this.db.prepare(`
            UPDATE products
            SET stock_quantity = stock_quantity - ?, updated_at = ?
            WHERE id = ? AND stock_quantity >= ?
          `).run(it.quantity, now, it.productId, it.quantity);

          if (updateRes.changes === 0) {
            throw new Error(`Insufficient stock for product '${it.title}'. Requested: ${it.quantity}.`);
          }
        }
      }

      // 2. Insert order
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

      // 3. Insert stationery items
      if (params.items && params.items.length > 0) {
        for (let i = 0; i < params.items.length; i++) {
          const it = params.items[i];
          const orderItemId = `item-${params.orderId}-${i + 1}`;
          this.db.prepare(`
            INSERT INTO order_items (id, order_id, product_id, item_type, title, quantity, unit_price, subtotal)
            VALUES (?, ?, ?, 'PRODUCT', ?, ?, ?, ?)
          `).run(orderItemId, params.orderId, it.productId, it.title, it.quantity, it.unitPrice, it.subtotal);
        }
      }

      // 4. Insert print job if present
      if (params.printJob) {
        const printItemId = `item-${params.orderId}-print`;
        this.db.prepare(`
          INSERT INTO order_items (id, order_id, product_id, item_type, title, quantity, unit_price, subtotal)
          VALUES (?, ?, NULL, 'PRINT_JOB', ?, ?, ?, ?)
        `).run(
          printItemId,
          params.orderId,
          `Document Print (${params.printJob.paper}, ${params.printJob.colour === "colour" ? "Color" : "B&W"})`,
          params.printJob.copies,
          params.printJob.calculatedPrice,
          params.printJob.calculatedPrice
        );

        this.db.prepare(`
          INSERT INTO print_jobs (
            id, order_id, order_item_id, original_file_name, storage_key, file_path, file_mime, file_size_bytes,
            paper_size, color_mode, sides, copies, binding, lamination, calculated_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `job-${params.orderId}-1`,
          params.orderId,
          printItemId,
          params.printJob.fileName,
          params.printJob.storageKey,
          params.printJob.filePath,
          params.printJob.fileMime || "application/pdf",
          params.printJob.fileSizeBytes || 0,
          params.printJob.paper,
          params.printJob.colour,
          params.printJob.sides,
          params.printJob.copies,
          params.printJob.binding ? 1 : 0,
          params.printJob.lamination ? 1 : 0,
          params.printJob.calculatedPrice
        );
      }

      // 5. Insert status history
      this.db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_name, note, created_at)
        VALUES (?, ?, NULL, 'Pending', ?, 'Order placed by customer', ?)
      `).run(
        `hist-${params.orderId}-0`,
        params.orderId,
        params.customerName || "Customer",
        now
      );

      // 6. Notifications for customer and shop staff
      if (params.customerId) {
        this.createNotification({
          userId: params.customerId,
          shopId: params.shopId,
          orderId: params.orderId,
          type: "ORDER_PLACED",
          title: "Order Placed Successfully",
          message: `Your pickup order #${params.orderId} has been confirmed. Selected pickup slot: ${params.pickupTime}.`,
        });
      }

      const staffUserIds = this.getShopStaffUserIds(params.shopId);
      for (const staffId of staffUserIds) {
        this.createNotification({
          userId: staffId,
          shopId: params.shopId,
          orderId: params.orderId,
          type: "ORDER_PLACED",
          title: "New Incoming Order",
          message: `New order #${params.orderId} received for self-pickup at ${params.pickupTime}. Total: ₹${params.totalAmount}.`,
        });
      }

      this.db.exec("COMMIT;");
      return this.getOrderById(params.orderId)!;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
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
    return this.createUnifiedOrder({
      orderId: params.orderId,
      shopId: params.shopId,
      customerId: params.customerId,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      pickupTime: params.pickupTime,
      pickupToken: params.pickupToken,
      pickupTokenHash: params.pickupTokenHash,
      totalAmount: params.totalAmount,
      items: [],
      printJob: {
        fileName: params.fileName,
        storageKey: params.storageKey,
        filePath: params.filePath,
        fileMime: params.fileMime,
        fileSizeBytes: params.fileSizeBytes,
        paper: params.paper,
        colour: params.colour,
        sides: params.sides,
        copies: params.copies,
        binding: params.binding,
        lamination: params.lamination,
        calculatedPrice: params.totalAmount,
      },
    });
  }

  updateOrderStatus(
    orderId: string,
    newStatus: "Pending" | "Accepted" | "Preparing" | "Ready" | "Completed" | "Rejected" | "Cancelled",
    user: { id?: string; name: string; role: string },
    note?: string
  ): DBOrder {
    const now = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DBOrder | undefined;
      if (!current) throw new Error("Order not found");

      // Terminal state constraints
      if (current.status === "Completed") {
        throw new Error("Cannot cancel, reject, or modify an order in terminal status 'Completed'.");
      }
      if (current.status === "Cancelled" || current.status === "Rejected") {
        throw new Error(`Order is already in terminal status '${current.status}'.`);
      }
      if (current.status === newStatus) {
        throw new Error(`Order is already in '${newStatus}' status.`);
      }

      // Inventory restoration when order is cancelled or rejected before completion
      if (newStatus === "Cancelled" || newStatus === "Rejected") {
        if (["Pending", "Accepted", "Preparing", "Ready"].includes(current.status)) {
          const items = this.db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId) as unknown as DBOrderItem[];
          if (items && items.length > 0) {
            for (const item of items) {
              if (item.item_type === "PRODUCT" && item.product_id) {
                this.db.prepare(`
                  UPDATE products
                  SET stock_quantity = stock_quantity + ?, updated_at = ?
                  WHERE id = ?
                `).run(item.quantity, now, item.product_id);
              }
            }
          }
        }
      }

      const res = this.db.prepare(`
        UPDATE orders
        SET status = ?, updated_at = ?
        WHERE id = ? AND status = ?
      `).run(newStatus, now, orderId, current.status);

      if (res.changes === 0) {
        throw new Error(`Concurrent status update conflict on order ${orderId}`);
      }

      this.db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, changed_by_name, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist-${orderId}-${Date.now()}`,
        orderId,
        current.status,
        newStatus,
        user.id || null,
        `${user.name} (${user.role})`,
        note || `Status updated to ${newStatus}`,
        now
      );

      // Auto-notify customer of status progression
      if (current.customer_id) {
        let notifTitle = `Order Status: ${newStatus}`;
        let notifMsg = `Order #${orderId} status changed to ${newStatus}.`;
        if (newStatus === "Accepted") {
          notifTitle = "Order Accepted";
          notifMsg = `Your order #${orderId} has been accepted by the shop and will be prepared shortly.`;
        } else if (newStatus === "Preparing") {
          notifTitle = "Order Being Prepared";
          notifMsg = `The shop has started preparing your order #${orderId}.`;
        } else if (newStatus === "Ready") {
          notifTitle = "Ready for Self-Pickup!";
          notifMsg = `Your order #${orderId} is packaged and ready at the shop counter. Show your pickup code to collect.`;
        } else if (newStatus === "Cancelled") {
          notifTitle = "Order Cancelled";
          notifMsg = `Your order #${orderId} was cancelled. ${note || ""}`;
        } else if (newStatus === "Rejected") {
          notifTitle = "Order Rejected";
          notifMsg = `Your order #${orderId} was declined by the shop. ${note || ""}`;
        }

        this.createNotification({
          userId: current.customer_id,
          shopId: current.shop_id,
          orderId: orderId,
          type: `ORDER_${newStatus.toUpperCase()}`,
          title: notifTitle,
          message: notifMsg,
        });
      }

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
    const now = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as DBOrder | undefined;
      if (!current) throw new Error("Order not found");

      if (current.status === "Completed") {
        throw new Error("Order is already Completed and collected");
      }
      if (current.status !== "Ready") {
        throw new Error(`Order cannot be verified in '${current.status}' status. It must be marked 'Ready' first.`);
      }

      const res = this.db.prepare(`
        UPDATE orders
        SET status = 'Completed', verified_by_user_id = ?, verified_at = ?, updated_at = ?
        WHERE id = ? AND status = 'Ready'
      `).run(user.id, now, now, orderId);

      if (res.changes === 0) {
        throw new Error(`Concurrent pickup verification conflict on order ${orderId}`);
      }

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

      // Notification to customer
      if (current.customer_id) {
        this.createNotification({
          userId: current.customer_id,
          shopId: current.shop_id,
          orderId: orderId,
          type: "ORDER_COMPLETED",
          title: "Order Collected Successfully",
          message: `Your pickup for order #${orderId} was verified at the counter. Thank you for using LocalPickup!`,
        });
      }

      this.db.exec("COMMIT;");
      return this.getOrderById(orderId)!;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  // ----------------------------------------------------
  // Notification Operations
  // ----------------------------------------------------
  createNotification(params: {
    id?: string;
    userId: string;
    shopId?: string | null;
    orderId?: string | null;
    type: string;
    title: string;
    message: string;
  }): DBNotification {
    const id = params.id || `notif-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO notifications (id, user_id, shop_id, order_id, type, title, message, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      params.userId,
      params.shopId || null,
      params.orderId || null,
      params.type,
      params.title,
      params.message,
      now
    );
    return {
      id,
      user_id: params.userId,
      shop_id: params.shopId || null,
      order_id: params.orderId || null,
      type: params.type,
      title: params.title,
      message: params.message,
      is_read: 0,
      created_at: now,
    };
  }

  getNotificationsByUser(userId: string, limit: number = 50): DBNotification[] {
    return this.db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit) as unknown as DBNotification[];
  }

  getUnreadNotificationCount(userId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(userId) as { count: number };
    return row ? row.count : 0;
  }

  markNotificationAsRead(id: string, userId: string): boolean {
    const res = this.db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE id = ? AND user_id = ?
    `).run(id, userId);
    return Number(res.changes) > 0;
  }

  markAllNotificationsAsRead(userId: string): number {
    const res = this.db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ? AND is_read = 0
    `).run(userId);
    return Number(res.changes);
  }

  getOrderTimeline(orderId: string): DBOrderStatusHistory[] {
    return this.db.prepare(`
      SELECT * FROM order_status_history
      WHERE order_id = ?
      ORDER BY created_at ASC
    `).all(orderId) as unknown as DBOrderStatusHistory[];
  }

  getShopStaffUserIds(shopId: string): string[] {
    const members = this.db.prepare(`
      SELECT user_id FROM shop_members WHERE shop_id = ?
    `).all(shopId) as Array<{ user_id: string }>;
    const shop = this.getShopById(shopId);
    const set = new Set<string>();
    if (shop?.owner_id) set.add(shop.owner_id);
    for (const m of members) set.add(m.user_id);
    return Array.from(set);
  }

  // ----------------------------------------------------
  // Subscription Plan Operations
  // ----------------------------------------------------
  getAllSubscriptionPlans(includeInactive: boolean = false): DBSubscriptionPlan[] {
    const sql = includeInactive
      ? "SELECT * FROM subscription_plans ORDER BY monthly_price ASC"
      : "SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY monthly_price ASC";
    return this.db.prepare(sql).all() as unknown as DBSubscriptionPlan[];
  }

  getSubscriptionPlanById(id: string): DBSubscriptionPlan | null {
    const row = this.db.prepare("SELECT * FROM subscription_plans WHERE id = ?").get(id);
    return row ? (row as unknown as DBSubscriptionPlan) : null;
  }

  createSubscriptionPlan(data: {
    id?: string;
    name: string;
    slug: string;
    description?: string;
    monthly_price: number;
    maximum_staff: number;
    maximum_products: number;
    analytics_level?: "BASIC" | "STANDARD" | "ADVANCED";
    feature_config_json?: string;
  }): DBSubscriptionPlan {
    const id = data.id || `plan_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO subscription_plans (id, name, slug, description, monthly_price, maximum_staff, maximum_products, analytics_level, feature_config_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      data.name,
      data.slug,
      data.description || null,
      data.monthly_price,
      data.maximum_staff,
      data.maximum_products,
      data.analytics_level || "BASIC",
      data.feature_config_json || null,
      now,
      now
    );
    return this.getSubscriptionPlanById(id)!;
  }

  updateSubscriptionPlan(id: string, updates: Partial<{
    name: string;
    description: string;
    monthly_price: number;
    maximum_staff: number;
    maximum_products: number;
    analytics_level: "BASIC" | "STANDARD" | "ADVANCED";
    feature_config_json: string;
    is_active: number;
  }>): DBSubscriptionPlan | null {
    const plan = this.getSubscriptionPlanById(id);
    if (!plan) return null;

    const fields: string[] = [];
    const values: any[] = [];
    if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push("description = ?"); values.push(updates.description); }
    if (updates.monthly_price !== undefined) { fields.push("monthly_price = ?"); values.push(updates.monthly_price); }
    if (updates.maximum_staff !== undefined) { fields.push("maximum_staff = ?"); values.push(updates.maximum_staff); }
    if (updates.maximum_products !== undefined) { fields.push("maximum_products = ?"); values.push(updates.maximum_products); }
    if (updates.analytics_level !== undefined) { fields.push("analytics_level = ?"); values.push(updates.analytics_level); }
    if (updates.feature_config_json !== undefined) { fields.push("feature_config_json = ?"); values.push(updates.feature_config_json); }
    if (updates.is_active !== undefined) { fields.push("is_active = ?"); values.push(updates.is_active); }

    if (fields.length > 0) {
      fields.push("updated_at = ?");
      values.push(new Date().toISOString());
      values.push(id);
      this.db.prepare(`UPDATE subscription_plans SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }
    return this.getSubscriptionPlanById(id);
  }

  // ----------------------------------------------------
  // Shop Subscription Operations
  // ----------------------------------------------------
  getShopSubscription(shopId: string): DBShopSubscription | null {
    const row = this.db.prepare("SELECT * FROM shop_subscriptions WHERE shop_id = ?").get(shopId) as any;
    if (!row) return null;
    const plan = this.getSubscriptionPlanById(row.plan_id);
    const requestedPlan = row.requested_plan_id ? this.getSubscriptionPlanById(row.requested_plan_id) : undefined;
    return {
      ...row,
      plan: plan || undefined,
      requested_plan: requestedPlan || undefined,
    };
  }

  assignShopPlan(
    shopId: string,
    planId: string,
    actorUserId: string,
    reason: string = "Admin plan assignment"
  ): DBShopSubscription {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const plan = this.getSubscriptionPlanById(planId);
      if (!plan) throw new Error("Subscription plan not found");

      const existing = this.getShopSubscription(shopId);
      const now = new Date().toISOString();
      const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();

      let fromPlanId: string | null = null;
      let fromStatus: string | null = null;

      if (existing) {
        fromPlanId = existing.plan_id;
        fromStatus = existing.status;
        this.db.prepare(`
          UPDATE shop_subscriptions
          SET plan_id = ?, status = 'ACTIVE', current_period_start = ?, current_period_end = ?, requested_plan_id = NULL, requested_at = NULL, updated_at = ?
          WHERE shop_id = ?
        `).run(planId, now, periodEnd, now, shopId);
      } else {
        const subId = `sub-${shopId}`;
        this.db.prepare(`
          INSERT INTO shop_subscriptions (id, shop_id, plan_id, status, started_at, current_period_start, current_period_end, created_at, updated_at)
          VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)
        `).run(subId, shopId, planId, now, now, periodEnd, now, now);
      }

      // Keep shops.subscription_status in sync
      this.db.prepare("UPDATE shops SET subscription_status = 'ACTIVE' WHERE id = ?").run(shopId);

      // Record in history
      const histId = `subhist-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      this.db.prepare(`
        INSERT INTO subscription_history (id, shop_id, from_plan_id, to_plan_id, from_status, to_status, changed_by_user_id, reason, created_at)
        VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
      `).run(histId, shopId, fromPlanId, planId, fromStatus, actorUserId, reason, now);

      this.db.exec("COMMIT;");
      return this.getShopSubscription(shopId)!;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  updateShopSubscriptionStatus(
    shopId: string,
    newStatus: "TRIAL" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "SUSPENDED" | "CANCELLED",
    actorUserId: string,
    reason: string = "Admin status update"
  ): DBShopSubscription {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = this.getShopSubscription(shopId);
      if (!existing) throw new Error("Shop subscription record not found");

      const now = new Date().toISOString();
      const updates: string[] = ["status = ?", "updated_at = ?"];
      const values: any[] = [newStatus, now];

      if (newStatus === "CANCELLED") {
        updates.push("cancelled_at = ?");
        values.push(now);
      }

      values.push(shopId);
      this.db.prepare(`UPDATE shop_subscriptions SET ${updates.join(", ")} WHERE shop_id = ?`).run(...values);

      // Keep shops.subscription_status in sync
      const legacyStatus =
        newStatus === "PAST_DUE" || newStatus === "EXPIRED" || newStatus === "CANCELLED"
          ? newStatus === "PAST_DUE"
            ? "ACTIVE"
            : "SUSPENDED"
          : newStatus;
      this.db.prepare("UPDATE shops SET subscription_status = ? WHERE id = ?").run(legacyStatus, shopId);

      // Record history
      const histId = `subhist-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      this.db.prepare(`
        INSERT INTO subscription_history (id, shop_id, from_plan_id, to_plan_id, from_status, to_status, changed_by_user_id, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(histId, shopId, existing.plan_id, existing.plan_id, existing.status, newStatus, actorUserId, reason, now);

      this.db.exec("COMMIT;");
      return this.getShopSubscription(shopId)!;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  extendShopTrial(shopId: string, additionalDays: number, actorUserId: string): DBShopSubscription {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = this.getShopSubscription(shopId);
      if (!existing) throw new Error("Shop subscription not found");

      const baseTime = existing.trial_ends_at ? new Date(existing.trial_ends_at).getTime() : Date.now();
      const newTrialEnds = new Date(Math.max(baseTime, Date.now()) + additionalDays * 86400000).toISOString();
      const now = new Date().toISOString();

      this.db.prepare(`
        UPDATE shop_subscriptions
        SET trial_ends_at = ?, status = 'TRIAL', updated_at = ?
        WHERE shop_id = ?
      `).run(newTrialEnds, now, shopId);

      this.db.prepare("UPDATE shops SET subscription_status = 'TRIAL' WHERE id = ?").run(shopId);

      const histId = `subhist-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      this.db.prepare(`
        INSERT INTO subscription_history (id, shop_id, from_plan_id, to_plan_id, from_status, to_status, changed_by_user_id, reason, created_at)
        VALUES (?, ?, ?, ?, ?, 'TRIAL', ?, ?, ?)
      `).run(histId, shopId, existing.plan_id, existing.plan_id, existing.status, actorUserId, `Trial extended by ${additionalDays} days`, now);

      this.db.exec("COMMIT;");
      return this.getShopSubscription(shopId)!;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  requestPlanChange(shopId: string, requestedPlanId: string): DBShopSubscription {
    const plan = this.getSubscriptionPlanById(requestedPlanId);
    if (!plan) throw new Error("Requested plan does not exist");

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE shop_subscriptions
      SET requested_plan_id = ?, requested_at = ?, updated_at = ?
      WHERE shop_id = ?
    `).run(requestedPlanId, now, now, shopId);

    return this.getShopSubscription(shopId)!;
  }

  getSubscriptionHistory(shopId: string): DBSubscriptionHistory[] {
    return this.db.prepare(`
      SELECT sh.*, 
             p1.name as from_plan_name, 
             p2.name as to_plan_name,
             u.name as changed_by_name
      FROM subscription_history sh
      LEFT JOIN subscription_plans p1 ON sh.from_plan_id = p1.id
      LEFT JOIN subscription_plans p2 ON sh.to_plan_id = p2.id
      LEFT JOIN users u ON sh.changed_by_user_id = u.id
      WHERE sh.shop_id = ?
      ORDER BY sh.created_at DESC
    `).all(shopId) as unknown as DBSubscriptionHistory[];
  }

  // ----------------------------------------------------
  // Entitlement & Plan Limit Enforcement
  // ----------------------------------------------------
  getShopEntitlements(shopId: string) {
    const sub = this.getShopSubscription(shopId);
    const plan = sub?.plan || this.getSubscriptionPlanById("plan_starter")!;
    const status = sub?.status || "TRIAL";

    // Staff count check (only operational staff members count against quota, not the shop owner)
    const staffRow = this.db.prepare("SELECT COUNT(*) as c FROM shop_members WHERE shop_id = ? AND role = 'STAFF'").get(shopId) as any;
    const currentStaffCount = staffRow ? Number(staffRow.c) : 0;

    // Product count check
    const prodRow = this.db.prepare("SELECT COUNT(*) as c FROM products WHERE shop_id = ?").get(shopId) as any;
    const currentProductCount = prodRow ? Number(prodRow.c) : 0;

    const isSuspended = status === "SUSPENDED";
    const isCancelled = status === "CANCELLED";
    const isExpired =
      status === "EXPIRED" ||
      (status === "TRIAL" && sub?.trial_ends_at && new Date(sub.trial_ends_at).getTime() < Date.now());
    const isPastDue = status === "PAST_DUE";

    const canAcceptOrders = !isSuspended && !isExpired && !isCancelled;
    const canAddStaff = currentStaffCount < plan.maximum_staff;
    const canAddProduct = currentProductCount < plan.maximum_products;

    return {
      sub,
      plan,
      status: isExpired && status === "TRIAL" ? "EXPIRED" : status,
      currentStaffCount,
      maxStaff: plan.maximum_staff,
      canAddStaff,
      currentProductCount,
      maxProducts: plan.maximum_products,
      canAddProduct,
      canAcceptOrders,
      isSuspended,
      isExpired: Boolean(isExpired),
      isPastDue,
      analyticsLevel: plan.analytics_level,
    };
  }

  // ----------------------------------------------------
  // Admin Audit Log Operations
  // ----------------------------------------------------
  createAdminAuditLog(params: {
    actorUserId: string;
    actorName: string;
    action: string;
    targetType: "SHOP" | "SUBSCRIPTION" | "PLAN" | "USER";
    targetId: string;
    details?: any;
    ipAddress?: string;
  }): DBAdminAuditLog {
    const id = `audit-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const now = new Date().toISOString();
    const detailsJson = params.details ? JSON.stringify(params.details) : null;

    this.db.prepare(`
      INSERT INTO admin_audit_logs (id, actor_user_id, actor_name, action, target_type, target_id, details_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.actorUserId,
      params.actorName,
      params.action,
      params.targetType,
      params.targetId,
      detailsJson,
      params.ipAddress || null,
      now
    );

    return {
      id,
      actor_user_id: params.actorUserId,
      actor_name: params.actorName,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      details_json: detailsJson,
      ip_address: params.ipAddress || null,
      created_at: now,
    };
  }

  getAdminAuditLogs(limit: number = 50, offset: number = 0): DBAdminAuditLog[] {
    return this.db.prepare(`
      SELECT * FROM admin_audit_logs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as unknown as DBAdminAuditLog[];
  }
}
