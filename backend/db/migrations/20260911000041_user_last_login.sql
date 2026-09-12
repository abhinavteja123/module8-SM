-- Tracks whether/when a person last successfully signed in, for the
-- HOD/Dean/CRCS coordinator activity monitor. NULL means never logged in —
-- must render as "Never logged in", not coalesced to created_at.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
