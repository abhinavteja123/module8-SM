import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { id: payload.sub, roles: payload.roles };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    const hasRole = req.user?.roles?.some((r) => allowed.includes(r.role));
    if (!hasRole) return res.status(403).json({ error: 'insufficient role' });
    next();
  };
}

export function scopeToDepartment(req) {
  const roles = req.user?.roles ?? [];
  if (roles.some((r) => r.role === 'crcs_superadmin')) {
    return { departmentIds: null, schoolIds: null, isSystemWide: true };
  }
  const deanSchools = roles.filter((r) => r.role === 'dean').map((r) => r.school_id).filter(Boolean);
  if (deanSchools.length) {
    return { departmentIds: null, schoolIds: deanSchools, isSystemWide: false };
  }
  const deptIds = roles
    .filter((r) => ['hod', 'faculty_coordinator', 'faculty', 'student'].includes(r.role))
    .map((r) => r.department_id)
    .filter(Boolean);
  return { departmentIds: deptIds, schoolIds: null, isSystemWide: false };
}
