import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

export interface AppConfig {
  port: number;
  nodeEnv: "development" | "production" | "test";
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string;
  uploadDir: string;
  maxFileSize: number; // in bytes
  dbPath: string;
}

const nodeEnv = (process.env.NODE_ENV as "development" | "production" | "test") || "development";
const jwtSecret = process.env.JWT_SECRET || "";

// Fail safely during production startup if required secrets are missing or insecure
if (nodeEnv === "production") {
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes("default") || jwtSecret.includes("replace_with")) {
    console.error("FATAL: In production, JWT_SECRET must be set and contain at least 32 cryptographically secure characters.");
    process.exit(1);
  }
}

// In non-production, ensure a minimum usable secret exists with a clear warning
const resolvedJwtSecret = jwtSecret || (nodeEnv === "test" ? "test-secret-must-be-at-least-32-chars-long!" : "dev-only-secret-key-32-chars-minimum-required!");
if (nodeEnv !== "production" && !jwtSecret) {
  console.warn("WARNING: JWT_SECRET environment variable is not set. Using dev fallback. DO NOT USE IN PRODUCTION.");
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv,
  jwtSecret: resolvedJwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  uploadDir: path.resolve(__dirname, "..", process.env.UPLOAD_DIR || "uploads"),
  maxFileSize: 25 * 1024 * 1024, // 25 MB max document upload
  dbPath: process.env.DB_PATH || process.env.DATABASE_PATH || (nodeEnv === "test" ? ":memory:" : path.resolve(__dirname, "..", "localpickup.db")),
};
