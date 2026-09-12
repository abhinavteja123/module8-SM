import jwt from 'jsonwebtoken';
import { supabase, unwrap } from '../db/client.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { id: payload.sub, roles: payload.roles, university_id: payload.university_id ?? null, isPlatformAdmin: !!payload.isPlatformAdmin };
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

// Vextra platform admin: not a role_enum value, not tied to a university. Can
// only list/create universities and their first CRCS Superadmin.
export function requirePlatformAdmin(req, res, next) {
  if (!req.user?.isPlatformAdmin) return res.status(403).json({ error: 'platform admin access required' });
  next();
}

// CRCS Superadmin is unrestricted. CRCS Coordinator access is explicitly
// granted per capability by the Superadmin; storing permissions without
// checking them would make the admin control panel ineffective.
export function requireCrcsPermission(permissionKey) {
  return async (req, res, next) => {
    const roles = req.user?.roles ?? [];
    if (roles.some((role) => role.role === 'crcs_superadmin')) return next();
    // This middleware is also attached to shared routes used by faculty and
    // scoped viewers; non-CRCS roles continue to the route's own authorization.
    if (!roles.some((role) => role.role === 'crcs_coordinator')) return next();
    try {
      const permission = unwrap(await supabase.from('crcs_coordinator_permissions')
        .select('granted').eq('coordinator_id', req.user.id).eq('permission_key', permissionKey).maybeSingle());
      if (!permission?.granted) return res.status(403).json({ error: `CRCS Coordinator permission required: ${permissionKey}` });
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };
}

export function scopeToDepartment(req) {
  const roles = req.user?.roles ?? [];
  if (roles.some((r) => r.role === 'crcs_superadmin')) {
    return { departmentIds: null, schoolIds: null, isSystemWide: true };
  }
  const deanSchools = roles.filter((r) => ['dean', 'school_office'].includes(r.role)).map((r) => r.school_id).filter(Boolean);
  if (deanSchools.length) {
    return { departmentIds: null, schoolIds: deanSchools, isSystemWide: false };
  }
  const deptIds = roles
    .filter((r) => ['hod', 'faculty_coordinator', 'faculty', 'student'].includes(r.role))
    .map((r) => r.department_id)
    .filter(Boolean);
  return { departmentIds: deptIds, schoolIds: null, isSystemWide: false };
}
