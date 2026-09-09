-- One notification per alert/cycle/recipient/day prevents the hourly alert
-- sweep from flooding CRCS while preserving a durable delivery record.
CREATE TABLE IF NOT EXISTS analytics_alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  observed_count INTEGER NOT NULL CHECK (observed_count > 0),
  observed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, alert_key, recipient_id, observed_on)
);

CREATE INDEX IF NOT EXISTS analytics_alert_deliveries_cycle_day_idx
  ON analytics_alert_deliveries (cycle_id, observed_on DESC);
