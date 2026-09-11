import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFileSync(path.join(backendRoot, file), 'utf8');

test('assessment classification is data-driven and migrated', () => {
  const marks = source('src/routes/marks.js');
  const migration = source('db/migrations/20260911000038_report_requirement_assessment_classification.sql');
  assert.match(migration, /is_assessed BOOLEAN NOT NULL DEFAULT true/);
  assert.match(marks, /item\.is_assessed/);
  assert.doesNotMatch(marks, /EXCLUDED_FROM_TOTAL/);
});

test('marks are cycle roster scoped and paginate without truncating a cycle', () => {
  const marks = source('src/routes/marks.js');
  assert.match(marks, /readAllRows/);
  assert.match(marks, /cycle_participants/);
  assert.match(marks, /page_size/);
  assert.match(marks, /mode: 'write'/);
  assert.match(marks, /currentMentoredEntityForCycle/);
});

test('attendance writes and reads bind the internship entity to the selected cycle', () => {
  const attendance = source('src/routes/attendance.js');
  assert.match(attendance, /cycle_id: z\.string\(\)\.uuid\(\)/);
  assert.match(attendance, /attendance entity is outside the selected cycle/);
  assert.match(attendance, /record_weekly_attendance/);
  assert.match(attendance, /mode: 'write'/);
});

test('configured report requirements expose explicit assessment classification', () => {
  const documents = source('src/routes/documents.js');
  assert.match(documents, /is_assessed: z\.boolean\(\)/);
  assert.match(documents, /is_assessed: value\.is_assessed/);
});
