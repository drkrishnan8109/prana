import { Request, Response, NextFunction } from 'express';
import * as svc from './admin.service';

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const [stats, revenueByMonth, roleBreakdown] = await Promise.all([
      svc.getDashboardStats(),
      svc.getRevenueByMonth(),
      svc.getUserRoleBreakdown(),
    ]);
    res.json({ stats, revenueByMonth, roleBreakdown });
  } catch (err) { next(err); }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await svc.listUsers(req.query.search as string | undefined);
    res.json(users);
  } catch (err) { next(err); }
}

export async function setUserStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.body;
    if (!status) { res.status(400).json({ error: 'status required' }); return; }
    const user = await svc.setUserStatus(req.user!.id, req.params.userId, status);
    res.json(user);
  } catch (err) { next(err); }
}

export async function listAllCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const courses = await svc.listAllCourses();
    res.json(courses);
  } catch (err) { next(err); }
}

export async function setCourseStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.body;
    if (!status) { res.status(400).json({ error: 'status required' }); return; }
    const course = await svc.setCourseStatus(req.user!.id, req.params.courseId, status);
    res.json(course);
  } catch (err) { next(err); }
}

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await svc.getSettings();
    res.json(settings);
  } catch (err) { next(err); }
}

export async function updateSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) { res.status(400).json({ error: 'key and value required' }); return; }
    const setting = await svc.updateSetting(req.user!.id, key, value);
    res.json(setting);
  } catch (err) { next(err); }
}

export async function dispatchNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const { target_role, subject, message } = req.body;
    if (!subject || !message) { res.status(400).json({ error: 'subject and message required' }); return; }
    const result = await svc.dispatchNotification(req.user!.id, target_role ?? null, subject, message);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await svc.getAuditLog(Number(req.query.limit ?? 50));
    res.json(logs);
  } catch (err) { next(err); }
}
