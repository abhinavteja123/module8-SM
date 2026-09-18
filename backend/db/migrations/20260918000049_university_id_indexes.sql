-- users.university_id and internship_cycles.university_id were added by
-- migration 20260912000042 as plain columns (Postgres does not auto-index
-- a bare ADD COLUMN). schools.university_id already has index coverage via
-- its two composite UNIQUE constraints; these two tables never got the
-- equivalent. Every tenant-scoped query in the app filters on these
-- columns, so this becomes the top query-latency problem as university
-- and per-university headcount grow.

CREATE INDEX IF NOT EXISTS users_university_id_idx ON users(university_id);
CREATE INDEX IF NOT EXISTS internship_cycles_university_id_idx ON internship_cycles(university_id);
