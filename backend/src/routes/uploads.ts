import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";

// Driver documents (license, ID card, vehicle photo) and avatars.
// Files land in ./uploads and are served statically; swap the storage
// engine for S3-compatible object storage when scaling beyond one VPS.

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(new HttpError(415, "Only JPEG/PNG/WebP images allowed"));
    cb(null, true);
  },
});

export const uploadsRouter = Router();

uploadsRouter.post("/", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) throw new HttpError(400, "No file provided");
  const base = `${req.protocol}://${req.get("host")}`;
  res.status(201).json({ url: `${base}/uploads/${req.file.filename}` });
});
