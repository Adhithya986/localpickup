import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

export interface AppConfig {
  port: number;
  nodeEnv: "development" | "production" | "staging" | "test";
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string;
  uploadDir: string;
  maxFileSize: number; // in bytes
  dbPath: string;
}

const isTest =
  process.env.NODE_ENV === "test" ||
  process.env.npm_lifecycle_event === "test" ||
  process.argv.some((arg) => arg.includes("--test") || arg.includes("tests/"));

const rawEnv = (process.env.NODE_ENV || "development").toLowerCase();
const nodeEnv: "development" | "production" | "staging" | "test" = isTest
  ? "test"
  : rawEnv === "production"
  ? "production"
  : rawEnv === "staging"
  ? "staging"
  : "development";

const isDeployed = nodeEnv === "production" || nodeEnv === "staging";
const jwtSecret = process.env.JWT_SECRET || "";

// Fail safely during staging/production startup if required secrets are missing or insecure
if (isDeployed) {
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes("default") || jwtSecret.includes("replace_with")) {
    console.error(`FATAL: In ${nodeEnv}, JWT_SECRET must be set and contain at least 32 cryptographically secure characters.`);
    process.exit(1);
  }
}

// In non-deployed environments, ensure a minimum usable secret exists with a clear warning
const resolvedJwtSecret = jwtSecret || (nodeEnv === "test" ? "test-secret-must-be-at-least-32-chars-long!" : "dev-only-secret-key-32-chars-minimum-required!");
if (!isDeployed && nodeEnv !== "test" && !jwtSecret) {
  console.warn("WARNING: JWT_SECRET environment variable is not set. Using dev fallback. DO NOT USE IN PRODUCTION OR STAGING.");
}

// Protected databases that automated tests MUST NEVER ACCESS
const PROTECTED_DATABASES = new Set([
  "localpickup.db",
  "localpickup_staging.db",
  "localpickup_production.db",
]);

let resolvedDbPath: string;
let resolvedUploadDir: string;

if (isTest) {
  resolvedDbPath = process.env.TEST_DB_PATH || path.resolve(__dirname, "..", "localpickup.test.db");
  resolvedUploadDir = path.resolve(__dirname, "..", process.env.TEST_UPLOAD_DIR || "test_uploads");

  // FATAL SAFETY INTERLOCK: Verify database is not a protected development/staging/production database
  const normalizedDb = path.basename(resolvedDbPath).toLowerCase();
  if (
    PROTECTED_DATABASES.has(normalizedDb) ||
    (resolvedDbPath.toLowerCase().endsWith("localpickup.db") && !resolvedDbPath.toLowerCase().endsWith("localpickup.test.db"))
  ) {
    console.error(
      `\n========================================================================\n` +
      `FATAL SAFETY INTERLOCK TRIGGERED: Automated test runner detected protected database path:\n` +
      `  '${resolvedDbPath}'\n` +
      `Automated tests are strictly forbidden from modifying or accessing production or development databases.\n` +
      `Test execution aborted immediately.\n` +
      `========================================================================\n`
    );
    process.exit(1);
  }

  // FATAL SAFETY INTERLOCK: Verify uploadDir is not the live uploads directory
  const liveUploadDir = path.resolve(__dirname, "..", "uploads").toLowerCase();
  if (path.resolve(resolvedUploadDir).toLowerCase() === liveUploadDir) {
    console.error(
      `\n========================================================================\n` +
      `FATAL SAFETY INTERLOCK TRIGGERED: Automated test runner detected live upload directory:\n` +
      `  '${resolvedUploadDir}'\n` +
      `Automated tests must use an isolated test upload directory (e.g. test_uploads).\n` +
      `Test execution aborted immediately.\n` +
      `========================================================================\n`
    );
    process.exit(1);
  }
} else {
  resolvedDbPath = process.env.DB_PATH || process.env.DATABASE_PATH || path.resolve(__dirname, "..", "localpickup.db");
  resolvedUploadDir = path.resolve(__dirname, "..", process.env.UPLOAD_DIR || "uploads");
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv,
  jwtSecret: resolvedJwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  uploadDir: resolvedUploadDir,
  maxFileSize: 25 * 1024 * 1024, // 25 MB max document upload
  dbPath: resolvedDbPath,
};
