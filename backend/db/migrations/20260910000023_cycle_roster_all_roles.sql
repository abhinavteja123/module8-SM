-- Cycle rosters can include the organisation roles that oversee a cycle, not
-- only students and faculty mentors.
ALTER TABLE cycle_participants
  DROP CONSTRAINT IF EXISTS cycle_participants_participant_type_check;

ALTER TABLE cycle_participants
  ADD CONSTRAINT cycle_participants_participant_type_check
  CHECK (participant_type IN ('student', 'faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office'));
