import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { primaryRole } from '../lib/permissions.js';
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
import OpportunityManager from '../features/crcs-opportunities/OpportunityManager.jsx';
import SelfInternshipPage from '../features/self-internship/SelfInternshipPage.jsx';
import SelfInternshipReviewPage from '../features/self-internship/SelfInternshipReviewPage.jsx';
import SelfInternshipApprovalsPage from '../features/self-internship/SelfInternshipApprovalsPage.jsx';
import DocumentsPage from '../features/documents/DocumentsPage.jsx';
import ReviewQueue from '../features/documents/ReviewQueue.jsx';
import ReportTemplateManager from '../features/documents/ReportTemplateManager.jsx';
import MarksViewPage from '../features/marks/MarksViewPage.jsx';
import MarksEntryForm from '../features/marks/MarksEntryForm.jsx';
import MarksOverridePanel from '../features/marks/MarksOverridePanel.jsx';
import DepartmentAnalytics from '../features/analytics/DepartmentAnalytics.jsx';
import SchoolAnalytics from '../features/analytics/SchoolAnalytics.jsx';
import SystemAnalytics from '../features/analytics/SystemAnalytics.jsx';
import UserManagement from '../features/admin/UserManagement.jsx';
import CRCSPermissionsConfig from '../features/admin/CRCSPermissionsConfig.jsx';
import AuditLogViewer from '../features/admin/AuditLogViewer.jsx';

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
    crcs_coordinator: '/crcs',
    crcs_superadmin: '/crcs',
  };
  return <Navigate to={map[role] ?? '/login'} replace />;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <RoleHome /> },
  {
    path: '/student',
    element: <RequireAuth><StudentLayout /></RequireAuth>,
    children: [
      { index: true, element: <TrackSelectionPage /> },
      { path: 'research', element: <ResearchDashboard /> },
      { path: 'research/browse', element: <ProjectListing /> },
      { path: 'opportunities', element: <OpportunityListPage /> },
      { path: 'self-internship', element: <SelfInternshipPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'marks', element: <MarksViewPage /> },
    ],
  },
  {
    path: '/faculty',
    element: <RequireAuth><FacultyLayout /></RequireAuth>,
    children: [
      { index: true, element: <ProjectForm /> },
      { path: 'applications', element: <ApplicationQueue stage="faculty" /> },
      { path: 'documents', element: <ReviewQueue /> },
      { path: 'marks', element: <MarksEntryForm /> },
      { path: 'self-internship-reviews', element: <SelfInternshipReviewPage /> },
    ],
  },
  {
    path: '/coordinator',
    element: <RequireAuth><CoordinatorLayout /></RequireAuth>,
    children: [
      { index: true, element: <DepartmentAnalytics /> },
      { path: 'school', element: <SchoolAnalytics /> },
      { path: 'reassignment', element: <MentorReassignment /> },
    ],
  },
  {
    path: '/crcs',
    element: <RequireAuth><CRCSLayout /></RequireAuth>,
    children: [
      { index: true, element: <OpportunityManager /> },
      { path: 'research-approvals', element: <ApplicationQueue stage="crcs" /> },
      { path: 'self-internship-approvals', element: <SelfInternshipApprovalsPage /> },
      { path: 'templates', element: <ReportTemplateManager /> },
      { path: 'marks', element: <MarksOverridePanel /> },
      { path: 'analytics', element: <SystemAnalytics /> },
      { path: 'admin/users', element: <UserManagement /> },
      { path: 'admin/permissions', element: <CRCSPermissionsConfig /> },
      { path: 'admin/audit-log', element: <AuditLogViewer /> },
    ],
  },
]);
