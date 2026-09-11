import * as XLSX from '../backend/node_modules/xlsx/xlsx.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const columns = [
  'email', 'password', 'full_name', 'phone', 'role', 'department_code',
  'school_code', 'roll_number', 'batch_year', 'mentorship_scope',
];

const examples = [
  ['asha.student@example.edu', 'ChangeMe123!', 'Asha Student', '9876543210', 'student', 'CSE', '', 'CSE2026001', '2026', ''],
  ['ravi.mentor@example.edu', 'ChangeMe123!', 'Ravi Mentor', '9876543211', 'faculty', 'CSE', '', '', '', 'research'],
  ['priya.coordinator@example.edu', 'ChangeMe123!', 'Priya Coordinator', '9876543212', 'faculty_coordinator', 'CSE', '', '', '', 'crcs_self'],
  ['uma.hod@example.edu', 'ChangeMe123!', 'Uma HOD', '9876543213', 'hod', 'CSE', '', '', '', ''],
  ['nair.dean@example.edu', 'ChangeMe123!', 'Dr Nair', '9876543214', 'dean', '', 'SEAS', '', '', ''],
  ['office.seas@example.edu', 'ChangeMe123!', 'SEAS School Office', '9876543215', 'school_office', '', 'SEAS', '', '', ''],
  ['crcs.coordinator@example.edu', 'ChangeMe123!', 'CRCS Coordinator', '9876543216', 'crcs_coordinator', '', '', '', '', ''],
  ['crcs.admin@example.edu', 'ChangeMe123!', 'CRCS Superadmin', '9876543217', 'crcs_superadmin', '', '', '', '', ''],
];

const guidance = [
  ['Field', 'Required', 'Use'],
  ['email', 'Yes', 'Unique email address. It becomes the sign-in name.'],
  ['password', 'Yes unless temporary passwords are requested', 'At least 8 characters. Do not use the example passwords in a real upload.'],
  ['full_name', 'Yes', 'Person’s display name.'],
  ['phone', 'No', 'Phone number, stored as text.'],
  ['role', 'Yes', 'student, faculty, faculty_coordinator, hod, dean, school_office, crcs_coordinator, or crcs_superadmin.'],
  ['department_code', 'Student/faculty/coordinator/HOD', 'Must exactly match an existing department code, for example CSE.'],
  ['school_code', 'Dean/school office', 'Must exactly match an existing school code, for example SEAS.'],
  ['roll_number', 'Student only', 'Unique student registration number.'],
  ['batch_year', 'Student only', 'Four-digit year from 2000 to 2100.'],
  ['mentorship_scope', 'Faculty/coordinator only', 'research or crcs_self. Leave blank for other roles.'],
  ['', '', 'The importer reads only the first “People import” sheet. Delete its blank rows only if desired; do not rename its header row.'],
];

function worksheet(rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map((width) => ({ wch: width }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: widths.length - 1, r: Math.max(rows.length - 1, 1) } }) };
  return sheet;
}

// Keep this sheet header-only. The upload parser intentionally ignores truly
// empty rows, whereas pre-created blank cells would be reported as 50 invalid
// people during an accidental test upload.
const importSheet = worksheet([columns], [32, 24, 28, 18, 22, 20, 18, 22, 14, 20]);
const examplesSheet = worksheet([columns, ...examples], [32, 24, 28, 18, 22, 20, 18, 22, 14, 20]);
const guidanceSheet = worksheet(guidance, [28, 38, 100]);

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, importSheet, 'People import');
XLSX.utils.book_append_sheet(workbook, examplesSheet, 'Examples - do not upload');
XLSX.utils.book_append_sheet(workbook, guidanceSheet, 'Field reference');

const outputPath = resolve('frontend/public/templates/internship-portal-people-import-template.xlsx');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
console.log(outputPath);
