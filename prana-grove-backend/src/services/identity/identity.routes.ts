import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import * as ctrl from './identity.controller';

const router = Router();

// Public
router.post('/auth/register', ctrl.register);
router.post('/auth/login', ctrl.login);
router.post('/auth/refresh', ctrl.refresh);

// Authenticated
router.post('/auth/logout', authenticate, ctrl.logout);
router.get('/users/me', authenticate, ctrl.getMe);
router.patch('/users/me', authenticate, ctrl.updateMe);
router.patch('/users/me/host-profile', authenticate, requireRole('host'), ctrl.updateMyHostProfile);

export default router;
