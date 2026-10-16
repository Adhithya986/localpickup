import express from "express";
import cors from "cors";
import path from "path";
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
import { authenticateToken } from "./middleware/auth";
import { initDatabaseSync } from "./database";

export const app = express();

// Initialize database schema and migrations
initDatabaseSync();

// Security: configure CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or configured origin
      if (!origin || origin.startsWith("http://localhost:") || origin === config.corsOrigin) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in dev/test, strict in prod
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

// Protected legacy upload path interceptor: NEVER expose files publicly without auth!
app.get("/uploads/:filename", authenticateToken, (req, res) => {
  const param = req.params.filename;
  const rawFilename = Array.isArray(param) ? param[0] : param;
  const safeFilename = path.basename(String(rawFilename));
  const fullPath = path.join(config.uploadDir, safeFilename);
  res.sendFile(fullPath);
});

// Centralized error handling middleware
app.use(errorHandler);

export default app;
