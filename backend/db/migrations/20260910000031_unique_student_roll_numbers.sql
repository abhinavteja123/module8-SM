-- A student registration / roll number identifies one student, regardless of
-- casing or accidental surrounding whitespace.
UPDATE students
SET roll_number = btrim(roll_number)
WHERE roll_number <> btrim(roll_number);

CREATE UNIQUE INDEX IF NOT EXISTS students_roll_number_normalized_unique_idx
  ON students (lower(btrim(roll_number)));
