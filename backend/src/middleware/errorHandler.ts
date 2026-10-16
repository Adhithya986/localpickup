import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { config } from "../config";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  // Handle Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: `File size exceeds the allowed limit of ${config.maxFileSize / (1024 * 1024)}MB.` });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  // Handle explicit validation or custom error status codes
  const status = err.status || err.statusCode || 500;
  const isClientError = status >= 400 && status < 500;

  if (config.nodeEnv !== "production") {
    console.error("Unhandled error:", err);
  }

  const message = isClientError || config.nodeEnv !== "production"
    ? err.message || "An error occurred"
    : "Internal Server Error";

  res.status(status).json({
    error: message,
    ...(config.nodeEnv !== "production" && err.stack ? { stack: err.stack } : {}),
  });
}
