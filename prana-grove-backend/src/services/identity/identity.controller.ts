import { Request, Response, NextFunction } from 'express';
import * as svc from './identity.service';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, full_name, role } = req.body;
    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'email, password, and full_name are required' });
      return;
    }
    const result = await svc.register(email, password, full_name, role ?? 'student');
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    const result = await svc.login(email, password);
    res.json(result);
  } catch (err) { next(err); }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) { res.status(400).json({ error: 'refresh_token required' }); return; }
    const result = await svc.refreshAccessToken(refresh_token);
    res.json(result);
  } catch (err) { next(err); }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.logout(req.user!.id);
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await svc.getProfile(req.user!.id);
    res.json(profile);
  } catch (err) { next(err); }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const { full_name, avatar_url } = req.body;
    const user = await svc.updateProfile(req.user!.id, { full_name, avatar_url });
    res.json(user);
  } catch (err) { next(err); }
}

export async function updateMyHostProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { bio, stripe_account_id } = req.body;
    const profile = await svc.updateHostProfile(req.user!.id, { bio, stripe_account_id });
    res.json(profile);
  } catch (err) { next(err); }
}
