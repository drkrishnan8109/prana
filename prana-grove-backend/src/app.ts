import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import identityRoutes from './services/identity/identity.routes';
import learningRoutes from './services/learning/learning.routes';
import billingRoutes from './services/billing/billing.routes';
import adminRoutes from './services/admin/admin.routes';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL ?? '*', credentials: true }));

// Stripe webhook needs raw body — mount BEFORE express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', identityRoutes);
app.use('/api', learningRoutes);
app.use('/api', billingRoutes);
app.use('/api/admin', adminRoutes);

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start (skipped in serverless environments like Vercel) ───────────────────
if (process.env.VERCEL !== '1') {
  const PORT = parseInt(process.env.PORT ?? '4000', 10);
  app.listen(PORT, () => {
    console.log(`Prana Grove API running on http://localhost:${PORT}`);
  });
}

export default app;
