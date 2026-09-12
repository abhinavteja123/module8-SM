import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { hasRole } from '../../lib/permissions.js';
import { Badge } from '../../components/ui/badge.jsx';
import { Card } from '../../components/ui/card.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';
import ApplicationQueue from '../research-internship/ApplicationQueue.jsx';
import SelfInternshipApprovalsPage from '../self-internship/SelfInternshipApprovalsPage.jsx';

function RecentApprovalsPanel() {
  const { selectedCycleId } = useCycle();
  const { data: research = [] } = useQuery({ queryKey: ['recent-research-applications', selectedCycleId], queryFn: () => api(`/research/applications?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const { data: selfInternships = [] } = useQuery({ queryKey: ['recent-self-internships', selectedCycleId], queryFn: () => api(`/self-internships?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const decisions = useMemo(() => [
    ...research.filter((item) => ['crcs_approved', 'rejected'].includes(item.status) && item.crcs_decision_at).map((item) => ({ id: `research-${item.id}`, student: item.student_name, item: item.project_title, pathway: 'Research', approved: item.status === 'crcs_approved', decided_at: item.crcs_decision_at })),
    ...selfInternships.filter((item) => ['active', 'rejected'].includes(item.status) && item.crcs_decision_at).map((item) => ({ id: `self-${item.id}`, student: item.student?.full_name, item: item.company_name, pathway: 'Self-internship', approved: item.status === 'active', decided_at: item.crcs_decision_at })),
  ].sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at)).slice(0, 30), [research, selfInternships]);

  return <div className="space-y-5"><div><h2 className="section-title">Recent approvals</h2><p className="mt-1 text-sm text-slate-600">The latest CRCS decisions across research and self-internship applications.</p></div>
    {!decisions.length ? <EmptyState title="No decisions recorded yet" description="Approved and rejected applications will appear here as CRCS decides them." /> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[640px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Student</th><th className="px-4 py-4">Pathway</th><th className="px-4 py-4">Item</th><th className="px-4 py-4">Decision</th><th className="px-5 py-4">Decided on</th></tr></thead><tbody>{decisions.map((decision) => <tr key={decision.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4 font-semibold text-slate-900">{decision.student ?? 'Student'}</td><td className="px-4 py-4 text-slate-600">{decision.pathway}</td><td className="px-4 py-4 text-slate-800">{decision.item}</td><td className="px-4 py-4"><Badge status={decision.approved ? 'approved' : 'rejected'}>{decision.approved ? 'Approved' : 'Rejected'}</Badge></td><td className="px-5 py-4 text-slate-600">{new Date(decision.decided_at).toLocaleString()}</td></tr>)}</tbody></table></div></Card>}
  </div>;
}

export default function ApprovalsHub() {
  const { user } = useAuth();
  const isSuperadmin = hasRole(user, 'crcs_superadmin');
  const [activeTab, setActiveTab] = useState('research');

  return <div className="max-w-4xl"><PageHeader eyebrow="Decision desk" title="Approvals" description="Review all requests that need a CRCS decision in one place. A rejection reason is shared with the student." />
    <div className="portal-tabbar"><button type="button" onClick={() => setActiveTab('research')} className={`portal-tab ${activeTab === 'research' ? 'portal-tab-active' : 'border-transparent'}`}>Research internships</button>{isSuperadmin && <button type="button" onClick={() => setActiveTab('self')} className={`portal-tab ${activeTab === 'self' ? 'portal-tab-active' : 'border-transparent'}`}>Self-internships</button>}<button type="button" onClick={() => setActiveTab('recent')} className={`portal-tab ${activeTab === 'recent' ? 'portal-tab-active' : 'border-transparent'}`}>Recent approvals</button></div>
    {activeTab === 'research' ? <ApplicationQueue stage="crcs" compact /> : activeTab === 'self' ? <SelfInternshipApprovalsPage /> : <RecentApprovalsPanel />}
  </div>;
}
