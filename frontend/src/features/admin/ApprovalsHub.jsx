import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { hasRole } from '../../lib/permissions.js';
import { PageHeader } from '../../components/ui/page.jsx';
import ApplicationQueue from '../research-internship/ApplicationQueue.jsx';
import SelfInternshipApprovalsPage from '../self-internship/SelfInternshipApprovalsPage.jsx';

export default function ApprovalsHub() {
  const { user } = useAuth();
  const isSuperadmin = hasRole(user, 'crcs_superadmin');
  const [activeTab, setActiveTab] = useState('research');

  return <div className="max-w-4xl"><PageHeader eyebrow="Decision desk" title="Approvals" description="Review all requests that need a CRCS decision in one place. A rejection reason is shared with the student." />
    <div className="portal-tabbar"><button type="button" onClick={() => setActiveTab('research')} className={`portal-tab ${activeTab === 'research' ? 'portal-tab-active' : 'border-transparent'}`}>Research internships</button>{isSuperadmin && <button type="button" onClick={() => setActiveTab('self')} className={`portal-tab ${activeTab === 'self' ? 'portal-tab-active' : 'border-transparent'}`}>Self-internships</button>}</div>
    {activeTab === 'research' ? <ApplicationQueue stage="crcs" compact /> : <SelfInternshipApprovalsPage />}
  </div>;
}
