import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Users, FileText, Gauge, UserCircle, ArrowRight } from '@phosphor-icons/react';
import { api } from '../../lib/api.js';
import { readMentorAllocations } from '../../lib/mentorAllocationCache.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { EmptyState, PageHeader, StatCard } from '../../components/ui/page.jsx';
import { SkeletonCard } from '../../components/ui/skeleton.jsx';
import StudentDetailsModal from './StudentDetailsModal.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

export default function DirectMentorDashboard() {
  const { user } = useAuth();
  const { selectedCycle, selectedCycleId } = useCycle();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const { data: allocationData, isLoading: allocationsLoading } = useQuery({ queryKey: ['mentor-allocations', selectedCycleId], queryFn: () => api(`/mentor-allocations?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId, initialData: () => readMentorAllocations(user?.id), staleTime: 30_000 });
  const { data: documents = [], isLoading: documentsLoading } = useQuery({ queryKey: ['review-documents', selectedCycleId], queryFn: () => api(`/documents?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const mappings = allocationData?.mappings ?? [];
  const pendingReports = documents.filter((document) => document.review_status === 'pending').length;
  if (!selectedCycleId) return <div className="max-w-3xl"><PageHeader breadcrumb={[{ label: 'Home' }, { label: 'Faculty' }]} eyebrow="Student supervision" title="No open cycle yet" description="Your supervision dashboard appears after CRCS publishes a cycle and assigns students to you." /></div>;
  return <div className="max-w-5xl space-y-6"><PageHeader breadcrumb={[{ label: 'Home' }, { label: 'Faculty' }, { label: 'Dashboard' }]} eyebrow={`Student supervision · ${selectedCycle?.name ?? 'Selected cycle'}`} title="CRCS and self-internship mentor dashboard" description="Use the same faculty workspace to manage your assigned CRCS-opportunity and self-internship students: deadlines, report feedback, and academic marks." />
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Allocated students" value={mappings.length} icon={Users} /><StatCard label="Reports to review" value={pendingReports} icon={FileText} tone="amber" /><StatCard label="Mentor capacity" value={`${mappings.length} / 5`} icon={Gauge} /></div>
    <Card className="p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold">Your next actions</h2><p className="mt-1 text-sm text-slate-600">Set a deadline first, then review submitted reports and award marks.</p></div><div className="flex flex-wrap gap-2"><Link to="/faculty/report-deadlines"><Button variant="secondary">Set report deadlines</Button></Link><Link to="/faculty/documents"><Button variant="secondary">Review reports{pendingReports ? ` (${pendingReports})` : ''}</Button></Link><Link to="/faculty/marks"><Button>Award marks</Button></Link></div></div></Card>
    <Card className="p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">My allocated students</h2><p className="mt-1 text-sm text-slate-600">Only CRCS and self-internship students assigned to you are listed here.</p></div><Link to="/faculty/mentor-allocations" className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:underline">View all details<ArrowRight size={13} weight="bold" /></Link></div>{allocationsLoading || documentsLoading ? <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div> : !mappings.length ? <EmptyState title="No students have been allocated yet" description="CRCS will assign approved CRCS or self-internship students to you here." /> : <div className="space-y-3">{mappings.slice(0, 5).map((mapping, index) => <motion.div key={`${mapping.type}:${mapping.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: index * 0.04 }} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"><div><button type="button" onClick={() => setSelectedStudent({ ...mapping.student, company_name: mapping.company_name, outcome: mapping.outcome })} className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500"><UserCircle size={15} weight="bold" />{mapping.student?.full_name ?? 'Student'}</button><p className="text-sm text-slate-600">{mapping.student?.email}</p><button type="button" onClick={() => setSelectedStudent({ ...mapping.student, company_name: mapping.company_name, outcome: mapping.outcome })} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">View student details<ArrowRight size={11} weight="bold" /></button><p className="mt-2 text-sm text-brand-700">{mapping.title}</p></div><Badge status="approved">{mapping.type === 'opportunity' ? 'CRCS opportunity' : 'self-internship'}</Badge></motion.div>)}</div>}</Card>{selectedStudent && <StudentDetailsModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
  </div>;
}
