import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import * as ctrl from './admin.controller';

const router = Router();

router.use(authenticate, requireRole('admin'));

router.get('/dashboard', ctrl.getDashboard);
router.get('/users', ctrl.listUsers);
router.patch('/users/:userId/status', ctrl.setUserStatus);
router.get('/courses', ctrl.listAllCourses);
router.patch('/courses/:courseId/status', ctrl.setCourseStatus);
router.get('/settings', ctrl.getSettings);
router.patch('/settings', ctrl.updateSetting);
router.post('/notifications', ctrl.dispatchNotification);
router.get('/audit-log', ctrl.getAuditLog);

export default router;
