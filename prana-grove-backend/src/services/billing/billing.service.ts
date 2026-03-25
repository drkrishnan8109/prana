import Stripe from 'stripe';
import crypto from 'crypto';
import { query, queryOne } from '../../db';
import { AppError } from '../../middleware/errorHandler';
import { Plan, Subscription, Payment, Payout } from '../../types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function listPlans(): Promise<Plan[]> {
  return query<Plan>(`SELECT * FROM billing.plans WHERE is_active = TRUE ORDER BY price_monthly ASC`);
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function subscribe(userId: string, planSlug: string): Promise<Subscription> {
  const plan = await queryOne<Plan>(
    `SELECT * FROM billing.plans WHERE slug = $1 AND is_active = TRUE`,
    [planSlug]
  );
  if (!plan) throw new AppError(404, 'Plan not found');

  // Cancel existing active subscription
  const existing = await queryOne<Subscription>(
    `SELECT * FROM billing.subscriptions WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  if (existing) {
    if (existing.stripe_subscription_id) {
      await stripe.subscriptions.cancel(existing.stripe_subscription_id);
    }
    await query(
      `UPDATE billing.subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
      [existing.id]
    );
  }

  const [subscription] = await query<Subscription>(
    `INSERT INTO billing.subscriptions (user_id, plan_id, status)
     VALUES ($1, $2, 'active') RETURNING *`,
    [userId, plan.id]
  );
  return subscription;
}

export async function cancelSubscription(userId: string): Promise<Subscription> {
  const sub = await queryOne<Subscription>(
    `SELECT * FROM billing.subscriptions WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  if (!sub) throw new AppError(404, 'No active subscription');

  if (sub.stripe_subscription_id) {
    await stripe.subscriptions.cancel(sub.stripe_subscription_id);
  }

  const [updated] = await query<Subscription>(
    `UPDATE billing.subscriptions
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE id = $1 RETURNING *`,
    [sub.id]
  );
  return updated;
}

export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  return queryOne<Subscription>(
    `SELECT s.*, p.name AS plan_name, p.slug AS plan_slug, p.price_monthly, p.features
     FROM billing.subscriptions s
     JOIN billing.plans p ON p.id = s.plan_id
     WHERE s.user_id = $1 AND s.status = 'active'`,
    [userId]
  );
}

// ─── One-time course payments ─────────────────────────────────────────────────

export async function createCheckoutSession(
  userId: string,
  courseId: string,
  courseTitle: string,
  priceEuros: number
): Promise<{ clientSecret: string; paymentId: string }> {
  const idempotencyKey = `${userId}:${courseId}:${Math.floor(Date.now() / 3600000)}`; // 1-hour bucket

  const existing = await queryOne<Payment>(
    `SELECT * FROM billing.payments WHERE idempotency_key = $1 AND status = 'completed'`,
    [idempotencyKey]
  );
  if (existing) throw new AppError(409, 'Already purchased this course');

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(priceEuros * 100),
    currency: 'eur',
    metadata: { userId, courseId },
  }, { idempotencyKey });

  const [payment] = await query<Payment>(
    `INSERT INTO billing.payments
       (user_id, course_id, amount, currency, status, stripe_payment_intent_id, idempotency_key)
     VALUES ($1, $2, $3, 'EUR', 'pending', $4, $5) RETURNING *`,
    [userId, courseId, priceEuros, intent.id, idempotencyKey]
  );

  return { clientSecret: intent.client_secret!, paymentId: payment.id };
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    throw new AppError(400, 'Invalid Stripe webhook signature');
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    await query(
      `UPDATE billing.payments SET status = 'completed' WHERE stripe_payment_intent_id = $1`,
      [intent.id]
    );
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    await query(
      `UPDATE billing.payments SET status = 'failed', failure_reason = $1
       WHERE stripe_payment_intent_id = $2`,
      [intent.last_payment_error?.message ?? 'Unknown error', intent.id]
    );
  }
}

export async function getPaymentHistory(userId: string): Promise<Payment[]> {
  return query<Payment>(
    `SELECT p.*, c.title AS course_title
     FROM billing.payments p
     LEFT JOIN learning.courses c ON c.id = p.course_id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
}

export async function issueRefund(paymentId: string): Promise<Payment> {
  const payment = await queryOne<Payment>(
    `SELECT * FROM billing.payments WHERE id = $1`,
    [paymentId]
  );
  if (!payment) throw new AppError(404, 'Payment not found');
  if (payment.status !== 'completed') throw new AppError(400, 'Only completed payments can be refunded');

  if (payment.stripe_payment_intent_id) {
    await stripe.refunds.create({ payment_intent: payment.stripe_payment_intent_id });
  }

  const [updated] = await query<Payment>(
    `UPDATE billing.payments SET status = 'refunded' WHERE id = $1 RETURNING *`,
    [paymentId]
  );

  // Mark enrollment as refunded
  if (payment.course_id) {
    await query(
      `UPDATE learning.enrollments SET status = 'refunded'
       WHERE user_id = $1 AND course_id = $2`,
      [payment.user_id, payment.course_id]
    );
  }

  return updated;
}

// ─── Payouts ──────────────────────────────────────────────────────────────────

export async function requestPayout(
  hostId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<Payout> {
  const [{ host_commission }] = await query<{ host_commission: string }>(
    `SELECT commission_rate AS host_commission FROM identity.host_profiles WHERE user_id = $1`,
    [hostId]
  );
  const commissionRate = parseFloat(host_commission);

  // Sum completed payments for courses by this host in the period
  const [{ total }] = await query<{ total: string }>(
    `SELECT COALESCE(SUM(p.amount), 0) AS total
     FROM billing.payments p
     JOIN learning.courses c ON c.id = p.course_id
     WHERE c.host_id = $1
       AND p.status = 'completed'
       AND p.created_at BETWEEN $2 AND $3`,
    [hostId, periodStart, periodEnd]
  );

  const grossAmount = parseFloat(total);
  const hostAmount = parseFloat((grossAmount * commissionRate).toFixed(2));
  const platformFee = parseFloat((grossAmount - hostAmount).toFixed(2));

  const [payout] = await query<Payout>(
    `INSERT INTO billing.payouts
       (host_id, amount, commission_rate, platform_fee, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [hostId, hostAmount, commissionRate, platformFee, periodStart, periodEnd]
  );
  return payout;
}

export async function processStripePayouts(): Promise<void> {
  const pending = await query<Payout & { stripe_account_id: string }>(
    `SELECT po.*, hp.stripe_account_id
     FROM billing.payouts po
     JOIN identity.host_profiles hp ON hp.user_id = po.host_id
     WHERE po.status = 'pending' AND hp.stripe_account_id IS NOT NULL`
  );

  for (const payout of pending) {
    try {
      await query(
        `UPDATE billing.payouts SET status = 'processing' WHERE id = $1`,
        [payout.id]
      );
      const transfer = await stripe.transfers.create({
        amount: Math.round(payout.amount * 100),
        currency: 'eur',
        destination: payout.stripe_account_id,
      });
      await query(
        `UPDATE billing.payouts SET status = 'completed', stripe_payout_id = $1 WHERE id = $2`,
        [transfer.id, payout.id]
      );
    } catch (err) {
      await query(
        `UPDATE billing.payouts SET status = 'failed' WHERE id = $1`,
        [payout.id]
      );
    }
  }
}

export async function listPayouts(hostId?: string): Promise<Payout[]> {
  if (hostId) {
    return query<Payout>(
      `SELECT * FROM billing.payouts WHERE host_id = $1 ORDER BY created_at DESC`,
      [hostId]
    );
  }
  return query<Payout>(
    `SELECT po.*, u.full_name AS host_name
     FROM billing.payouts po
     JOIN identity.users u ON u.id = po.host_id
     ORDER BY po.created_at DESC`
  );
}
