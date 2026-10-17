import fs from "fs";
import path from "path";

/**
 * Clean up ONLY test-created artifacts (localpickup.test.db* and test_uploads).
 * Protected databases (localpickup.db, localpickup_staging.db, etc.) and live uploads
 * are strictly preserved and NEVER modified.
 */
export function cleanTestEnvironment(): void {
  const root = path.resolve(__dirname, "../..");
  const testDbFiles = [
    path.join(root, "localpickup.test.db"),
    path.join(root, "localpickup.test.db-wal"),
    path.join(root, "localpickup.test.db-shm"),
  ];

  for (const file of testDbFiles) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        // File may be locked by another process
      }
    }
  }

  const testUploadsDir = path.join(root, "test_uploads");
  if (fs.existsSync(testUploadsDir)) {
    try {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    } catch {
      // Directory may be in use
    }
  }
}

if (require.main === module) {
  cleanTestEnvironment();
}
