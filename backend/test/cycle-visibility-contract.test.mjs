import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canViewCycleHistory, isCycleSetupUser, isInCycleScope, cycleAccessDecision } from '../src/lib/cycleVisibility.js';
import { readAllRows } from '../src/lib/directoryPage.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFileSync(path.join(backendRoot, file), 'utf8');

const role = (value, extra = {}) => ({ role: value, ...extra });

assert.equal(isCycleSetupUser({ roles: [role('crcs_superadmin')] }), true);
assert.equal(isCycleSetupUser({ roles: [role('crcs_coordinator')] }), false);
assert.equal(canViewCycleHistory({ roles: [role('hod')] }), true);
assert.equal(canViewCycleHistory({ roles: [role('faculty_coordinator')] }), false);
assert.equal(isInCycleScope({ isSystemWide: false, departmentIds: ['d1'], schoolIds: null }, { department_id: 'd1' }), true);
assert.equal(isInCycleScope({ isSystemWide: false, departmentIds: ['d1'], schoolIds: null }, { department_id: 'd2' }), false);
assert.equal(isInCycleScope({ isSystemWide: false, departmentIds: null, schoolIds: ['s1'] }, { school_id: 's1' }), true);

const admin = { roles: [role('crcs_superadmin')] };
const faculty = { roles: [role('faculty')] };
const coordinator = { roles: [role('faculty_coordinator')] };
const hod = { roles: [role('hod')] };
assert.deepEqual(cycleAccessDecision({ user: admin, status: 'not_started', mode: 'setup', hasMembership: false }), { allowed: true });
assert.equal(cycleAccessDecision({ user: faculty, status: 'not_started', mode: 'read', hasMembership: true }).statusCode, 403);
assert.deepEqual(cycleAccessDecision({ user: faculty, status: 'open', mode: 'write', hasMembership: true }), { allowed: true });
assert.equal(cycleAccessDecision({ user: faculty, status: 'open', mode: 'read', hasMembership: false }).statusCode, 403);
assert.deepEqual(cycleAccessDecision({ user: hod, status: 'closed', mode: 'read', hasMembership: true }), { allowed: true });
assert.equal(cycleAccessDecision({ user: coordinator, status: 'closed', mode: 'read', hasMembership: true }).statusCode, 410);
assert.equal(cycleAccessDecision({ user: hod, status: 'closed', mode: 'write', hasMembership: true }).statusCode, 409);

const sixThousandOne = Array.from({ length: 6001 }, (_, index) => ({ id: index + 1 }));
const paged = await readAllRows(() => ({
  range(start, end) { return Promise.resolve({ data: sixThousandOne.slice(start, end + 1), error: null }); },
}));
assert.equal(paged.length, 6001, 'directory pagination must not silently stop at PostgREST default limits');

const oversight = source('src/routes/oversight.js');
assert.match(oversight, /oversight\/activity/);
assert.match(oversight, /mode: 'read'/);
assert.match(oversight, /directoryPage\(/);
const auth = source('src/routes/auth.js');
assert.match(auth, /last_login_at/);

console.log('cycle visibility contract checks passed');
