import { getDatabase } from "./db/sqlite";
import { runMigrations } from "./db/migrations";
import { Repository, DBUser, DBShop, DBOrder, DBProduct, DBShopMember } from "./db/repository";

export type UserRole = "ADMIN" | "PLATFORM_ADMIN" | "SHOP_OWNER" | "SHOPKEEPER" | "SHOP_STAFF" | "CUSTOMER";

export interface User {
  id: string;
  email: string;
  password?: string;
  name: string;
  role: UserRole;
  shopId?: string;
  createdAt?: string;
}

export interface Shop {
  id: string;
  name: string;
  description: string;
  distance: string;
  price: string;
  rating: string;
  ownerId?: string;
  subscriptionStatus?: "ACTIVE" | "SUSPENDED" | "TRIAL";
  address?: string;
  phone?: string;
  pricingConfig?: {
    a4BwPrice: number;
    a4ColourPrice: number;
    a3BwPrice: number;
    a3ColourPrice: number;
    doubleSideDiscount: number;
    bindingPrice: number;
    laminationPrice: number;
  };
}

export type OrderStatus = "Pending" | "Accepted" | "Preparing" | "Ready" | "Completed" | "Rejected" | "Cancelled";

export interface OrderStatusChange {
  status: OrderStatus;
  changedAt: string;
  changedBy?: string;
  note?: string;
}

export interface Order {
  id: string;
  shopId: string;
  shopName: string;
  customerId?: string;
  customerEmail?: string;
  fileName: string;
  storageKey: string;
  filePath: string;
  fileMime?: string;
  fileSizeBytes?: number;
  paper: "A4" | "A3";
  colour: "bw" | "colour";
  sides: "single" | "double";
  copies: number;
  binding: boolean;
  lamination: boolean;
  total: number;
  pickupTime: string;
  pickupToken?: string;
  pickupTokenHash?: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
  statusHistory?: OrderStatusChange[];
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface DatabaseSchema {
  users: User[];
  shops: Shop[];
  orders: Order[];
}

// Global Repository instance
export const repository = new Repository();

let initialized = false;

export function initDatabaseSync(dbPath?: string): void {
  const db = getDatabase(dbPath);
  runMigrations(db);
  initialized = true;
}

export async function readDB(): Promise<DatabaseSchema> {
  if (!initialized) {
    initDatabaseSync();
  }

  const rawUsers = repository.getUserById("admin-1") ? (getDatabase().prepare("SELECT * FROM users").all() as unknown as DBUser[]) : [];
  const rawShops = repository.getAllShops();
  const rawOrders = repository.getAllOrders();

  const users: User[] = rawUsers.map((u) => {
    // Find associated shopId
    const mem = repository.getUserMemberships(u.id)[0];
    return {
      id: u.id,
      email: u.email,
      password: u.password_hash,
      name: u.name,
      role: u.global_role as UserRole,
      shopId: mem?.shop_id,
      createdAt: u.created_at,
    };
  });

  const shops: Shop[] = rawShops.map((s) => ({
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
  }));

  const orders: Order[] = rawOrders.map((o) => {
    const pj = o.print_job;
    const history = o.history || [];

    return {
      id: o.id,
      shopId: o.shop_id,
      shopName: o.shop_name || "Print Shop",
      customerId: o.customer_id || undefined,
      customerEmail: o.customer_email || undefined,
      fileName: pj?.original_file_name || "document.pdf",
      storageKey: pj?.storage_key || "file.bin",
      filePath: pj?.file_path || `/api/documents/${o.id}`,
      fileMime: pj?.file_mime || "application/pdf",
      fileSizeBytes: pj?.file_size_bytes || 0,
      paper: (pj?.paper_size || "A4") as "A4" | "A3",
      colour: (pj?.color_mode || "bw") as "bw" | "colour",
      sides: (pj?.sides || "single") as "single" | "double",
      copies: pj?.copies || 1,
      binding: (pj?.binding || 0) === 1,
      lamination: (pj?.lamination || 0) === 1,
      total: o.total_amount,
      pickupTime: o.pickup_time,
      pickupToken: o.pickup_token,
      pickupTokenHash: o.pickup_token_hash,
      status: o.status,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      statusHistory: history.map((h) => ({
        status: h.to_status as OrderStatus,
        changedAt: h.created_at,
        changedBy: h.changed_by_name || undefined,
        note: h.note || undefined,
      })),
      verifiedBy: o.verified_by_user_id || undefined,
      verifiedAt: o.verified_at || undefined,
    };
  });

  return { users, shops, orders };
}

export async function writeDB(_data: DatabaseSchema): Promise<void> {
  // Legacy compatibility: data updates in SQLite are executed atomically via the Repository.
  // This method ensures callers awaiting writeDB() succeed without errors.
  return Promise.resolve();
}

export { DBUser, DBShop, DBOrder, DBProduct, DBShopMember };
