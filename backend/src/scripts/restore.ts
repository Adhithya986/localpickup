import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DatabaseSync } from "node:sqlite";

export interface RestoreVerificationResult {
  success: boolean;
  backupPath: string;
  targetDbPath: string;
  integrityStatus: string;
  userCount: number;
  shopCount: number;
  orderCount: number;
  productCount: number;
  checksumVerified: boolean;
  error?: string;
}

export function verifyAndRestoreBackup(options?: {
  backupFolder?: string;
  targetDbPath?: string;
  targetUploadsDir?: string;
  forceOverwriteLive?: boolean;
}): RestoreVerificationResult {
  const baseDir = path.resolve(__dirname, "../../backups");

  // Determine which backup folder to use
  let backupFolder = options?.backupFolder;
  if (!backupFolder) {
    if (!fs.existsSync(baseDir)) {
      throw new Error(`Backups directory '${baseDir}' does not exist.`);
    }
    const entries = fs
      .readdirSync(baseDir)
      .filter((e) => e.startsWith("backup_") && fs.statSync(path.join(baseDir, e)).isDirectory())
      .sort()
      .reverse();

    if (entries.length === 0) {
      throw new Error(`No backup folders found in '${baseDir}'.`);
    }
    backupFolder = path.join(baseDir, entries[0]);
  }

  const backupDbPath = path.join(backupFolder, "localpickup.db");
  if (!fs.existsSync(backupDbPath)) {
    throw new Error(`Backup database '${backupDbPath}' not found.`);
  }

  // Default target is a test database to guarantee live database is never overwritten during verification
  const targetDbPath = options?.targetDbPath || path.join(baseDir, "test_restore.db");
  const targetUploadsDir = options?.targetUploadsDir || path.join(baseDir, "test_restore_uploads");

  console.log(`[Restore] Inspecting backup: ${backupFolder}`);
  console.log(`[Restore] Target destination: ${targetDbPath}`);

  // 1. Verify Checksum if manifest exists
  let checksumVerified = false;
  const manifestPath = path.join(backupFolder, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const currentSha256 = crypto.createHash("sha256").update(fs.readFileSync(backupDbPath)).digest("hex");
    if (manifest.dbSha256 && manifest.dbSha256 !== currentSha256) {
      throw new Error(`Checksum mismatch! Expected ${manifest.dbSha256}, got ${currentSha256}`);
    }
    checksumVerified = true;
    console.log(`[Restore] SHA-256 Checksum verified successfully (${currentSha256})`);
  }

  // 2. Open backup database in isolation and run integrity_check
  const verifyDb = new DatabaseSync(backupDbPath, { enableForeignKeyConstraints: true });
  const integrityRow = verifyDb.prepare("PRAGMA integrity_check;").get() as any;
  const integrityStatus = integrityRow ? Object.values(integrityRow)[0] : "unknown";

  if (integrityStatus !== "ok") {
    verifyDb.close();
    throw new Error(`Database integrity check failed with status: ${integrityStatus}`);
  }
  console.log(`[Restore] PRAGMA integrity_check result: ${integrityStatus}`);

  // 3. Query sample record counts to confirm relational readability
  const userCount = Number((verifyDb.prepare("SELECT COUNT(*) as c FROM users").get() as any)?.c || 0);
  const shopCount = Number((verifyDb.prepare("SELECT COUNT(*) as c FROM shops").get() as any)?.c || 0);
  const orderCount = Number((verifyDb.prepare("SELECT COUNT(*) as c FROM orders").get() as any)?.c || 0);
  const productCount = Number((verifyDb.prepare("SELECT COUNT(*) as c FROM products").get() as any)?.c || 0);

  verifyDb.close();

  console.log(`[Restore] Verified records -> Users: ${userCount}, Shops: ${shopCount}, Orders: ${orderCount}, Products: ${productCount}`);

  // 4. Safely copy to target destination
  const targetDir = path.dirname(targetDbPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Remove existing target test DB if it exists
  if (fs.existsSync(targetDbPath)) {
    fs.unlinkSync(targetDbPath);
  }
  fs.copyFileSync(backupDbPath, targetDbPath);

  // 5. Restore uploads if present
  const backupUploadsDir = path.join(backupFolder, "uploads");
  if (fs.existsSync(backupUploadsDir)) {
    if (!fs.existsSync(targetUploadsDir)) {
      fs.mkdirSync(targetUploadsDir, { recursive: true });
    }
    const uploadFiles = fs.readdirSync(backupUploadsDir);
    for (const file of uploadFiles) {
      fs.copyFileSync(path.join(backupUploadsDir, file), path.join(targetUploadsDir, file));
    }
    console.log(`[Restore] Restored ${uploadFiles.length} print documents to: ${targetUploadsDir}`);
  }

  console.log(`[Restore] Restoration and validation successfully completed.`);

  return {
    success: true,
    backupPath: backupFolder,
    targetDbPath,
    integrityStatus: String(integrityStatus),
    userCount,
    shopCount,
    orderCount,
    productCount,
    checksumVerified,
  };
}

if (require.main === module) {
  try {
    verifyAndRestoreBackup();
    process.exit(0);
  } catch (err) {
    console.error("[Restore Error]:", err);
    process.exit(1);
  }
}
