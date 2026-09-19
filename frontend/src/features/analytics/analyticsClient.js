import { api } from '../../lib/api.js';

export function overviewPath(cycleId) {
  return `/analytics/overview?cycle_id=${encodeURIComponent(cycleId)}`;
}

export function getAnalyticsOverview(cycleId) {
  return api(overviewPath(cycleId));
}

export function drilldownPath(cycleId, metric, filters = {}) {
  const params = new URLSearchParams({ cycle_id: cycleId, metric });
  if (Object.keys(filters).length) params.set('filters', JSON.stringify(filters));
  return `/analytics/drilldown?${params.toString()}`;
}

export function getAnalyticsDrilldown(cycleId, metric, filters) {
  return api(drilldownPath(cycleId, metric, filters));
}

const OUTCOME_FILTER_KEYS = ['nature', 'mode', 'program_level', 'domain_sector', 'company_country', 'source_type'];

export function getInternshipOutcomes(cycleId, filters = {}) {
  const params = new URLSearchParams({ cycle_id: cycleId });
  for (const key of OUTCOME_FILTER_KEYS) if (filters[key]) params.set(key, filters[key]);
  return api(`/analytics/internship-outcomes?${params.toString()}`);
}

export function getInternshipOutcomeDetail(cycleId, { departmentId, schoolId, company, q, ...filters } = {}) {
  const params = new URLSearchParams({ cycle_id: cycleId });
  if (departmentId) params.set('department_id', departmentId);
  if (schoolId) params.set('school_id', schoolId);
  if (company) params.set('company', company);
  if (q) params.set('q', q);
  for (const key of OUTCOME_FILTER_KEYS) if (filters[key]) params.set(key, filters[key]);
  return api(`/analytics/internship-outcomes/detail?${params.toString()}`);
}

export function getResearchOutcomes(cycleId) {
  return api(`/analytics/research-outcomes?cycle_id=${encodeURIComponent(cycleId)}`);
}

export function getResearchFacultyDetail(cycleId, facultyId) {
  const params = new URLSearchParams({ cycle_id: cycleId, faculty_id: facultyId });
  return api(`/analytics/research-outcomes/faculty-detail?${params.toString()}`);
}

// Export is fetched as a blob because the shared API helper parses JSON only.
export async function downloadAnalyticsExport(cycleId, view = 'overview', format = 'csv') {
  const params = new URLSearchParams({ cycle_id: cycleId, view, format });
  const accessToken = localStorage.getItem('accessToken');
  const response = await fetch(`/api/analytics/export?${params.toString()}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) {
    let message = `Export failed (${response.status})`;
    try { message = (await response.json())?.error ?? message; } catch { /* Response may be plain text. */ }
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `internship-analytics-${view}-${cycleId}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
