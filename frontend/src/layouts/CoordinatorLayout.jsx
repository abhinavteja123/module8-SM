import { useLocation } from 'react-router-dom';
import { House, Buildings, Student, ChartLineUp, ClipboardText, GraduationCap, ArrowsLeftRight, UsersThree } from '@phosphor-icons/react';
import { Shell } from './Shell.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { hasRole } from '../lib/permissions.js';

function navLabel(Icon, text) {
  return <><Icon size={16} weight="light" className="mr-2 shrink-0" /><span>{text}</span></>;
}

export default function CoordinatorLayout() {
  const { user } = useAuth();
  const location = useLocation();
  // A person holding an org role (hod/dean/school_office) AND faculty_coordinator sees two
  // genuinely different dashboards under the same /coordinator URL (see permissions.js's
  // workspaceOptionsForUser). While on the dedicated fc-* pages, the sidebar must show only
  // that narrower workspace's links — otherwise every link still points at the org-wide pages.
  const isFcWorkspace = hasRole(user, 'hod', 'dean', 'school_office') && hasRole(user, 'faculty_coordinator') && location.pathname.startsWith('/coordinator/fc');

  const links = [];
  if (isFcWorkspace) {
    links.push({ to: '/fc-overview', label: navLabel(House, 'My Overview') });
    links.push({ to: '/fc-marks', label: navLabel(ClipboardText, 'Student Marks') });
    links.push({ to: '/fc-reassignment', label: navLabel(ArrowsLeftRight, 'Reassign Student Mentors') });
  } else {
    links.push({ to: '/', label: navLabel(House, 'My Overview') });
    if (hasRole(user, 'hod', 'dean', 'school_office')) { links.push({ to: '/overview', label: navLabel(Buildings, 'Organisation Overview') }); links.push({ to: '/student-records', label: navLabel(Student, 'Student Records') }); }
    if (hasRole(user, 'hod', 'dean', 'school_office', 'faculty_coordinator')) links.push({ to: '/activity', label: navLabel(ChartLineUp, 'Activity Monitor') });
    if (hasRole(user, 'faculty_coordinator', 'hod', 'dean')) links.push({ to: '/marks', label: navLabel(ClipboardText, 'Student Marks') });
    if (hasRole(user, 'dean')) links.push({ to: '/school', label: navLabel(GraduationCap, 'School Overview') });
    if (hasRole(user, 'faculty_coordinator', 'hod')) links.push({ to: '/reassignment', label: navLabel(ArrowsLeftRight, 'Reassign Student Mentors') });
    if (hasRole(user, 'hod') || hasRole(user, 'school_office')) links.push({ to: '/mentor-allocations', label: navLabel(UsersThree, 'Mentor Allocations') });
  }
  const isPlainFacultyCoordinator = hasRole(user, 'faculty_coordinator') && !hasRole(user, 'hod', 'dean', 'school_office');
  const title = isFcWorkspace || isPlainFacultyCoordinator ? 'Faculty Coordinator' : hasRole(user, 'school_office') ? 'School Office Portal' : 'Coordinator / HOD / Dean';
  return <Shell title={title} links={links} basePath="/coordinator" />;
}
