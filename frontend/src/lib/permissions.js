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
