import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs/promises";
import { config } from "../config";

// Allowed extensions and corresponding MIME types for printing
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/pjpeg",
]);

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fs.mkdir(config.uploadDir, { recursive: true });
      cb(null, config.uploadDir);
    } catch (err) {
      cb(err as Error, config.uploadDir);
    }
  },
  filename: (_req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : ".bin";
    // Cryptographically secure unpredictable filename
    const randomKey = crypto.randomUUID();
    cb(null, `${randomKey}${safeExt}`);
  },
});

const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const err: any = new Error(`Unsupported file extension '${ext}'. Allowed: .pdf, .doc, .docx, .png, .jpg, .jpeg`);
    err.status = 400;
    return cb(err);
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    const err: any = new Error(`Unsupported file MIME type '${file.mimetype}'. Allowed documents and images only.`);
    err.status = 400;
    return cb(err);
  }

  cb(null, true);
};

export const documentUpload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize, // 25 MB
    files: 1,
  },
  fileFilter,
});
