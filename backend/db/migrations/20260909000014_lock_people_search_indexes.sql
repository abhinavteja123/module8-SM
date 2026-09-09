-- Fast, bounded lock-picker searches for large portals.  The API always uses
-- an active-user filter, a text search, and LIMIT 20; these trigram indexes keep
-- name/email/roll-number matching responsive even beyond several thousand rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS users_active_full_name_trgm_idx
  ON users USING gin (full_name gin_trgm_ops)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS users_active_email_trgm_idx
  ON users USING gin (email gin_trgm_ops)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS students_roll_number_trgm_idx
  ON students USING gin (roll_number gin_trgm_ops);
