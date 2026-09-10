import { createBrowserRouter, Navigate } from 'react-router-dom';
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
import ProjectListing from '../features/research-internship/ProjectListing.jsx';
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
import DepartmentAnalytics from '../features/analytics/DepartmentAnalytics.jsx';
import SchoolAnalytics from '../features/analytics/SchoolAnalytics.jsx';
import SystemAnalytics from '../features/analytics/SystemAnalytics.jsx';
import SuperadminOverview from '../features/analytics/SuperadminOverview.jsx';
import UserManagement from '../features/admin/UserManagement.jsx';
import AllPeoplePage from '../features/admin/AllPeoplePage.jsx';
import StudentRecordsPage from '../features/admin/StudentRecordsPage.jsx';
import ApprovalsHub from '../features/admin/ApprovalsHub.jsx';
import MentorAllocationsPage from '../features/mentor-allocations/MentorAllocationsPage.jsx';
import DirectMentorDashboard from '../features/mentor-allocations/DirectMentorDashboard.jsx';
import CycleSetupPage from '../features/cycles/CycleSetupPage.jsx';

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
  if (user?.roles?.some((role) => role.role === 'school_office')) return <MentorAllocationsPage />;
  return user?.roles?.some((role) => role.role === 'dean') ? <SchoolAnalytics /> : <DepartmentAnalytics />;
}

function CrcsLanding() {
  const { user } = useAuth();
  const isSuperadmin = user?.roles?.some((role) => role.role === 'crcs_superadmin');
  const { data, isLoading } = useQuery({ queryKey: ['crcs-my-permissions'], queryFn: () => api('/admin/crcs-coordinator-permissions/me'), enabled: !!user && !isSuperadmin, retry: false });
  if (isSuperadmin) return <SuperadminOverview />;
  if (isLoading) return <div className="loading-state">Opening your CRCS workspace…</div>;
  const permissions = data?.permissions ?? {};
  if (permissions.view_opportunities) return <OpportunityManager />;
  if (permissions.view_research_approvals) return <Navigate to="/crcs/approvals" replace />;
  if (permissions.view_marks) return <Navigate to="/crcs/marks" replace />;
  if (permissions.view_student_records) return <Navigate to="/crcs/student-records" replace />;
  if (permissions.view_analytics) return <Navigate to="/crcs/analytics" replace />;
  if (permissions.manage_portal_locks) return <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-950">Portal lock changes are managed from the CRCS overview. Ask the CRCS Superadmin to open the lock controls there.</div>;
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Your CRCS Coordinator account does not have workspace permissions yet. Ask the CRCS Superadmin to grant access in Organisation & Users.</div>;
}

function FacultyLanding() {
  const { data: profile, isLoading } = useQuery({ queryKey: ['my-mentor-profile'], queryFn: () => api('/research/my-mentor-profile'), retry: false });
  if (isLoading) return <div className="loading-state">Opening your mentor dashboard…</div>;
  return profile?.mentorship_scope === 'crcs_self' ? <DirectMentorDashboard /> : <ProjectForm />;
}

function StudentLanding() {
  const { data, isLoading } = useQuery({ queryKey: ['my-track-selection'], queryFn: () => api('/students/me/track-selection'), retry: false });
  if (isLoading) return <div className="loading-state">Opening your internship dashboard…</div>;
  const destinations = { research: '/student/research', crcs_opportunity: '/student/opportunities', self_internship: '/student/self-internship' };
  return <Navigate to={destinations[data?.selection?.track] ?? '/student/preference'} replace />;
}

function RequireStudentTrack({ track, children }) {
  const { data, isLoading } = useQuery({
    queryKey: ['my-track-selection'],
    queryFn: () => api('/students/me/track-selection'),
    retry: false,
  });
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
      { path: 'research/browse', element: <RequireStudentTrack track="research"><ProjectListing /></RequireStudentTrack> },
      { path: 'opportunities', element: <RequireStudentTrack track="crcs_opportunity"><OpportunityListPage /></RequireStudentTrack> },
      { path: 'applications', element: <MyOpportunityApplicationsPage /> },
      { path: 'mentor-details', element: <MyMentorDetailsPage /> },
      { path: 'self-internship', element: <RequireStudentTrack track="self_internship"><SelfInternshipPage /></RequireStudentTrack> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'marks', element: <Navigate to="/student/documents" replace /> },
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
      { path: 'mentor-allocations', element: <MentorAllocationsPage /> },
      { path: 'locks', element: <Navigate to="/coordinator" replace /> },
    ],
  },
  {
    path: '/coordinator',
    element: <RequireAuth><RequireRole roles={['faculty_coordinator', 'hod', 'dean', 'school_office']}><CoordinatorLayout /></RequireRole></RequireAuth>,
    children: [
      { index: true, element: <CoordinatorLanding /> },
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
