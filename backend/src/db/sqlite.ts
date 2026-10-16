import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { config } from "../config";

let activeDb: DatabaseSync | null = null;

export function getDatabase(dbPathOverride?: string): DatabaseSync {
  if (activeDb && !dbPathOverride) {
    return activeDb;
  }

  const targetPath = dbPathOverride || config.dbPath;

  // If file-backed, ensure directory exists
  if (targetPath !== ":memory:") {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath, {
    enableForeignKeyConstraints: true,
  });

  // Enable WAL mode for high concurrency if file-backed
  if (targetPath !== ":memory:") {
    try {
      db.exec("PRAGMA journal_mode = WAL;");
    } catch {
      // In-memory or environments where WAL is not supported
    }
  }

  db.exec("PRAGMA foreign_keys = ON;");

  if (!dbPathOverride) {
    activeDb = db;
  }

  return db;
}

export function closeDatabase(): void {
  if (activeDb) {
    try {
      activeDb.close();
    } catch {
      // Ignored if already closed
    }
    activeDb = null;
  }
}
