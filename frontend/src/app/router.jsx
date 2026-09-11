import { createBrowserRouter, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { primaryRole, hasRole } from '../lib/permissions.js';
import LoginPage from '../auth/LoginPage.jsx';
import StudentLayout from '../layouts/StudentLayout.jsx';
import FacultyLayout from '../layouts/FacultyLayout.jsx';
import CoordinatorLayout from '../layouts/CoordinatorLayout.jsx';
import CRCSLayout from '../layouts/CRCSLayout.jsx';

import TrackSelectionPage from '../features/track-selection/TrackSelectionPage.jsx';
import ProjectForm from '../features/research-internship/ProjectForm.jsx';
import ApplicationQueue from '../features/research-internship/ApplicationQueue.jsx';
import MentorReassignment from '../features/research-internship/MentorReassignment.jsx';
import ResearchDashboard from '../features/research-internship/ResearchDashboard.jsx';
import OpportunityListPage from '../features/crcs-opportunities/OpportunityListPage.jsx';
import MyOpportunityApplicationsPage from '../features/crcs-opportunities/MyOpportunityApplicationsPage.jsx';
import OpportunityManager from '../features/crcs-opportunities/OpportunityManager.jsx';
import SelfInternshipPage from '../features/self-internship/SelfInternshipPage.jsx';
import SelfInternshipApprovalsPage from '../features/self-internship/SelfInternshipApprovalsPage.jsx';
import DocumentsPage from '../features/documents/DocumentsPage.jsx';
import StudentProfilePage from '../features/student-profile/StudentProfilePage.jsx';
import FacultyProfilePage from '../features/faculty-profile/FacultyProfilePage.jsx';
import MyMentorDetailsPage from '../features/mentor-details/MyMentorDetailsPage.jsx';
import ReviewQueue from '../features/documents/ReviewQueue.jsx';
import ReportTemplateManager from '../features/documents/ReportTemplateManager.jsx';
import ReportDeadlineManager from '../features/documents/ReportDeadlineManager.jsx';
import MarksEntryForm from '../features/marks/MarksEntryForm.jsx';
import AdminMarksPage from '../features/marks/AdminMarksPage.jsx';
import MarksViewPage from '../features/marks/MarksViewPage.jsx';
import DepartmentAnalytics from '../features/analytics/DepartmentAnalytics.jsx';
import SchoolAnalytics from '../features/analytics/SchoolAnalytics.jsx';
import SystemAnalytics from '../features/analytics/SystemAnalytics.jsx';
import SuperadminOverview from '../features/analytics/SuperadminOverview.jsx';
import UserManagement from '../features/admin/UserManagement.jsx';
import AllPeoplePage from '../features/admin/AllPeoplePage.jsx';
import StudentRecordsPage from '../features/admin/StudentRecordsPage.jsx';
import ApprovalsHub from '../features/admin/ApprovalsHub.jsx';
import MentorAllocationsPage from '../features/mentor-allocations/MentorAllocationsPage.jsx';
import FacultyMenteesPage from '../features/mentor-allocations/FacultyMenteesPage.jsx';
import OrgOverviewPage from '../features/oversight/OrgOverviewPage.jsx';
import ActivityMonitorPage from '../features/oversight/ActivityMonitorPage.jsx';
import DirectMentorDashboard from '../features/mentor-allocations/DirectMentorDashboard.jsx';
import CycleSetupPage from '../features/cycles/CycleSetupPage.jsx';
import { useCycle } from '../cycles/CycleContext.jsx';
import { Card } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { EmptyState, PageHeader } from '../components/ui/page.jsx';

function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  const role = primaryRole(user);
  const map = {
    student: '/student',
    faculty: '/faculty',
    faculty_coordinator: '/coordinator',
    hod: '/coordinator',
    dean: '/coordinator',
    school_office: '/coordinator',
    crcs_coordinator: '/crcs',
    crcs_superadmin: '/crcs',
  };
  return <Navigate to={map[role] ?? '/login'} replace />;
}

function CoordinatorLanding() {
  const { user } = useAuth();
  if (user?.roles?.some((role) => ['hod', 'dean', 'school_office'].includes(role.role))) return <OrgOverviewPage />;
  return <DepartmentAnalytics />;
}

function CrcsLanding() {
  const { user } = useAuth();
  const isSuperadmin = user?.roles?.some((role) => role.role === 'crcs_superadmin');
  const { data, isLoading } = useQuery({ queryKey: ['crcs-my-permissions'], queryFn: () => api('/admin/crcs-coordinator-permissions/me'), enabled: !!user && !isSuperadmin, retry: false });
  if (isSuperadmin) return <SuperadminOverview />;
  if (isLoading) return <div className="loading-state">Opening your CRCS workspace…</div>;
  const permissions = data?.permissions ?? {};
  const tiles = [
    permissions.view_opportunities && { to: '/crcs/opportunities', label: 'Opportunities', detail: 'Post listings and review CRCS opportunity applications.' },
    permissions.view_research_approvals && { to: '/crcs/approvals', label: 'Approvals', detail: 'Review research and permitted approval queues.' },
    permissions.view_marks && { to: '/crcs/marks', label: 'Marks and attendance', detail: 'Check academic progress for the selected cycle.' },
    permissions.view_student_records && { to: '/crcs/student-records', label: 'Student records', detail: 'Search cycle-scoped student progress.' },
    permissions.view_analytics && { to: '/crcs/analytics', label: 'Programme analytics', detail: 'Open trusted metrics and drill-downs.' },
    permissions.manage_portal_locks && { to: '/crcs', label: 'Portal locks', detail: 'Lock controls are available from the CRCS overview.' },
  ].filter(Boolean);
  if (tiles.length) return <div className="max-w-5xl space-y-6"><PageHeader eyebrow="CRCS coordinator" title="Your authorised workspace" description="Open the areas granted to your account. Each page stays scoped to the selected internship cycle." /><div className="grid gap-4 md:grid-cols-2">{tiles.map((tile) => <Link key={tile.label} to={tile.to} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"><p className="font-bold text-slate-950">{tile.label}</p><p className="mt-1 text-sm leading-5 text-slate-600">{tile.detail}</p><p className="mt-4 text-sm font-bold text-indigo-700">Open</p></Link>)}</div></div>;
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Your CRCS Coordinator account does not have workspace permissions yet. Ask the CRCS Superadmin to grant access in Organisation & Users.</div>;
}

function FacultyLanding() {
  const { data: profile, isLoading } = useQuery({ queryKey: ['my-mentor-profile'], queryFn: () => api('/research/my-mentor-profile'), retry: false });
  if (isLoading) return <div className="loading-state">Opening your mentor dashboard…</div>;
  return profile?.mentorship_scope === 'crcs_self' ? <DirectMentorDashboard /> : <ProjectForm />;
}

function StudentLanding() {
  const { selectedCycle, selectedCycleId } = useCycle();
  const { data, isLoading } = useQuery({ queryKey: ['my-track-selection', selectedCycleId], queryFn: () => api(`/students/me/track-selection?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId, retry: false });
  const { data: applications = [] } = useQuery({ queryKey: ['my-all-applications', selectedCycleId], queryFn: () => api(`/students/me/applications?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const { data: profile } = useQuery({ queryKey: ['my-student-profile'], queryFn: () => api('/students/me/profile'), retry: false });
  if (!selectedCycleId) return <div className="max-w-3xl space-y-6"><PageHeader eyebrow="Student portal" title="No open cycle yet" description="Your profile remains available. Internship actions appear here after CRCS publishes a cycle and enrolls you." /><Link to="/student/profile"><Button variant="secondary">Open my profile</Button></Link></div>;
  if (isLoading) return <div className="loading-state">Opening your internship dashboard…</div>;
  const destinations = { research: '/student/research', crcs_opportunity: '/student/opportunities', self_internship: '/student/self-internship' };
  const selectedTrack = data?.selection?.track;
  const latest = applications[0];
  const next = destinations[selectedTrack] ?? '/student/preference';
  const trackLabel = { research: 'Research internship', crcs_opportunity: 'CRCS opportunity', self_internship: 'Self-internship' }[selectedTrack] ?? 'Choose a pathway';
  return <div className="max-w-5xl space-y-6"><PageHeader eyebrow={`Student workspace · ${selectedCycle.name}`} title={`Welcome${profile?.full_name ? `, ${profile.full_name}` : ''}`} description="Start with the action that moves your internship forward in this cycle." action={<Link to={next}><Button>{selectedTrack ? 'Open my pathway' : 'Choose internship pathway'}</Button></Link>} />
    <div className="grid gap-4 md:grid-cols-3"><Card className="p-5"><p className="text-sm font-semibold text-slate-600">Current pathway</p><p className="mt-2 text-xl font-bold text-slate-950">{trackLabel}</p><Badge className="mt-3" status={selectedTrack ? 'approved' : 'pending'}>{selectedTrack ? 'Selected' : 'Not selected'}</Badge></Card><Card className="p-5"><p className="text-sm font-semibold text-slate-600">Latest application</p><p className="mt-2 text-xl font-bold text-slate-950">{latest?.title ?? 'No application yet'}</p><p className="mt-2 text-sm text-slate-600">{latest?.status ? latest.status.replaceAll('_', ' ') : 'Apply after choosing a pathway.'}</p></Card><Card className="p-5"><p className="text-sm font-semibold text-slate-600">Profile readiness</p><p className="mt-2 text-xl font-bold text-slate-950">{profile?.roll_number ?? 'Roll number pending'}</p><p className="mt-2 text-sm text-slate-600">{profile?.department?.name ?? 'Department details are maintained by CRCS.'}</p></Card></div>
    <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-950">Next action</h2><p className="mt-1 text-sm text-slate-600">{selectedTrack ? 'Continue in your selected pathway, then use Documents and Marks from the sidebar after approval.' : 'Choose your internship pathway to unlock the right application workspace.'}</p></div><div className="flex flex-wrap gap-2"><Link to="/student/applications"><Button variant="secondary">My applications</Button></Link><Link to="/student/documents"><Button variant="secondary">Documents</Button></Link><Link to={next}><Button>{selectedTrack ? 'Continue' : 'Start'}</Button></Link></div></div></Card></div>;
}

function RequireStudentTrack({ track, children }) {
  const { selectedCycleId } = useCycle();
  const { data, isLoading } = useQuery({
    queryKey: ['my-track-selection', selectedCycleId],
    queryFn: () => api(`/students/me/track-selection?cycle_id=${selectedCycleId}`),
    enabled: !!selectedCycleId,
    retry: false,
  });
  if (!selectedCycleId) return <EmptyState title="No open cycle yet" description="This workspace opens after CRCS publishes a cycle and enrolls you." to="/student/profile" />;
  if (isLoading) return <div className="loading-state">Opening your internship dashboard…</div>;
  const destinations = {
    research: '/student/research',
    crcs_opportunity: '/student/opportunities',
    self_internship: '/student/self-internship',
  };
  const selectedTrack = data?.selection?.track;
  if (selectedTrack !== track) return <Navigate to={destinations[selectedTrack] ?? '/student/preference'} replace />;
  return children;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole(user, ...roles)) return <Navigate to="/" replace />;
  return children;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <RoleHome /> },
  {
    path: '/student',
    element: <RequireAuth><RequireRole roles={['student']}><StudentLayout /></RequireRole></RequireAuth>,
    children: [
      { index: true, element: <StudentLanding /> },
      { path: 'profile', element: <StudentProfilePage /> },
      { path: 'preference', element: <TrackSelectionPage /> },
      { path: 'research', element: <RequireStudentTrack track="research"><ResearchDashboard /></RequireStudentTrack> },
      { path: 'research/browse', element: <Navigate to="/student/research" replace /> },
      { path: 'opportunities', element: <RequireStudentTrack track="crcs_opportunity"><OpportunityListPage /></RequireStudentTrack> },
      { path: 'applications', element: <MyOpportunityApplicationsPage /> },
      { path: 'mentor-details', element: <MyMentorDetailsPage /> },
      { path: 'self-internship', element: <RequireStudentTrack track="self_internship"><SelfInternshipPage /></RequireStudentTrack> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'marks', element: <MarksViewPage /> },
    ],
  },
  {
    path: '/faculty',
    element: <RequireAuth><RequireRole roles={['faculty']}><FacultyLayout /></RequireRole></RequireAuth>,
    children: [
      { index: true, element: <FacultyLanding /> },
      { path: 'profile', element: <FacultyProfilePage /> },
      { path: 'applications', element: <ApplicationQueue stage="faculty" /> },
      { path: 'documents', element: <ReviewQueue /> },
      { path: 'report-deadlines', element: <ReportDeadlineManager /> },
      { path: 'marks', element: <MarksEntryForm /> },
      { path: 'mentor-allocations', element: <FacultyMenteesPage /> },
      { path: 'locks', element: <Navigate to="/coordinator" replace /> },
    ],
  },
  {
    path: '/coordinator',
    element: <RequireAuth><RequireRole roles={['faculty_coordinator', 'hod', 'dean', 'school_office']}><CoordinatorLayout /></RequireRole></RequireAuth>,
    children: [
      { index: true, element: <CoordinatorLanding /> },
      { path: 'overview', element: <OrgOverviewPage /> },
      { path: 'activity', element: <ActivityMonitorPage /> },
      { path: 'student-records', element: <StudentRecordsPage /> },
      { path: 'school', element: <SchoolAnalytics /> },
      { path: 'reassignment', element: <MentorReassignment /> },
      { path: 'mentor-allocations', element: <MentorAllocationsPage /> },
    ],
  },
  {
    path: '/crcs',
    element: <RequireAuth><RequireRole roles={['crcs_coordinator', 'crcs_superadmin']}><CRCSLayout /></RequireRole></RequireAuth>,
    children: [
      { index: true, element: <CrcsLanding /> },
      { path: 'opportunities', element: <OpportunityManager /> },
      { path: 'approvals', element: <ApprovalsHub /> },
      { path: 'activity', element: <ActivityMonitorPage /> },
      { path: 'locks', element: <Navigate to="/crcs" replace /> },
      { path: 'mentor-allocations', element: <MentorAllocationsPage /> },
      { path: 'research-approvals', element: <Navigate to="/crcs/approvals" replace /> },
      { path: 'self-internship-approvals', element: <Navigate to="/crcs/approvals" replace /> },
      { path: 'templates', element: <ReportTemplateManager /> },
      { path: 'student-records', element: <StudentRecordsPage /> },
      { path: 'marks', element: <AdminMarksPage /> },
      { path: 'analytics', element: <SystemAnalytics /> },
      { path: 'people', element: <AllPeoplePage /> },
      { path: 'admin/users', element: <UserManagement /> },
      { path: 'cycles', element: <CycleSetupPage /> },
      { path: 'admin/permissions', element: <Navigate to="/crcs/admin/users" replace /> },
    ],
  },
]);
