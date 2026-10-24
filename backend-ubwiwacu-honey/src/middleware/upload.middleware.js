import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, env.UPLOAD_STORAGE),
  filename: (req, file, cb) => {
    const ext = ALLOWED[file.mimetype] || path.extname(file.originalname).toLowerCase();
    const prefix = String(req.params.id || 'product').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36);
    cb(null, `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED[file.mimetype]) {
    return cb(ApiError.badRequest('Only JPG, PNG or WEBP images are allowed'));
  }
  return cb(null, true);
};

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

/** Accepts a single file in form field "image". */
export const uploadProductImage = (req, res, next) => {
  uploader.single('image')(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next(ApiError.badRequest('No image uploaded (use form field "image")'));
    return next();
  });
};

export default uploadProductImage;
