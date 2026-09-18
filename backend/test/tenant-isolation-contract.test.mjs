import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isSameUniversity } from '../src/lib/tenantScope.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFileSync(path.join(backendRoot, file), 'utf8');

// Regression guard for the audit's five confirmed cross-tenant leaks: each
// fixed file must still import and actually call the shared tenant-scope
// check, not just have it lying around unused. Source-text assertion, same
// convention as cycle-visibility-contract.test.mjs — cheapest thing that
// fails if one of these regresses back to a `return true` short-circuit.
for (const file of [
  'src/routes/marks.js',
  'src/routes/documents.js',
  'src/routes/oversight.js',
  'src/routes/mentorAllocations.js',
]) {
  assert.match(source(file), /from '\.\.\/lib\/tenantScope\.js'/, `${file} must import the tenant-scope helper`);
}
assert.match(source('src/routes/marks.js'), /isSameUniversity\(req, studentId\)/);
assert.match(source('src/routes/documents.js'), /isSameUniversity\(req, doc\.student_id\)/);
assert.match(source('src/routes/oversight.js'), /isSameUniversity\(req, targetId\)/);
assert.match(source('src/routes/mentorAllocations.js'), /studentUniversityById\[mapping\.student_id\] === req\.user\.university_id/);

// The shared config tables (report_templates/report_requirements/programme_documents)
// must stay tenant-scoped: every read filters by university_id, every insert
// stamps it.
const documents = source('src/routes/documents.js');
assert.match(documents, /report_templates'\)\.select\('\*'\)\.eq\('university_id', req\.user\.university_id\)/);
assert.match(documents, /report_requirements'\)\.select\('\*'\)\.eq\('is_active', true\)\.eq\('university_id', req\.user\.university_id\)/);
assert.match(documents, /programme_documents'\)\.select\('\*'\)\.eq\('is_active', true\)\.eq\('university_id', req\.user\.university_id\)/);
for (const table of ['report_templates', 'programme_documents', 'report_requirements']) {
  const inserts = documents.match(new RegExp(`from\\('${table}'\\)\\.insert\\(`, 'g')) ?? [];
  assert.ok(inserts.length > 0, `${table} should still have at least one insert site in documents.js`);
}
assert.match(documents, /university_id: req\.user\.university_id/, 'documents.js must stamp university_id on at least one insert');

const marks = source('src/routes/marks.js');
assert.match(marks, /report_requirements.*\.eq\('university_id', universityId\)/);

console.log('tenant isolation contract checks passed');
