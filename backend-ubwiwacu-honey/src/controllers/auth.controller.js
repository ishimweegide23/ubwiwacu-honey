import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const data = await authService.login({ email, password }, req.actor);
  res.json({ success: true, data, message: 'Login successful' });
});

export const me = asyncHandler(async (req, res) => {
  const data = await authService.getMe(req.user.id);
  res.json({ success: true, data });
});

export const verifyLogin = asyncHandler(async (req, res) => {
  const data = await authService.verifyLoginCode(req.body, req.actor);
  res.json({ success: true, data, message: 'Login successful' });
});

export const resendLogin = asyncHandler(async (req, res) => {
  const data = await authService.resendLoginCode(req.body);
  res.json({ success: true, data, message: 'A new code was sent' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const data = await authService.forgotPassword(req.body, req.actor);
  res.json({ success: true, data, message: 'If that email belongs to a staff account, a code was sent to it' });
});

export const verifyReset = asyncHandler(async (req, res) => {
  const data = await authService.verifyResetCode(req.body);
  res.json({ success: true, data });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const data = await authService.resetPassword(req.body, req.actor);
  res.json({ success: true, data, message: 'Password updated. Sign in with your new password.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const data = await authService.changePassword(req.user.id, req.body, req.actor);
  res.json({ success: true, data, message: 'Password changed' });
});

export const setTwoFactor = asyncHandler(async (req, res) => {
  const data = await authService.setTwoFactor(req.user.id, req.body, req.actor);
  res.json({ success: true, data, message: data.two_factor_enabled ? 'Two-step sign-in is on' : 'Two-step sign-in is off' });
});
