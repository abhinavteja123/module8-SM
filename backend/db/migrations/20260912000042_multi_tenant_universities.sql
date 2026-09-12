-- Multi-tenant upgrade: a Vextra platform admin can create multiple universities,
-- each with its own isolated CRCS Superadmin. Tenancy is anchored on `universities`
-- and denormalized only onto the tables queried unscoped today (users, schools,
-- internship_cycles); everything else stays scoped transitively through
-- school_id/department_id, which can never cross a tenant boundary (UUIDs).

CREATE TABLE universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO universities (name, code) VALUES ('SRM AP', 'SRMAP');

-- ============ USERS ============
ALTER TABLE users
  ADD COLUMN university_id UUID REFERENCES universities(id),
  ADD COLUMN is_platform_admin BOOLEAN NOT NULL DEFAULT false;

UPDATE users SET university_id = (SELECT id FROM universities WHERE code = 'SRMAP');

ALTER TABLE users ADD CONSTRAINT users_university_scope_chk CHECK (
  (is_platform_admin AND university_id IS NULL) OR (NOT is_platform_admin AND university_id IS NOT NULL)
);

-- ============ SCHOOLS ============
ALTER TABLE schools ADD COLUMN university_id UUID REFERENCES universities(id);
UPDATE schools SET university_id = (SELECT id FROM universities WHERE code = 'SRMAP');
ALTER TABLE schools ALTER COLUMN university_id SET NOT NULL;
ALTER TABLE schools DROP CONSTRAINT schools_name_key;
ALTER TABLE schools DROP CONSTRAINT schools_code_key;
ALTER TABLE schools ADD CONSTRAINT schools_university_name_key UNIQUE (university_id, name);
ALTER TABLE schools ADD CONSTRAINT schools_university_code_key UNIQUE (university_id, code);

-- ============ DEPARTMENTS ============
-- school_id already scopes the tenant; code only needs to be unique within a school.
ALTER TABLE departments DROP CONSTRAINT departments_code_key;
ALTER TABLE departments ADD CONSTRAINT departments_school_code_key UNIQUE (school_id, code);

-- ============ INTERNSHIP CYCLES ============
ALTER TABLE internship_cycles ADD COLUMN university_id UUID REFERENCES universities(id);
UPDATE internship_cycles SET university_id = (SELECT id FROM universities WHERE code = 'SRMAP');
ALTER TABLE internship_cycles ALTER COLUMN university_id SET NOT NULL;

-- ============ STUDENTS ============
-- ponytail: roll_number uniqueness moves to an app-layer check scoped by
-- students -> users.university_id (see lib/users.js). A single-table UNIQUE/index
-- can't reference another table's column, and denormalizing university_id onto
-- students just for this constraint is more than the problem needs. Upgrade to a
-- generated column + unique index if bulk imports start racing.
DROP INDEX IF EXISTS students_roll_number_normalized_unique_idx;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_roll_number_key;
