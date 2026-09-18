import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, List, X } from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Button } from '../components/ui/button.jsx';
import { CycleSwitcher } from '../cycles/CycleSwitcher.jsx';
import { NotificationBell } from '../components/NotificationBell.jsx';
import { RoleSwitcher } from '../components/RoleSwitcher.jsx';
import ChangePasswordDialog from '../auth/ChangePasswordDialog.jsx';

export function Shell({ title, links, basePath }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const routeFor = (to) => (to === '/' ? basePath : `${basePath}${to}`);
  const navigation = (
    <nav className="space-y-4">
      {Object.entries(links.reduce((groups, link) => {
        const group = link.group ?? 'Workspace';
        groups[group] = [...(groups[group] ?? []), link];
        return groups;
      }, {})).map(([group, groupLinks]) => (
        <section key={group} aria-label={group}>
          {links.some((link) => link.group) && <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group}</p>}
          <div className="space-y-1">
            {groupLinks.map((link) => (
              <NavLink
                key={link.to}
                to={routeFor(link.to)}
                end={link.to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 ${isActive ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-800'}`}
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <Link to="/" className="border-b border-slate-100 px-6 py-6">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-900/20"><GraduationCap size={22} weight="light" /></span><span><span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">Internship workspace</span><span className="font-bold text-ink">{title}</span></span></div>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6"><p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Your workspace</p>{navigation}</div>
        <div className="shrink-0 border-t border-slate-100 bg-white p-4 shadow-[0_-8px_20px_rgba(15,23,42,0.03)]">
          <button type="button" className="mb-3 w-full rounded-xl bg-slate-50 px-3 py-2 text-left transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={() => setPasswordDialogOpen(true)} aria-label="Open account password settings"><p className="truncate text-sm font-semibold text-slate-800">{user?.full_name}</p><p className="truncate text-xs text-slate-500">{user?.email}</p><span className="mt-1 block text-xs font-bold text-indigo-700">Account settings</span></button>
          <Button variant="ghost" className="w-full justify-start text-left" onClick={logout}>Log out</Button>
        </div>
      </aside>

      <div className="min-w-0 lg:ml-72">
        <header className="sticky top-0 z-20 hidden items-center justify-end gap-3 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur lg:flex"><NotificationBell /><RoleSwitcher /><CycleSwitcher /></header>
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur lg:hidden">
          <Link to="/" className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white"><GraduationCap size={17} weight="light" /></span><span className="font-semibold text-ink">{title}</span></Link>
          <div className="flex items-center gap-2"><NotificationBell /><RoleSwitcher /><CycleSwitcher /><Button variant="secondary" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>{menuOpen ? <X size={16} /> : <List size={16} />}</Button></div>
        </header>
        {menuOpen && <div className="border-b border-slate-200 bg-white p-4 shadow-lg lg:hidden">{navigation}<div className="mt-4 border-t border-slate-100 pt-4"><button type="button" className="mb-2 w-full px-3 text-left text-sm font-semibold text-brand-700" onClick={() => { setMenuOpen(false); setPasswordDialogOpen(true); }}>{user?.full_name}</button><Button variant="ghost" className="w-full text-left" onClick={logout}>Log out</Button></div></div>}
        <main className="mx-auto max-w-7xl p-5 sm:p-8 lg:p-10">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
      {passwordDialogOpen && <ChangePasswordDialog onClose={() => setPasswordDialogOpen(false)} />}
    </div>
  );
}
