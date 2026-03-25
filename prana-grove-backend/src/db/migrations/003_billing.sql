CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE IF NOT EXISTS billing.plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(100) NOT NULL,
  price_monthly   NUMERIC(8,2) NOT NULL DEFAULT 0,
  features        JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO billing.plans (slug, name, price_monthly, features) VALUES
  ('free', 'Free', 0, '{"free_classes_per_month": 1, "downloads": false, "retreat_stays": false, "one_on_one": false}'),
  ('grove_pass', 'Grove Pass', 29, '{"free_classes_per_month": -1, "downloads": true, "retreat_stays": false, "one_on_one": false}'),
  ('retreat_all_access', 'Retreat All-Access', 79, '{"free_classes_per_month": -1, "downloads": true, "retreat_stays": true, "one_on_one": true}')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing.subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  plan_id                   UUID NOT NULL REFERENCES billing.plans(id),
  status                    VARCHAR(20) NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','cancelled','past_due','trialing')),
  stripe_subscription_id    VARCHAR(100) UNIQUE,
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing.payments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES identity.users(id),
  course_id                   UUID REFERENCES learning.courses(id),
  subscription_id             UUID REFERENCES billing.subscriptions(id),
  amount                      NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  currency                    VARCHAR(3) NOT NULL DEFAULT 'EUR',
  status                      VARCHAR(20) NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','completed','failed','refunded')),
  stripe_payment_intent_id    VARCHAR(100) UNIQUE,
  idempotency_key             VARCHAR(255) UNIQUE,
  failure_reason              TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing.payouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id           UUID NOT NULL REFERENCES identity.users(id),
  amount            NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  commission_rate   NUMERIC(4,2) NOT NULL,
  platform_fee      NUMERIC(10,2) NOT NULL CHECK (platform_fee >= 0),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','completed','failed')),
  stripe_payout_id  VARCHAR(100),
  period_start      TIMESTAMPTZ,
  period_end        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON billing.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON billing.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON billing.payments(status);
CREATE INDEX IF NOT EXISTS idx_payouts_host ON billing.payouts(host_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON billing.payouts(status);
