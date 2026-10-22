import { validationResult } from 'express-validator';
import { ApiError } from '../utils/apiError.js';

/**
 * validate([body('email').isEmail(), ...]) — runs every chain, then
 * rejects with 422 { success:false, message, errors:[{field, message}] }.
 */
export function validate(chains) {
  return async (req, res, next) => {
    try {
      for (const chain of chains) {
        await chain.run(req);
      }
      const result = validationResult(req);
      if (result.isEmpty()) return next();

      const seen = new Set();
      const errors = [];
      for (const e of result.array()) {
        const field = e.path ?? e.param ?? 'unknown';
        if (seen.has(field)) continue;
        seen.add(field);
        errors.push({ field, message: e.msg });
      }
      return next(ApiError.unprocessable('Validation failed', errors));
    } catch (err) {
      return next(err);
    }
  };
}

export default validate;
