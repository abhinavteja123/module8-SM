-- Cycle-level instructions are shown to every enrolled participant and retained
-- with the cycle’s audit history.
ALTER TABLE internship_cycles ADD COLUMN IF NOT EXISTS batch_label TEXT;
ALTER TABLE internship_cycles ADD COLUMN IF NOT EXISTS guidelines TEXT;
