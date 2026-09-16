import { supabase, unwrap } from '../db/client.js';

// Historical hardcoded values, kept as the fallback so a university with no
// portal_settings row (not yet created, or the migration just landed) behaves
// exactly as before.
const DEFAULTS = { max_students_per_project: 4, max_projects_per_faculty: 4, max_mentees_per_faculty: 5 };

export async function getPortalSettings(universityId) {
  if (!universityId) return DEFAULTS;
  const row = unwrap(await supabase.from('portal_settings').select('max_students_per_project,max_projects_per_faculty,max_mentees_per_faculty').eq('university_id', universityId).maybeSingle());
  return { ...DEFAULTS, ...row };
}
