import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Buildings, ChalkboardTeacher, Student, Certificate, WarningCircle } from '@phosphor-icons/react';
import { api } from '../../lib/api.js';
import { Badge } from '../../components/ui/badge.jsx';
import { Card } from '../../components/ui/card.jsx';
import { PageHeader, StatCard, EmptyState } from '../../components/ui/page.jsx';
import { SkeletonCard } from '../../components/ui/skeleton.jsx';
import { FacultyCoordinatorMapping } from '../admin/UserManagement.jsx';

const breadcrumb = [{ label: 'Home', to: '/coordinator' }, { label: 'Organisation Overview' }];

function listItem(index) {
  return { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, delay: Math.min(index * 0.04, 0.4) } };
}

function DepartmentOverview({ data, lastUpdated }) {
  return <div className="max-w-5xl space-y-6"><PageHeader eyebrow="Organisation overview" title={data.department.name} description={`${data.school?.name ?? 'School not configured'} · department code ${data.department.code}`} breadcrumb={breadcrumb} lastUpdated={lastUpdated} />
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Faculty mentors" value={data.totals.faculty} tone="indigo" icon={ChalkboardTeacher} /><StatCard label="Students" value={data.totals.students} tone="emerald" icon={Student} /><StatCard label="Faculty coordinators" value={data.totals.coordinators} tone="amber" icon={Certificate} /></div>
    <Card className="p-5"><h2 className="font-bold">Faculty mentors</h2><p className="form-help mt-1">Every faculty mentor in your department, their mentee load, and their mapped coordinator.</p>
      {!data.faculty.length ? <div className="mt-4"><EmptyState title="No faculty mentors yet" description="Faculty mentors added to your department will appear here." /></div> : <div className="mt-4 space-y-2">{data.faculty.map((faculty, i) => <motion.div key={faculty.id} {...listItem(i)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{faculty.full_name}</p><p className="truncate text-xs text-slate-500">{faculty.email}</p></div><div className="flex flex-wrap items-center gap-2 text-xs"><Badge status={faculty.mentorship_scope === 'crcs_self' ? 'approved' : 'pending'}>{faculty.mentorship_scope === 'crcs_self' ? 'CRCS & self-internship' : 'Research'}</Badge><span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{faculty.active_mentees} mentee{faculty.active_mentees === 1 ? '' : 's'}</span><span className="text-slate-500">{faculty.coordinator ? `Coordinator: ${faculty.coordinator.full_name}` : 'Unmapped'}</span></div></motion.div>)}</div>}
    </Card>
    <Card className="p-5"><h2 className="font-bold">Faculty coordinators</h2><p className="form-help mt-1">Coordinators in your department and how many faculty they supervise.</p>
      {!data.coordinators.length ? <div className="mt-4"><EmptyState title="No faculty coordinators yet" description="Faculty coordinators added to your department will appear here." /></div> : <div className="mt-4 space-y-2">{data.coordinators.map((coordinator, i) => <motion.div key={coordinator.id} {...listItem(i)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{coordinator.full_name}</p><p className="truncate text-xs text-slate-500">{coordinator.email}</p></div><Badge status="pending">{coordinator.assigned_faculty_count}/10 mapped</Badge></motion.div>)}</div>}
    </Card>
    <FacultyCoordinatorMapping />
  </div>;
}

function SchoolOverview({ data, lastUpdated }) {
  return <div className="max-w-5xl space-y-6"><PageHeader eyebrow="Organisation overview" title={data.school?.name ?? 'Your school'} description="One row per department in your school." breadcrumb={breadcrumb} lastUpdated={lastUpdated} />
    <div className="grid gap-4 sm:grid-cols-4"><StatCard label="Departments" value={data.totals.departments} tone="slate" icon={Buildings} /><StatCard label="Faculty" value={data.totals.faculty} tone="indigo" icon={ChalkboardTeacher} /><StatCard label="Students" value={data.totals.students} tone="emerald" icon={Student} /><StatCard label="Coordinators" value={data.totals.coordinators} tone="amber" icon={Certificate} /></div>
    <Card className="overflow-hidden p-0">
      {!data.departments.length ? <div className="p-6"><EmptyState title="No departments yet" description="Departments added to your school will appear here." /></div> : <div className="overflow-x-auto"><table className="min-w-[640px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Department</th><th className="px-4 py-4">HOD</th><th className="px-4 py-4 text-center">Faculty</th><th className="px-4 py-4 text-center">Students</th><th className="px-4 py-4 text-center">Coordinators</th></tr></thead><tbody>{data.departments.map((row) => <tr key={row.department.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{row.department.name}</p><p className="text-xs text-slate-500">{row.department.code}</p></td><td className="px-4 py-4 text-slate-700">{row.hod?.full_name ?? <span className="inline-flex items-center gap-1 text-amber-700"><WarningCircle size={13} weight="fill" />Vacant</span>}</td><td className="px-4 py-4 text-center font-semibold text-slate-700">{row.faculty_count}</td><td className="px-4 py-4 text-center font-semibold text-slate-700">{row.student_count}</td><td className="px-4 py-4 text-center font-semibold text-slate-700">{row.coordinator_count}</td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}

export default function OrgOverviewPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({ queryKey: ['oversight-overview'], queryFn: () => api('/oversight/overview') });
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString() : undefined;
  if (isLoading) return <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">{error.message}</div>;
  if (data.scope === 'department') return <DepartmentOverview data={data} lastUpdated={lastUpdated} />;
  return <SchoolOverview data={data} lastUpdated={lastUpdated} />;
}
