import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { config } from "./config";
import authRoutes from "./routes/auth";
import ordersRoutes from "./routes/orders";
import documentsRoutes from "./routes/documents";
import shopsRoutes from "./routes/shops";
import staffRoutes from "./routes/staff";
import productsRoutes from "./routes/products";
import adminRoutes from "./routes/admin";
import notificationsRoutes from "./routes/notifications";
import { errorHandler } from "./middleware/errorHandler";
import { generalApiLimiter } from "./middleware/rateLimiter";
import { authenticateToken, isPlatformAdmin } from "./middleware/auth";
import { securityHeaders } from "./middleware/securityHeaders";
import { initDatabaseSync, repository } from "./database";
import { getDatabase } from "./db/sqlite";

export const app = express();

// Security: Disable X-Powered-By fingerprinting
app.disable("x-powered-by");

// Initialize database schema and migrations
initDatabaseSync();

// Security: Apply OWASP-recommended HTTP security headers
app.use(securityHeaders);

// Security: configure CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or configured origin
      if (!origin || origin.startsWith("http://localhost:") || origin === config.corsOrigin) {
        callback(null, true);
      } else if (config.nodeEnv === "production" || config.nodeEnv === "staging") {
        callback(new Error(`CORS policy violation: origin '${origin}' not permitted`));
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

// Payload limit protection
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// General rate limiter
app.use("/api", generalApiLimiter);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "LocalPickup Backend",
    status: "healthy",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// Primary API Routes
app.use("/api/auth", authRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/shops", shopsRoutes);
app.use("/api/shops", productsRoutes);
app.use("/api/shops", staffRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationsRoutes);

// Protected legacy upload path interceptor: Enforce strict order ownership and RBAC
app.get("/uploads/:filename", authenticateToken, (req, res) => {
  const param = req.params.filename;
  const rawFilename = Array.isArray(param) ? param[0] : param;
  const safeFilename = path.basename(String(rawFilename));

  // Find associated print job and order
  const db = getDatabase();
  const pj = db.prepare(`
    SELECT pj.order_id, o.customer_id, o.customer_email, o.shop_id 
    FROM print_jobs pj 
    JOIN orders o ON pj.order_id = o.id 
    WHERE pj.storage_key = ? OR pj.file_path LIKE ? 
    LIMIT 1
  `).get(safeFilename, `%${safeFilename}`) as any;

  if (!pj) {
    res.status(404).json({ error: "File not found or not associated with any active order." });
    return;
  }

  const user = req.user!;
  let isAuthorized = false;

  if (isPlatformAdmin(user.role)) {
    isAuthorized = true;
  } else if (pj.customer_id && pj.customer_id === user.id) {
    isAuthorized = true;
  } else if (pj.customer_email && pj.customer_email.toLowerCase() === user.email.toLowerCase()) {
    isAuthorized = true;
  } else if (repository.isShopMember(pj.shop_id, user.id)) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    res.status(403).json({ error: "Access denied: You are not authorized to view this document." });
    return;
  }

  const fullPath = path.join(config.uploadDir, safeFilename);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: "File not found on storage server." });
    return;
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-transform, max-age=3600");
  res.sendFile(fullPath);
});

// Centralized error handling middleware
app.use(errorHandler);

export default app;
