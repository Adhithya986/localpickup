import fs from "fs/promises";
import path from "path";

export interface User {
  id: string;
  email: string;
  password?: string;
  name: string;
  role: "CUSTOMER" | "SHOPKEEPER" | "ADMIN";
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
}

export interface Order {
  id: string;
  shopId: string;
  shopName: string;
  fileName: string;
  filePath: string;
  paper: string;
  colour: string;
  sides: string;
  copies: number;
  binding: boolean;
  lamination: boolean;
  total: number;
  pickupTime: string;
  status: "Pending" | "Ready" | "Completed";
  createdAt: string;
}

export interface DatabaseSchema {
  users: User[];
  shops: Shop[];
  orders: Order[];
}

const dbPath = path.join(__dirname, "..", "data.json");

const initialData: DatabaseSchema = {
  users: [
    { id: "admin-1", email: "admin@localpickup.com", password: "password123", name: "System Admin", role: "ADMIN" },
    { id: "shop-1", email: "shop1@abc.com", password: "password123", name: "ABC Prints Owner", role: "SHOPKEEPER" },
    { id: "cust-1", email: "customer@gmail.com", password: "password123", name: "Test Customer", role: "CUSTOMER" }
  ],
  shops: [
    {
      id: "1",
      name: "ABC Digital Prints",
      description: "Printing • Photocopy • Binding",
      distance: "0.8 km",
      price: "From ₹2",
      rating: "4.6",
      ownerId: "shop-1",
      subscriptionStatus: "ACTIVE",
    },
    {
      id: "2",
      name: "Quick Print Center",
      description: "Printing • Binding • Lamination",
      distance: "1.2 km",
      price: "From ₹3",
      rating: "4.4",
      ownerId: "shop-1",
      subscriptionStatus: "ACTIVE",
    },
    {
      id: "3",
      name: "City Copy & Print",
      description: "Printing • Documents • Scanning",
      distance: "1.8 km",
      price: "From ₹2",
      rating: "4.5",
      ownerId: "shop-1",
      subscriptionStatus: "SUSPENDED",
    },
  ],
  orders: [],
};

export async function readDB(): Promise<DatabaseSchema> {
  try {
    const data = await fs.readFile(dbPath, "utf-8");
    const parsed = JSON.parse(data);
    // Migration for existing data.json
    if (!parsed.users) parsed.users = initialData.users;
    return parsed;
  } catch (error) {
    await writeDB(initialData);
    return initialData;
  }
}

export async function writeDB(data: DatabaseSchema): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), "utf-8");
}
