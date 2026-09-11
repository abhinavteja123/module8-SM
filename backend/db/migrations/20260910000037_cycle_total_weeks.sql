-- Attendance weeks are fixed by the cycle's declared internship duration, not free-typed by faculty.
ALTER TABLE internship_cycles ADD COLUMN IF NOT EXISTS total_weeks INTEGER NOT NULL DEFAULT 16 CHECK (total_weeks > 0 AND total_weeks <= 52);
