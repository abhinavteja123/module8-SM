import bcrypt from 'bcryptjs';
import { supabase, unwrap } from '../db/client.js';

const FACULTY_ROLES = new Set(['faculty', 'faculty_coordinator']);

/**
 * Creates the application user and the role-specific profile records without
 * relying on a Postgres RPC.  The production database is accessed through
 * Supabase's REST gateway, so keeping this workflow in Express makes a fresh
 * deployment usable even before optional helper functions are installed.
 */
export async function createPortalUser({ email, password, full_name, phone = null, cabin = null, roles, roll_number, batch_year, mentorship_scope = 'research', university_id = null }) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRollNumber = roll_number?.trim() || null;
  const studentRole = roles.find((role) => role.role === 'student');
  if (studentRole && normalizedRollNumber) {
    // ponytail: scoped by university via join, not a DB constraint — see migration 042.
    const existingStudent = unwrap(await supabase.from('students').select('id, users!inner(university_id)').ilike('roll_number', normalizedRollNumber).eq('users.university_id', university_id).maybeSingle());
    if (existingStudent) throw new Error('a student with this registration number already exists');
  }
  const password_hash = await bcrypt.hash(password, 10);
  let user;
  try {
    [user] = unwrap(await supabase.from('users').insert({ email: normalizedEmail, password_hash, full_name, phone, university_id }).select());
  } catch (error) {
    if (/unique|users_email_normalized_unique/i.test(error.message)) throw new Error('an account with this email address already exists');
    throw error;
  }

  try {
    const roleRows = roles.map((role) => ({
      user_id: user.id,
      role: role.role,
      department_id: role.department_id ?? null,
      school_id: role.school_id ?? null,
    }));
    unwrap(await supabase.from('user_roles').insert(roleRows));

    if (studentRole) {
      if (!studentRole.department_id) throw new Error('student role requires a department');
      unwrap(await supabase.from('students').insert({
        id: user.id,
        department_id: studentRole.department_id,
        roll_number: normalizedRollNumber || `STU-${user.id.slice(0, 8).toUpperCase()}`,
        batch_year: batch_year || new Date().getFullYear(),
      }));
    }

    const facultyRole = roles.find((role) => FACULTY_ROLES.has(role.role));
    if (facultyRole) {
      if (!facultyRole.department_id) throw new Error('faculty role requires a department');
      unwrap(await supabase.from('faculty').insert({
        id: user.id,
        department_id: facultyRole.department_id,
        designation: facultyRole.role === 'faculty_coordinator' ? 'Faculty Coordinator' : 'Faculty Mentor',
        cabin: cabin?.trim() || null,
        mentorship_scope,
      }));
    }

    return user;
  } catch (error) {
    await supabase.from('users').delete().eq('id', user.id);
    if (/unique|students_roll_number_normalized_unique/i.test(error.message)) throw new Error('a student with this registration number already exists');
    throw error;
  }
}

export async function replacePortalUserRoles(userId, roles) {
  unwrap(await supabase.from('user_roles').delete().eq('user_id', userId));
  if (roles.length) {
    unwrap(await supabase.from('user_roles').insert(roles.map((role) => ({
      user_id: userId,
      role: role.role,
      department_id: role.department_id ?? null,
      school_id: role.school_id ?? null,
    }))));
  }
  return roles;
}
