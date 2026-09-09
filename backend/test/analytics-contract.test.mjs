import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(backendRoot, '..');

function source(relativePath) {
  return readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

test('analytics API exposes the cycle-scoped operational intelligence contract', () => {
  const analytics = source('backend/src/routes/analytics.js');

  for (const endpoint of ['overview', 'drilldown', 'export']) {
    assert.match(analytics, new RegExp(`router\\.get\\(['\"]/${endpoint}['\"]`), `GET /analytics/${endpoint} must exist`);
  }
  assert.match(analytics, /cycle_id\s*:\s*z\.string\(\)\.uuid\(\)/, 'cycle_id must be a UUID, not an optional client hint');
  assert.match(analytics, /status\(400\)/, 'invalid or absent analytics query parameters must return 400');
  assert.match(analytics, /analytics_cycle_overview/, 'overview must use the cycle-aware aggregate');
  assert.match(analytics, /analytics_cycle_drilldown/, 'drill-down must use the cycle-aware, scoped aggregate');
});

test('analytics derives authorization scope on the server and returns auditable metadata', () => {
  const analytics = source('backend/src/routes/analytics.js');

  assert.match(analytics, /requireAuth/, 'analytics endpoints must require an authenticated user');
  assert.match(analytics, /req\.user\.roles/, 'scope must be derived from authenticated roles');
  assert.match(analytics, /viewer_scope/, 'responses must state the derived viewer scope');
  assert.match(analytics, /calculated_at/, 'responses must state when metrics were calculated');
  assert.doesNotMatch(analytics, /req\.query\.(department_id|school_id|faculty_id)/, 'callers must not be able to supply an authority-defining scope');
});

test('drill-down and CSV export constrain caller-controlled parameters', () => {
  const analytics = source('backend/src/routes/analytics.js');

  assert.match(analytics, /metric/, 'drill-down requires a named metric');
  assert.match(analytics, /view/, 'export requires a named view');
  assert.match(analytics, /format/, 'export validates its requested format');
  assert.match(analytics, /text\/csv/, 'exports must be sent as CSV, not an untyped payload');
  assert.match(analytics, /Content-Disposition/, 'exports must be an attachment with a deterministic filename');
});

test('analytics alerts are delivered in-app without hourly duplicate spam', () => {
  const notifier = source('backend/src/lib/analyticsAlertNotifications.js');
  const server = source('backend/src/server.js');
  const migration = source('backend/db/migrations/20260909000020_analytics_alert_notifications.sql');

  assert.match(notifier, /analytics_alert_deliveries/, 'alert delivery must be recorded durably');
  assert.match(migration, /UNIQUE/, 'delivery idempotency must be enforced by the migration');
  assert.match(notifier, /notify\(/, 'threshold breaches must create an in-app notification');
  assert.match(server, /startAnalyticsAlertNotifications/, 'the server must start the alert sweep');
});

test('upgraded analytics UI keys and requests every query by selected cycle', () => {
  const client = source('frontend/src/features/analytics/analyticsClient.js');
  const dashboard = source('frontend/src/features/analytics/OperationalAnalyticsDashboard.jsx');
  const analyticsFiles = [
    'frontend/src/features/analytics/SystemAnalytics.jsx',
    'frontend/src/features/analytics/DepartmentAnalytics.jsx',
    'frontend/src/features/analytics/SchoolAnalytics.jsx',
  ];
  const analyticsSources = analyticsFiles.map((file) => [file, source(file)]);
  const summary = source('frontend/src/features/analytics/AnalyticsSummary.jsx');

  assert.match(client, /analytics\/overview\?cycle_id=/, 'overview request must explicitly propagate cycle_id');
  assert.match(client, /analytics\/drilldown\?/, 'drill-down must use the analytics API');
  assert.match(client, /analytics\/export\?/, 'CSV export must use the analytics API');
  assert.match(dashboard, /selectedCycleId/, 'analytics dashboard must consume the selected cycle context');
  assert.match(dashboard, /queryKey:\s*\[[^\]]*selectedCycleId/, 'React Query cache key must include the selected cycle');
  assert.match(dashboard, /getAnalyticsOverview\(selectedCycleId\)/, 'overview query must be issued for the selected cycle');
  assert.match(dashboard, /getAnalyticsDrilldown\(cycleId, metric, filters\)/, 'drill-down must retain the same selected cycle and filters');
  assert.match(summary, /OperationalAnalyticsDashboard/, 'the shared analytics summary must render the cycle-aware dashboard');
  for (const [file, contents] of analyticsSources) {
    assert.match(contents, /AnalyticsSummary/, `${file} must render the shared analytics summary`);
  }
  assert.doesNotMatch(dashboard, /\/cycles\/\$?\{?selectedCycle[^\n]*\/summary/, 'upgraded UI must not substitute a cycle summary for analytics');
});
