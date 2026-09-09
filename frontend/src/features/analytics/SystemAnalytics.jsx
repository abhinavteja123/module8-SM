import { AnalyticsSummary } from './AnalyticsSummary.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

export default function SystemAnalytics() {
  const { selectedCycle } = useCycle();
  return <AnalyticsSummary eyebrow={selectedCycle ? `CRCS analytics · ${selectedCycle.name}` : 'CRCS analytics'} title="Internship programme intelligence" description="See workload, student activity, approvals, compliance, and data quality for the selected cycle." />;
}
