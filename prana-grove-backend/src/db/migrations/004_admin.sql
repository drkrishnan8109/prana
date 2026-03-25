CREATE SCHEMA IF NOT EXISTS admin_schema;

CREATE TABLE IF NOT EXISTS admin_schema.platform_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES identity.users(id)
);

INSERT INTO admin_schema.platform_settings (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('allow_registrations', 'true'),
  ('email_notifications_enabled', 'true'),
  ('default_commission_rate', '0.70')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_schema.audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID NOT NULL REFERENCES identity.users(id),
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(50) NOT NULL,
  entity_id     UUID NOT NULL,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON admin_schema.audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON admin_schema.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_schema.audit_log(created_at DESC);
