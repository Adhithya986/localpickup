import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getDatabase, closeDatabase } from "../db/sqlite";
import { config } from "../config";

export interface BackupResult {
  backupDir: string;
  dbSnapshotPath: string;
  dbSha256: string;
  documentsCount: number;
  timestamp: string;
}

export function performConsistentBackup(targetParentDir?: string): BackupResult {
  const baseDir = targetParentDir || path.resolve(__dirname, "../../backups");
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFolder = path.join(baseDir, `backup_${timestamp}`);
  fs.mkdirSync(backupFolder, { recursive: true });

  const snapshotDbPath = path.join(backupFolder, "localpickup.db");

  // Consistent SQLite snapshot using VACUUM INTO
  // In WAL mode, VACUUM INTO safely checkpoints uncommitted WAL frames into a clean, standalone database file.
  const db = getDatabase();
  console.log(`[Backup] Initiating SQLite VACUUM INTO snapshot...`);
  
  // Normalize Windows paths with forward slashes for SQLite string literal
  const sqliteSafeSnapshotPath = snapshotDbPath.replace(/\\/g, "/");
  db.exec(`VACUUM INTO '${sqliteSafeSnapshotPath}';`);

  // Compute SHA-256 checksum of database snapshot
  const dbBuffer = fs.readFileSync(snapshotDbPath);
  const dbSha256 = crypto.createHash("sha256").update(dbBuffer).digest("hex");

  // Backup uploaded customer documents
  const backupUploadsDir = path.join(backupFolder, "uploads");
  fs.mkdirSync(backupUploadsDir, { recursive: true });

  let documentsCount = 0;
  if (fs.existsSync(config.uploadDir)) {
    const files = fs.readdirSync(config.uploadDir);
    for (const file of files) {
      const srcFile = path.join(config.uploadDir, file);
      const stat = fs.statSync(srcFile);
      if (stat.isFile()) {
        fs.copyFileSync(srcFile, path.join(backupUploadsDir, file));
        documentsCount++;
      }
    }
  }

  // Write metadata manifest
  const metadata = {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    dbFile: "localpickup.db",
    dbSha256,
    dbSizeBytes: dbBuffer.length,
    documentsCount,
    sourceDbPath: config.dbPath,
    sourceUploadDir: config.uploadDir,
  };

  fs.writeFileSync(path.join(backupFolder, "manifest.json"), JSON.stringify(metadata, null, 2), "utf8");

  console.log(`[Backup] Successfully created consistent snapshot at: ${backupFolder}`);
  console.log(`[Backup] DB SHA-256 Checksum: ${dbSha256}`);
  console.log(`[Backup] Preserved documents count: ${documentsCount}`);

  return {
    backupDir: backupFolder,
    dbSnapshotPath: snapshotDbPath,
    dbSha256,
    documentsCount,
    timestamp: metadata.timestamp,
  };
}

if (require.main === module) {
  try {
    performConsistentBackup();
    closeDatabase();
    process.exit(0);
  } catch (err) {
    console.error("[Backup Error]:", err);
    closeDatabase();
    process.exit(1);
  }
}
