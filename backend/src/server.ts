import { app } from "./app";
import { config } from "./config";
import { readDB } from "./database";

async function startServer() {
  try {
    // Warm up database and ensure initial schema/password hashing migration runs
    await readDB();

    app.listen(config.port, () => {
      console.log(`[LocalPickup] Backend listening on port ${config.port} (${config.nodeEnv})`);
      console.log(`[LocalPickup] Document uploads restricted to authenticated endpoints.`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();