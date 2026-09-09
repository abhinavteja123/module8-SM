import { AnalyticsSummary } from './AnalyticsSummary.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

export default function DepartmentAnalytics() {
  const { selectedCycle } = useCycle();
  return <AnalyticsSummary eyebrow={`Department analytics${selectedCycle ? ` · ${selectedCycle.name}` : ''}`} title="Your department’s internship progress" description="Monitor student progress, faculty workload, bottlenecks, and exceptions within your access scope." />;
}
