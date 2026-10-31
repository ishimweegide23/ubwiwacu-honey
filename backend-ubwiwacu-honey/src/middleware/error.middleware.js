import multer from 'multer';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// PostgreSQL error codes we translate into client errors.
const PG_ERRORS = {
  '23505': { status: 409, message: 'A record with these details already exists' },
  '23503': { status: 409, message: 'Related record not found or still in use' },
  '23514': { status: 400, message: 'A value is outside the allowed range' },
  '23502': { status: 400, message: 'A required value is missing' },
  '22P02': { status: 400, message: 'Invalid identifier or value format' },
  '22001': { status: 400, message: 'A value is too long' },
  '22003': { status: 400, message: 'A number is out of range' },
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = 500;
  let message = 'Internal server error';
  let errors;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? `Image is too large (max ${env.MAX_UPLOAD_MB} MB)` : err.message;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (err?.code && PG_ERRORS[err.code]) {
    ({ status, message } = PG_ERRORS[err.code]);
    if (!env.isProd && err.constraint) errors = [{ constraint: err.constraint }];
  } else if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    status = 401;
    message = 'Invalid or expired token';
  }

  if (status >= 500) {
    logger.error(err.message || 'Unhandled error', {
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
    });
  } else {
    logger.warn(`${status} ${req.method} ${req.originalUrl} - ${message}`);
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;
  if (!env.isProd && status >= 500 && err?.message) body.debug = err.message;

  if (res.headersSent) return;
  res.status(status).json(body);
}

export default errorHandler;
