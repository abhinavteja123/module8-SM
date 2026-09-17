import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { workspaceOptionsForUser } from '../lib/permissions.js';

// Only renders for a person holding roles that span 2+ distinct workspaces
// (e.g. faculty + faculty_coordinator) — a single-section user sees nothing.
export function RoleSwitcher() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const options = workspaceOptionsForUser(user);
  if (options.length < 2) return null;
  // Longest-prefix match: /coordinator/fc-overview must win over the plain
  // /coordinator entry when both are candidates for the current URL.
  const current = [...options].sort((a, b) => b.value.length - a.value.length).find((option) => location.pathname.startsWith(option.value)) ?? options[0];
  return <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Workspace</span><select aria-label="Switch workspace" className="max-w-48 bg-transparent text-sm font-semibold text-slate-900 outline-none" value={current.value} onChange={(event) => navigate(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
