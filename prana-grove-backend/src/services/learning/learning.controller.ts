import { Request, Response, NextFunction } from 'express';
import * as svc from './learning.service';

export async function listCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const { level, host_id } = req.query;
    const courses = await svc.listCourses({
      level: level as string | undefined as any,
      hostId: host_id as string | undefined,
    });
    res.json(courses);
  } catch (err) { next(err); }
}

export async function getCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const course = await svc.getCourse(req.params.id);
    res.json(course);
  } catch (err) { next(err); }
}

export async function createCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, description, level, price, duration_weeks, emoji } = req.body;
    if (!title || !level || price === undefined) {
      res.status(400).json({ error: 'title, level, and price are required' });
      return;
    }
    const course = await svc.createCourse(req.user!.id, { title, description, level, price, duration_weeks, emoji });
    res.status(201).json(course);
  } catch (err) { next(err); }
}

export async function updateCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const course = await svc.updateCourse(req.params.id, req.user!.id, req.user!.role, req.body);
    res.json(course);
  } catch (err) { next(err); }
}

export async function enroll(req: Request, res: Response, next: NextFunction) {
  try {
    const { course_id } = req.body;
    if (!course_id) { res.status(400).json({ error: 'course_id required' }); return; }
    const enrollment = await svc.enroll(req.user!.id, course_id);
    res.status(201).json(enrollment);
  } catch (err) { next(err); }
}

export async function getMyEnrollments(req: Request, res: Response, next: NextFunction) {
  try {
    const enrollments = await svc.getMyEnrollments(req.user!.id);
    res.json(enrollments);
  } catch (err) { next(err); }
}

export async function updateProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const { progress_pct } = req.body;
    const enrollment = await svc.updateProgress(req.user!.id, req.params.courseId, Number(progress_pct));
    res.json(enrollment);
  } catch (err) { next(err); }
}

export async function submitReview(req: Request, res: Response, next: NextFunction) {
  try {
    const { rating, body } = req.body;
    if (!rating) { res.status(400).json({ error: 'rating required' }); return; }
    const review = await svc.submitReview(req.user!.id, req.params.courseId, Number(rating), body);
    res.status(201).json(review);
  } catch (err) { next(err); }
}

export async function getCourseReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const reviews = await svc.getCourseReviews(req.params.courseId);
    res.json(reviews);
  } catch (err) { next(err); }
}
