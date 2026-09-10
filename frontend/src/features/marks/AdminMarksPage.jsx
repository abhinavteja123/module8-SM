import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

const MARK_COLUMNS = [
  ['weekly_report_score', 'Weekly'], ['mid_marks', 'Mid-term'], ['synopsis_marks', 'Synopsis'], ['thesis_marks', 'Final report'], ['ppt_marks', 'Presentation'], ['viva_marks', 'Viva'],
];

function internshipFor(studentId, research, selfInternships, opportunities) {
  const researchApp = research.find((item) => item.student_id === studentId);
  if (researchApp) return { type: 'research', label: 'Research', status: researchApp.status };
  const selfInternship = selfInternships.find((item) => item.student_id === studentId);
  if (selfInternship) return { type: 'self_internship', label: 'Self-internship', status: selfInternship.status };
  const opportunity = opportunities.find((item) => item.student_id === studentId);
  if (opportunity) return { type: 'crcs_opportunity', label: 'CRCS opportunity', status: opportunity.status };
  return { type: 'none', label: 'Not selected', status: null };
}

function statusDetails(status) {
  const statuses = {
    applied: { label: 'Waiting for approval', detail: 'CRCS decision needed', tone: 'pending' },
    pending_faculty: { label: 'Waiting for faculty', detail: 'Faculty decision needed', tone: 'pending' },
    pending_crcs_approval: { label: 'Waiting for approval', detail: 'CRCS decision needed', tone: 'pending' },
    under_review: { label: 'Under review', detail: 'Application is being reviewed', tone: 'pending' },
    offered: { label: 'Offer received', detail: 'Awaiting final CRCS approval', tone: 'pending' },
    crcs_approved: { label: 'Approved', detail: 'Internship is approved', tone: 'approved' },
    active: { label: 'Active internship', detail: 'CRCS approved · internship in progress', tone: 'approved' },
    rejected: { label: 'Rejected', detail: 'Application was not approved', tone: 'rejected' },
    revoked: { label: 'Closed', detail: 'Application is no longer active', tone: 'revoked' },
  };
  return statuses[status] ?? { label: status?.replaceAll('_', ' ') ?? '—', detail: '', tone: status };
}

export default function AdminMarksPage() {
  const { selectedCycle: cycle } = useCycle();
  const [schoolId, setSchoolId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [internship, setInternship] = useState('');
  const [search, setSearch] = useState('');
  const { data: users = [], isLoading: usersLoading } = useQuery({ queryKey: ['portal-users'], queryFn: () => api('/admin/users') });
  const { data: schools = [] } = useQuery({ queryKey: ['schools'], queryFn: () => api('/schools') });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api('/departments') });
  const { data: marks = [], isLoading: marksLoading } = useQuery({ queryKey: ['all-student-marks', cycle?.id], queryFn: () => api(`/marks?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const { data: research = [] } = useQuery({ queryKey: ['marks-research-applications', cycle?.id], queryFn: () => api(`/research/applications?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const { data: selfInternships = [] } = useQuery({ queryKey: ['marks-self-internships', cycle?.id], queryFn: () => api(`/self-internships?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const { data: opportunities = [] } = useQuery({ queryKey: ['marks-opportunity-applications', cycle?.id], queryFn: () => api(`/opportunities/applications?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const schoolById = Object.fromEntries(schools.map((school) => [school.id, school]));
  const departmentById = Object.fromEntries(departments.map((department) => [department.id, department]));
  const marksByStudent = Object.fromEntries(marks.map((mark) => [mark.student_id, mark]));
  const rows = useMemo(() => users.filter((user) => user.roles?.some((role) => role.role === 'student')).map((student) => {
    const studentRole = student.roles.find((role) => role.role === 'student');
    const department = departmentById[studentRole?.department_id];
    const school = schoolById[department?.school_id];
    return { student, department, school, mark: marksByStudent[student.id], internship: internshipFor(student.id, research, selfInternships, opportunities) };
  }).filter((row) => (!schoolId || row.school?.id === schoolId) && (!departmentId || row.department?.id === departmentId) && (!internship || row.internship.type === internship) && (!search.trim() || `${row.student.full_name} ${row.student.email}`.toLowerCase().includes(search.toLowerCase()))), [users, departments, schools, marks, research, selfInternships, opportunities, schoolId, departmentId, internship, search]);
  const visibleDepartments = schoolId ? departments.filter((department) => department.school_id === schoolId) : departments;
  const clearFilters = () => { setSchoolId(''); setDepartmentId(''); setInternship(''); setSearch(''); };
  return <div><PageHeader eyebrow="Academic overview" title="Student marks and internships" description="View all students in one place. Filter by school, department, or internship path to find the information you need." />
    <Card className="p-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><label className="text-sm font-semibold text-slate-800">Search student</label><Input className="mt-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /></div><div><label className="text-sm font-semibold text-slate-800">School</label><Select className="mt-2" value={schoolId} onChange={(event) => { setSchoolId(event.target.value); setDepartmentId(''); }}><option value="">All schools</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</Select></div><div><label className="text-sm font-semibold text-slate-800">Department</label><Select className="mt-2" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">All departments</option>{visibleDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></div><div><label className="text-sm font-semibold text-slate-800">Internship path</label><Select className="mt-2" value={internship} onChange={(event) => setInternship(event.target.value)}><option value="">All paths</option><option value="research">Research</option><option value="crcs_opportunity">CRCS opportunity</option><option value="self_internship">Self-internship</option><option value="none">Not selected</option></Select></div></div><div className="mt-4 flex items-center justify-between"><p className="text-sm text-slate-600"><span className="font-bold text-slate-900">{rows.length}</span> student{rows.length === 1 ? '' : 's'} shown {cycle?.name ? `for ${cycle.name}` : ''}</p><button type="button" onClick={clearFilters} className="text-sm font-bold text-indigo-700 hover:underline">Clear filters</button></div></Card>
    {usersLoading || marksLoading ? <p className="mt-6 text-sm text-slate-500">Loading student records…</p> : !rows.length ? <div className="mt-6"><EmptyState title="No students match these filters" description="Try removing one or more filters to see students." /></div> : <Card className="mt-6 overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[1250px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Student</th><th className="px-4 py-4">School</th><th className="px-4 py-4">Department</th><th className="px-4 py-4">Internship</th><th className="px-4 py-4">Status</th>{MARK_COLUMNS.map(([, label]) => <th key={label} className="px-4 py-4 text-right">{label}</th>)}</tr></thead><tbody>{rows.map((row) => { const status = statusDetails(row.internship.status); return <tr key={row.student.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{row.student.full_name}</p><p className="text-xs text-slate-500">{row.student.email}</p></td><td className="px-4 py-4 text-slate-600">{row.school?.name ?? '—'}</td><td className="px-4 py-4 text-slate-600">{row.department?.name ?? '—'}</td><td className="px-4 py-4 font-medium text-slate-800">{row.internship.label}</td><td className="px-4 py-4">{row.internship.status ? <><Badge status={status.tone}>{status.label}</Badge>{status.detail && <p className="mt-1 text-xs text-slate-500">{status.detail}</p>}</> : '—'}</td>{MARK_COLUMNS.map(([key]) => <td key={key} className="px-4 py-4 text-right font-semibold text-slate-800">{row.mark?.[key] ?? '—'}</td>)}</tr>; })}</tbody></table></div></Card>}
  </div>;
}
