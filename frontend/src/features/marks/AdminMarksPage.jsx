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
const STATUS_OPTIONS = [
  ['applied', 'Waiting for approval'], ['pending_faculty', 'Waiting for faculty'], ['pending_crcs_approval', 'Waiting for approval'], ['under_review', 'Under review'], ['offered', 'Offer received'], ['crcs_approved', 'Approved'], ['active', 'Active internship'], ['rejected', 'Rejected'], ['revoked', 'Closed'], ['none', 'Not selected'],
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
    applied: { label: 'Waiting for approval', detail: 'CRCS decision needed', tone: 'pending' }, pending_faculty: { label: 'Waiting for faculty', detail: 'Faculty decision needed', tone: 'pending' }, pending_crcs_approval: { label: 'Waiting for approval', detail: 'CRCS decision needed', tone: 'pending' }, under_review: { label: 'Under review', detail: 'Application is being reviewed', tone: 'pending' }, offered: { label: 'Offer received', detail: 'Awaiting final CRCS approval', tone: 'pending' }, crcs_approved: { label: 'Approved', detail: 'Internship is approved', tone: 'approved' }, active: { label: 'Active internship', detail: 'CRCS approved · internship in progress', tone: 'approved' }, rejected: { label: 'Rejected', detail: 'Application was not approved', tone: 'rejected' }, revoked: { label: 'Closed', detail: 'Application is no longer active', tone: 'revoked' },
  };
  return statuses[status] ?? { label: status?.replaceAll('_', ' ') ?? '—', detail: '', tone: status };
}

function AttendanceCell({ attendance }) {
  if (!attendance) return <span className="text-slate-400">—</span>;
  if (!attendance.total_count) return <span className="text-xs text-slate-500">No weeks marked</span>;
  const tone = attendance.percentage >= 75 ? 'approved' : attendance.percentage >= 50 ? 'pending' : 'rejected';
  return <Badge status={tone}>{attendance.present_count}/{attendance.total_weeks} weeks ({attendance.percentage}%)</Badge>;
}

function HeaderFilter({ label, value, onChange, options, align = 'left' }) {
  return <div className={align === 'right' ? 'text-right' : ''}><p>{label}</p><Select aria-label={`Filter ${label}`} className="mt-2 min-w-[104px] text-[11px] normal-case tracking-normal" value={value} onChange={(event) => onChange(event.target.value)}><option value="">All</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</Select></div>;
}

function isMarkEntered(value) { return value !== null && value !== undefined && value !== ''; }
function attendanceMatches(attendance, filter) {
  if (!filter) return true;
  const percentage = attendance?.percentage;
  if (filter === 'not_recorded') return !attendance?.total_count;
  if (filter === 'recorded') return Boolean(attendance?.total_count);
  if (!attendance?.total_count) return false;
  if (filter === '75_plus') return percentage >= 75;
  if (filter === '50_to_74') return percentage >= 50 && percentage < 75;
  return percentage < 50;
}

export default function AdminMarksPage() {
  const { selectedCycle: cycle } = useCycle();
  const [schoolId, setSchoolId] = useState(''); const [departmentId, setDepartmentId] = useState(''); const [internship, setInternship] = useState(''); const [internshipStatus, setInternshipStatus] = useState(''); const [attendanceFilter, setAttendanceFilter] = useState(''); const [search, setSearch] = useState(''); const [markFilters, setMarkFilters] = useState({});
  const { data: users = [], isLoading: usersLoading } = useQuery({ queryKey: ['portal-users'], queryFn: () => api('/admin/users') });
  const { data: schools = [] } = useQuery({ queryKey: ['schools'], queryFn: () => api('/schools') });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api('/departments') });
  const { data: marks = [], isLoading: marksLoading } = useQuery({ queryKey: ['all-student-marks', cycle?.id], queryFn: () => api(`/marks?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const { data: attendanceData = {}, isLoading: attendanceLoading } = useQuery({ queryKey: ['cycle-attendance-summary', cycle?.id], queryFn: () => api(`/attendance?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const { data: research = [] } = useQuery({ queryKey: ['marks-research-applications', cycle?.id], queryFn: () => api(`/research/applications?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const { data: selfInternships = [] } = useQuery({ queryKey: ['marks-self-internships', cycle?.id], queryFn: () => api(`/self-internships?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const { data: opportunities = [] } = useQuery({ queryKey: ['marks-opportunity-applications', cycle?.id], queryFn: () => api(`/opportunities/applications?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const schoolById = Object.fromEntries(schools.map((school) => [school.id, school])); const departmentById = Object.fromEntries(departments.map((department) => [department.id, department])); const marksByStudent = Object.fromEntries(marks.map((mark) => [mark.student_id, mark])); const attendanceByStudent = attendanceData.attendance ?? {};
  const allRows = useMemo(() => users.filter((user) => user.roles?.some((role) => role.role === 'student')).map((student) => { const studentRole = student.roles.find((role) => role.role === 'student'); const department = departmentById[studentRole?.department_id]; const school = schoolById[department?.school_id]; return { student, department, school, mark: marksByStudent[student.id], attendance: attendanceByStudent[student.id] ?? null, internship: internshipFor(student.id, research, selfInternships, opportunities) }; }), [users, departmentById, schoolById, marksByStudent, attendanceByStudent, research, selfInternships, opportunities]);
  const rows = useMemo(() => allRows.filter((row) => { const rowStatus = row.internship.status ?? 'none'; const matchesMarks = MARK_COLUMNS.every(([key]) => !markFilters[key] || (markFilters[key] === 'entered' ? isMarkEntered(row.mark?.[key]) : !isMarkEntered(row.mark?.[key]))); return (!schoolId || row.school?.id === schoolId) && (!departmentId || row.department?.id === departmentId) && (!internship || row.internship.type === internship) && (!internshipStatus || rowStatus === internshipStatus) && attendanceMatches(row.attendance, attendanceFilter) && matchesMarks && (!search.trim() || `${row.student.full_name} ${row.student.email}`.toLowerCase().includes(search.toLowerCase())); }), [allRows, schoolId, departmentId, internship, internshipStatus, attendanceFilter, markFilters, search]);
  const visibleDepartments = schoolId ? departments.filter((department) => department.school_id === schoolId) : departments;
  const clearFilters = () => { setSchoolId(''); setDepartmentId(''); setInternship(''); setInternshipStatus(''); setAttendanceFilter(''); setSearch(''); setMarkFilters({}); };
  const filtersActive = Boolean(search || schoolId || departmentId || internship || internshipStatus || attendanceFilter || Object.values(markFilters).some(Boolean));
  return <div><PageHeader eyebrow="Academic overview" title="Student marks and internships" description="Use the Excel-style filters below each column to narrow this cycle’s student progress table." />
    <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-slate-950">Column filters</p><p className="mt-1 text-sm text-slate-600">Each column has its own filter. Combine them to find the exact students you need.</p></div><button type="button" onClick={clearFilters} disabled={!filtersActive} className="text-sm font-bold text-indigo-700 hover:underline disabled:text-slate-400">Clear filters</button></div><p className="mt-4 text-sm text-slate-600"><span className="font-bold text-slate-900">{rows.length}</span> of {allRows.length} students shown {cycle?.name ? `for ${cycle.name}` : ''}</p></Card>
    {usersLoading || marksLoading || attendanceLoading ? <p className="mt-6 text-sm text-slate-500">Loading student records…</p> : !rows.length ? <div className="mt-6"><EmptyState title="No students match these filters" description="Try removing one or more filters to see students." /></div> : <Card className="mt-6 overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[1800px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4"><p>Student</p><Input aria-label="Filter student" className="mt-2 min-w-[180px] text-xs normal-case" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /></th><th className="px-4 py-4"><HeaderFilter label="School" value={schoolId} onChange={(value) => { setSchoolId(value); setDepartmentId(''); }} options={schools.map((school) => [school.id, school.name])} /></th><th className="px-4 py-4"><HeaderFilter label="Department" value={departmentId} onChange={setDepartmentId} options={visibleDepartments.map((department) => [department.id, department.name])} /></th><th className="px-4 py-4"><HeaderFilter label="Internship" value={internship} onChange={setInternship} options={[['research', 'Research'], ['crcs_opportunity', 'CRCS opportunity'], ['self_internship', 'Self-internship'], ['none', 'Not selected']]} /></th><th className="px-4 py-4"><HeaderFilter label="Status" value={internshipStatus} onChange={setInternshipStatus} options={STATUS_OPTIONS} /></th><th className="px-4 py-4"><HeaderFilter label="Attendance" value={attendanceFilter} onChange={setAttendanceFilter} options={[['recorded', 'Recorded'], ['not_recorded', 'Not recorded'], ['75_plus', '75% and above'], ['50_to_74', '50–74%'], ['below_50', 'Below 50%']]} /></th>{MARK_COLUMNS.map(([key, label]) => <th key={key} className="px-4 py-4 text-right"><HeaderFilter label={label} value={markFilters[key] ?? ''} onChange={(value) => setMarkFilters((current) => ({ ...current, [key]: value }))} options={[['entered', 'Score entered'], ['missing', 'No score']]} align="right" /></th>)}</tr></thead><tbody>{rows.map((row) => { const status = statusDetails(row.internship.status); return <tr key={row.student.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{row.student.full_name}</p><p className="text-xs text-slate-500">{row.student.email}</p></td><td className="px-4 py-4 text-slate-600">{row.school?.name ?? '—'}</td><td className="px-4 py-4 text-slate-600">{row.department?.name ?? '—'}</td><td className="px-4 py-4 font-medium text-slate-800">{row.internship.label}</td><td className="px-4 py-4">{row.internship.status ? <><Badge status={status.tone}>{status.label}</Badge>{status.detail && <p className="mt-1 text-xs text-slate-500">{status.detail}</p>}</> : '—'}</td><td className="px-4 py-4"><AttendanceCell attendance={row.attendance} /></td>{MARK_COLUMNS.map(([key]) => <td key={key} className="px-4 py-4 text-right font-semibold text-slate-800">{row.mark?.[key] ?? '—'}</td>)}</tr>; })}</tbody></table></div></Card>}
  </div>;
}
