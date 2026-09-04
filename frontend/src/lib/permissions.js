export function hasRole(user, ...roles) {
  return !!user?.roles?.some((r) => roles.includes(r.role));
}

export function primaryRole(user) {
  return user?.roles?.[0]?.role ?? null;
}
