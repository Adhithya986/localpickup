import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { config } from "../config";

function sanitizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== "string") return "An error occurred";
  return msg
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
    .replace(/\$2[aby]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g, "[REDACTED_HASH]");
}

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

  if (config.nodeEnv !== "production" && !isClientError) {
    console.error("Unhandled error:", err);
  }

  const rawMessage = isClientError || config.nodeEnv !== "production"
    ? err.message || "An error occurred"
    : "Internal Server Error";

  const message = sanitizeErrorMessage(rawMessage);

  res.status(status).json({
    error: message,
    ...(config.nodeEnv !== "production" && err.stack ? { stack: err.stack } : {}),
  });
}
