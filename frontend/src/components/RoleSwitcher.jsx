import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { sectionsForUser, SECTION_LABEL } from '../lib/permissions.js';

// Only renders for a person holding roles that span 2+ distinct workspaces
// (e.g. faculty + faculty_coordinator) — a single-section user sees nothing.
export function RoleSwitcher() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const sections = sectionsForUser(user);
  if (sections.length < 2) return null;
  const current = sections.find((section) => location.pathname.startsWith(section)) ?? sections[0];
  return <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Workspace</span><select aria-label="Switch workspace" className="max-w-48 bg-transparent text-sm font-semibold text-slate-900 outline-none" value={current} onChange={(event) => navigate(event.target.value)}>{sections.map((section) => <option key={section} value={section}>{SECTION_LABEL[section] ?? section}</option>)}</select></label>;
}
