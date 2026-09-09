import { AnalyticsSummary } from './AnalyticsSummary.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

export default function SchoolAnalytics() {
  const { selectedCycle } = useCycle();
  return <AnalyticsSummary eyebrow={`School analytics${selectedCycle ? ` · ${selectedCycle.name}` : ''}`} title="Your school’s internship progress" description="A permission-scoped view for planning, oversight, and timely intervention." />;
}
