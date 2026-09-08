import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import StudentDetailsModal from './StudentDetailsModal.jsx';

export default function DirectMentorDashboard() {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const { data: allocationData, isLoading: allocationsLoading } = useQuery({ queryKey: ['mentor-allocations'], queryFn: () => api('/mentor-allocations') });
  const { data: documents = [], isLoading: documentsLoading } = useQuery({ queryKey: ['review-documents'], queryFn: () => api('/documents') });
  const mappings = allocationData?.mappings ?? [];
  const pendingReports = documents.filter((document) => document.review_status === 'pending').length;
  return <div className="max-w-5xl space-y-6"><PageHeader eyebrow="Student supervision" title="CRCS and self-internship mentor dashboard" description="Use the same faculty workspace to manage your assigned CRCS-opportunity and self-internship students: deadlines, report feedback, and academic marks." />
    <div className="grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-sm font-semibold text-slate-600">Allocated students</p><p className="mt-1 text-3xl font-bold text-slate-950">{mappings.length}</p></Card><Card className="p-5"><p className="text-sm font-semibold text-slate-600">Reports to review</p><p className="mt-1 text-3xl font-bold text-amber-700">{pendingReports}</p></Card><Card className="p-5"><p className="text-sm font-semibold text-slate-600">Mentor capacity</p><p className="mt-1 text-3xl font-bold text-slate-950">{mappings.length} / 5</p></Card></div>
    <Card className="p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold">Your next actions</h2><p className="mt-1 text-sm text-slate-600">Set a deadline first, then review submitted reports and award marks.</p></div><div className="flex flex-wrap gap-2"><Link to="/faculty/report-deadlines"><Button variant="secondary">Set report deadlines</Button></Link><Link to="/faculty/documents"><Button variant="secondary">Review reports{pendingReports ? ` (${pendingReports})` : ''}</Button></Link><Link to="/faculty/marks"><Button>Award marks</Button></Link></div></div></Card>
    <Card className="p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">My allocated students</h2><p className="mt-1 text-sm text-slate-600">Only CRCS and self-internship students assigned to you are listed here.</p></div><Link to="/faculty/mentor-allocations" className="text-sm font-bold text-indigo-700 hover:underline">View all details →</Link></div>{allocationsLoading || documentsLoading ? <p className="loading-state">Loading your supervision workspace…</p> : !mappings.length ? <EmptyState title="No students have been allocated yet" description="CRCS will assign approved CRCS or self-internship students to you here." /> : <div className="space-y-3">{mappings.slice(0, 5).map((mapping) => <div key={`${mapping.type}:${mapping.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><button type="button" onClick={() => setSelectedStudent(mapping.student)} className="font-semibold text-indigo-700 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500">{mapping.student?.full_name ?? 'Student'}</button><p className="text-sm text-slate-600">{mapping.student?.email}</p><button type="button" onClick={() => setSelectedStudent(mapping.student)} className="mt-1 text-xs font-semibold text-indigo-700 hover:underline">View student details →</button><p className="mt-2 text-sm text-indigo-700">{mapping.title}</p></div><Badge status="approved">{mapping.type === 'opportunity' ? 'CRCS opportunity' : 'self-internship'}</Badge></div>)}</div>}</Card>{selectedStudent && <StudentDetailsModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
  </div>;
}
