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
