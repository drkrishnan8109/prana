import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import * as ctrl from './learning.controller';

const router = Router();

// Public
router.get('/courses', ctrl.listCourses);
router.get('/courses/:id', ctrl.getCourse);
router.get('/courses/:courseId/reviews', ctrl.getCourseReviews);

// Authenticated students
router.post('/enrollments', authenticate, ctrl.enroll);
router.get('/enrollments/me', authenticate, ctrl.getMyEnrollments);
router.patch('/enrollments/:courseId/progress', authenticate, ctrl.updateProgress);
router.post('/courses/:courseId/reviews', authenticate, ctrl.submitReview);

// Hosts / Admin
router.post('/courses', authenticate, requireRole('host', 'admin'), ctrl.createCourse);
router.patch('/courses/:id', authenticate, requireRole('host', 'admin'), ctrl.updateCourse);

export default router;
