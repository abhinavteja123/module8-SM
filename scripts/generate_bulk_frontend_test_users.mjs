import * as XLSX from '../backend/node_modules/xlsx/xlsx.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const columns = ['email', 'password', 'full_name', 'phone', 'role', 'department_code', 'school_code', 'roll_number', 'batch_year', 'mentorship_scope'];
const password = 'PortalTest123!';
const rows = [];
const firstNames = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Arjun', 'Anaya', 'Vihaan', 'Isha', 'Rohan', 'Nisha'];
const lastNames = ['Sharma', 'Reddy', 'Kumar', 'Patel', 'Gupta', 'Nair', 'Singh', 'Das', 'Verma', 'Rao'];
const nameFor = (index, prefix = '') => `${prefix}${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`.trim();
const phoneFor = (index) => String(8000000000 + index);

for (let index = 1; index <= 210; index += 1) {
  rows.push([
    `bulk-test-20260911-student${String(index).padStart(3, '0')}@example.edu`, password, nameFor(index), phoneFor(index), 'student', 'CSE', '',
    `CSETEST${String(260000 + index)}`, String(2025 + (index % 3)), '',
  ]);
}

for (let index = 1; index <= 25; index += 1) {
  rows.push([
    `bulk-test-20260911-faculty${String(index).padStart(2, '0')}@example.edu`, password, nameFor(index, 'Dr '), phoneFor(300 + index), 'faculty', 'CSE', '', '', '',
    index % 2 ? 'research' : 'crcs_self',
  ]);
}

for (let index = 1; index <= 8; index += 1) {
  rows.push([
    `bulk-test-20260911-coordinator${String(index).padStart(2, '0')}@example.edu`, password, nameFor(index, 'Coordinator '), phoneFor(400 + index), 'faculty_coordinator', 'CSE', '', '', '',
    index % 2 ? 'research' : 'crcs_self',
  ]);
}

rows.push(
  ['bulk-test-20260911-hod@example.edu', password, 'Test HOD CSE', phoneFor(501), 'hod', 'CSE', '', '', '', ''],
  ['bulk-test-20260911-dean@example.edu', password, 'Test Dean SEAS', phoneFor(502), 'dean', '', 'SEAS', '', '', ''],
  ['bulk-test-20260911-school-office@example.edu', password, 'Test School Office SEAS', phoneFor(503), 'school_office', '', 'SEAS', '', '', ''],
  ['bulk-test-20260911-crcs-coordinator01@example.edu', password, 'Test CRCS Coordinator One', phoneFor(504), 'crcs_coordinator', '', '', '', '', ''],
  ['bulk-test-20260911-crcs-coordinator02@example.edu', password, 'Test CRCS Coordinator Two', phoneFor(505), 'crcs_coordinator', '', '', '', '', ''],
  ['bulk-test-20260911-crcs-coordinator03@example.edu', password, 'Test CRCS Coordinator Three', phoneFor(506), 'crcs_coordinator', '', '', '', '', ''],
  ['bulk-test-20260911-superadmin@example.edu', password, 'Test CRCS Superadmin', phoneFor(507), 'crcs_superadmin', '', '', '', '', ''],
);

const guidance = [
  ['Test workbook summary', 'Value'],
  ['Total accounts', String(rows.length)],
  ['Students', '210'],
  ['Faculty mentors', '25'],
  ['Faculty coordinators', '8'],
  ['HOD / Dean / School Office', '1 / 1 / 1'],
  ['CRCS coordinators / Superadmin', '3 / 1'],
  ['Shared test password', password],
  ['Department and school codes', 'CSE and SEAS — they must exist before uploading.'],
  ['Important', 'Use only for local/frontend testing. It creates real accounts in the connected database.'],
];

function makeSheet(data, widths) {
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = widths.map((width) => ({ wch: width }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: widths.length - 1, r: data.length - 1 } }) };
  return sheet;
}

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, makeSheet([columns, ...rows], [48, 20, 28, 16, 22, 20, 18, 20, 14, 20]), 'People import');
XLSX.utils.book_append_sheet(workbook, makeSheet(guidance, [34, 92]), 'Test data guide');

const outputPath = resolve('test-data/bulk-frontend-test-users-250.xlsx');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
console.log(JSON.stringify({ outputPath, records: rows.length }));
