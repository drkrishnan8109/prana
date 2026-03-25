import { Request, Response, NextFunction } from 'express';
import * as svc from './billing.service';

export async function listPlans(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listPlans()); } catch (err) { next(err); }
}

export async function subscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const { plan_slug } = req.body;
    if (!plan_slug) { res.status(400).json({ error: 'plan_slug required' }); return; }
    const sub = await svc.subscribe(req.user!.id, plan_slug);
    res.status(201).json(sub);
  } catch (err) { next(err); }
}

export async function cancelSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await svc.cancelSubscription(req.user!.id);
    res.json(sub);
  } catch (err) { next(err); }
}

export async function getActiveSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await svc.getActiveSubscription(req.user!.id);
    res.json(sub ?? { message: 'No active subscription' });
  } catch (err) { next(err); }
}

export async function createCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const { course_id, course_title, price } = req.body;
    if (!course_id || !course_title || price === undefined) {
      res.status(400).json({ error: 'course_id, course_title, and price required' });
      return;
    }
    const result = await svc.createCheckoutSession(req.user!.id, course_id, course_title, Number(price));
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function stripeWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const sig = req.headers['stripe-signature'] as string;
    await svc.handleStripeWebhook(req.body as Buffer, sig);
    res.json({ received: true });
  } catch (err) { next(err); }
}

export async function getPaymentHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const payments = await svc.getPaymentHistory(req.user!.id);
    res.json(payments);
  } catch (err) { next(err); }
}

export async function issueRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await svc.issueRefund(req.params.paymentId);
    res.json(payment);
  } catch (err) { next(err); }
}

export async function requestPayout(req: Request, res: Response, next: NextFunction) {
  try {
    const { period_start, period_end } = req.body;
    if (!period_start || !period_end) {
      res.status(400).json({ error: 'period_start and period_end required' });
      return;
    }
    const payout = await svc.requestPayout(req.user!.id, new Date(period_start), new Date(period_end));
    res.status(201).json(payout);
  } catch (err) { next(err); }
}

export async function listPayouts(req: Request, res: Response, next: NextFunction) {
  try {
    const hostId = req.user!.role === 'host' ? req.user!.id : undefined;
    const payouts = await svc.listPayouts(hostId);
    res.json(payouts);
  } catch (err) { next(err); }
}

export async function triggerStripePayouts(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.processStripePayouts();
    res.json({ message: 'Payout processing triggered' });
  } catch (err) { next(err); }
}
