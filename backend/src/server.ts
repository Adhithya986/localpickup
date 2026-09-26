import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { readDB, writeDB, Order } from "./database";

dotenv.config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, "..", "uploads");
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) {
      cb(err as Error, uploadPath);
    }
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "LocalPickup Backend",
    status: "healthy",
  });
});

// Get all shops
app.get("/api/shops", async (_req, res) => {
  const db = await readDB();
  res.json(db.shops);
});

// Get a specific shop
app.get("/api/shops/:id", async (req, res) => {
  const db = await readDB();
  const shop = db.shops.find((s) => s.id === req.params.id);
  if (shop) {
    res.json(shop);
  } else {
    res.status(404).json({ error: "Shop not found" });
  }
});

// Create an order
app.post("/api/orders", upload.single("file"), async (req, res) => {
  try {
    const { shopId, shopName, paper, colour, sides, copies, binding, lamination, total, pickupTime } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: "File is required" });
    }

    const db = await readDB();
    
    const newOrder: Order = {
      id: "LP-" + Date.now().toString().slice(-6),
      shopId,
      shopName,
      fileName: req.file.originalname,
      filePath: `/uploads/${req.file.filename}`,
      paper,
      colour,
      sides,
      copies: parseInt(copies, 10),
      binding: binding === "true",
      lamination: lamination === "true",
      total: parseFloat(total),
      pickupTime,
      status: "Pending",
      createdAt: new Date().toISOString(),
    };

    db.orders.push(newOrder);
    await writeDB(db);

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get all orders (for bookings page)
app.get("/api/orders", async (_req, res) => {
  const db = await readDB();
  res.json(db.orders);
});

// Update order status (for dashboard)
app.patch("/api/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const db = await readDB();
    const orderIndex = db.orders.findIndex((o) => o.id === req.params.id);

    if (orderIndex === -1) {
      return res.status(404).json({ error: "Order not found" });
    }

    db.orders[orderIndex].status = status;
    await writeDB(db);

    res.json(db.orders[orderIndex]);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Auth Routes
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const db = await readDB();
  const user = db.users.find((u) => u.email === email && u.password === password);
  
  if (user) {
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name, role } = req.body;
  const db = await readDB();
  
  if (db.users.find(u => u.email === email)) {
    return res.status(400).json({ error: "Email already exists" });
  }

  const newUser = {
    id: "usr-" + Date.now(),
    email,
    password,
    name,
    role
  };
  
  db.users.push(newUser as any);
  await writeDB(db);
  
  const { password: _, ...userWithoutPassword } = newUser;
  res.status(201).json(userWithoutPassword);
});

// Admin Routes
app.get("/api/admin/shops", async (_req, res) => {
  const db = await readDB();
  res.json(db.shops);
});

app.patch("/api/admin/shops/:id/subscription", async (req, res) => {
  const { status } = req.body;
  const db = await readDB();
  const shopIndex = db.shops.findIndex((s) => s.id === req.params.id);

  if (shopIndex === -1) {
    return res.status(404).json({ error: "Shop not found" });
  }

  db.shops[shopIndex].subscriptionStatus = status;
  await writeDB(db);
  res.json(db.shops[shopIndex]);
});

app.listen(PORT, () => {
  console.log(`LocalPickup backend running on http://localhost:${PORT}`);
});