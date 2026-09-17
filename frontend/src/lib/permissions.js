export function hasRole(user, ...roles) {
  return !!user?.roles?.some((r) => roles.includes(r.role));
}

const ROLE_PRIORITY = [
  'crcs_superadmin', 'crcs_coordinator',
  'hod', 'dean', 'faculty_coordinator', 'school_office',
  'faculty', 'student',
];

export function primaryRole(user) {
  const roles = user?.roles?.map((r) => r.role) ?? [];
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? roles[0] ?? null;
}

// Which top-level section (route prefix) each role lands in. A person
// holding roles that map to 2+ distinct sections (e.g. faculty +
// faculty_coordinator) gets a workspace switcher; router.jsx's RoleHome
// uses this same mapping for the initial post-login redirect.
export const ROLE_SECTION = {
  student: '/student',
  faculty: '/faculty',
  faculty_coordinator: '/coordinator',
  hod: '/coordinator',
  dean: '/coordinator',
  school_office: '/coordinator',
  crcs_coordinator: '/crcs',
  crcs_superadmin: '/crcs',
};

export const SECTION_LABEL = {
  '/student': 'Student workspace',
  '/faculty': 'Faculty workspace',
  '/coordinator': 'Coordinator workspace',
  '/crcs': 'CRCS workspace',
};

export function sectionsForUser(user) {
  return [...new Set((user?.roles ?? []).map((r) => ROLE_SECTION[r.role]).filter(Boolean))];
}

// hod/dean/school_office and faculty_coordinator all share the /coordinator
// URL, so sectionsForUser collapses them into one entry — but a Faculty
// Coordinator who is ALSO an HOD/Dean/School Office holder has a genuinely
// separate dashboard (their own mapped-faculty view) that CoordinatorLanding
// otherwise hides entirely, since hod/dean/school_office always outranks
// faculty_coordinator there. Surface that combination as its own switchable entry.
// "Coordinator workspace" reads as a near-duplicate of "Faculty Coordinator
// workspace" once both are on screen — name the org role explicitly instead.
const ORG_ROLE_LABEL = { hod: 'HOD workspace', dean: 'Dean workspace', school_office: 'School Office workspace' };

export function workspaceOptionsForUser(user) {
  const roles = (user?.roles ?? []).map((r) => r.role);
  const orgRole = ['hod', 'dean', 'school_office'].find((role) => roles.includes(role));
  const options = sectionsForUser(user).map((path) => ({ value: path, label: (path === '/coordinator' && orgRole ? ORG_ROLE_LABEL[orgRole] : SECTION_LABEL[path]) ?? path }));
  const hasCoordinatorRole = roles.includes('faculty_coordinator');
  if (orgRole && hasCoordinatorRole) {
    options.push({ value: '/coordinator/fc-overview', label: 'Faculty Coordinator workspace' });
  }
  return options;
}
