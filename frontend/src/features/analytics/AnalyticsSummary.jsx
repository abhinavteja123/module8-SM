import { Card } from '../../components/ui/card.jsx';
import { PageHeader, StatCard, EmptyState } from '../../components/ui/page.jsx';

const labelize = (value) => String(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function StatusBreakdown({ title, items }) {
  const rows = Object.entries(items ?? {});
  if (!rows.length) return null;
  return <Card className="p-5"><h2 className="font-bold text-slate-900">{labelize(title)}</h2><div className="mt-4 space-y-3">{rows.map(([status, count]) => <div key={status} className="flex items-center justify-between text-sm"><span className="text-slate-600">{labelize(status)}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-800">{count}</span></div>)}</div></Card>;
}

export function AnalyticsSummary({ eyebrow, title, description, data, isLoading, error }) {
  if (isLoading) return <p className="text-sm text-slate-500">Preparing the latest summary…</p>;
  if (error) return <EmptyState title="We couldn’t load this summary" description="Please refresh the page. If the problem continues, contact the portal administrator." />;
  const metrics = Object.entries(data ?? {}).filter(([, value]) => typeof value === 'number');
  const breakdowns = Object.entries(data ?? {}).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value));
  return <div><PageHeader eyebrow={eyebrow} title={title} description={description} />{!data ? <EmptyState title="No data yet" description="This overview will fill in as internships, reviews, and reports are added." /> : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([key, value], index) => <StatCard key={key} label={labelize(key)} value={value} tone={['indigo', 'emerald', 'amber', 'slate'][index % 4]} />)}</div>{breakdowns.length > 0 && <section className="mt-8"><h2 className="section-title">Progress by status</h2><p className="mt-1 text-sm text-slate-600">A quick view of where applications and internships are in the process.</p><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{breakdowns.map(([key, value]) => <StatusBreakdown key={key} title={key} items={value} />)}</div></section>}</>}</div>;
}
