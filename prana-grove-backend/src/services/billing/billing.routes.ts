import { Router } from 'express';
import express from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import * as ctrl from './billing.controller';

const router = Router();

// Public
router.get('/plans', ctrl.listPlans);

// Stripe webhook — raw body required
router.post(
  '/payments/webhook',
  express.raw({ type: 'application/json' }),
  ctrl.stripeWebhook
);

// Authenticated
router.get('/subscriptions/me', authenticate, ctrl.getActiveSubscription);
router.post('/subscriptions', authenticate, ctrl.subscribe);
router.delete('/subscriptions', authenticate, ctrl.cancelSubscription);
router.post('/payments/checkout', authenticate, ctrl.createCheckout);
router.get('/payments/history', authenticate, ctrl.getPaymentHistory);

// Host
router.post('/payouts', authenticate, requireRole('host'), ctrl.requestPayout);
router.get('/payouts', authenticate, requireRole('host', 'admin'), ctrl.listPayouts);

// Admin only
router.post('/payments/:paymentId/refund', authenticate, requireRole('admin'), ctrl.issueRefund);
router.post('/payouts/process', authenticate, requireRole('admin'), ctrl.triggerStripePayouts);

export default router;
