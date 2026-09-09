import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, requireCrcsPermission } from '../middleware/auth.js';

const router = Router();

// Scope is derived from the verified user's roles. A department/school value in
// the URL would be an escalation primitive, so the analytics API never accepts one.
const ANALYTICS_ROLES = ['crcs_superadmin', 'crcs_coordinator', 'dean', 'school_office', 'hod', 'faculty_coordinator', 'faculty'];
const drilldownMetrics = ['pending_reviews', 'overdue_reports', 'missing_acknowledgements', 'unassigned_active_internships', 'duplicate_active_applications', 'missing_cycle_enrolment', 'capacity_risk', 'pending_unlock_requests', 'inconsistent_statuses'];
const cycleQuery = z.object({ cycle_id: z.string().uuid() });
const drilldownQuery = cycleQuery.extend({ metric: z.enum(drilldownMetrics), limit: z.coerce.number().int().min(1).max(500).default(100) });
const exportQuery = cycleQuery.extend({ view: z.enum([...drilldownMetrics, 'overview']), format: z.enum(['csv', 'pdf']).default('csv') });

function deriveViewerScope(user) {
  const roles = user.roles ?? [];
  if (roles.some((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role.role))) return { type: 'system', departmentIds: [], schoolIds: [], facultyId: null, isSystem: true };
  const schoolIds = [...new Set(roles.filter((role) => ['dean', 'school_office'].includes(role.role)).map((role) => role.school_id).filter(Boolean))];
  if (schoolIds.length) return { type: 'school', departmentIds: [], schoolIds, facultyId: null, isSystem: false };
  const departmentIds = [...new Set(roles.filter((role) => ['hod', 'faculty_coordinator'].includes(role.role)).map((role) => role.department_id).filter(Boolean))];
  if (departmentIds.length) return { type: 'department', departmentIds, schoolIds: [], facultyId: null, isSystem: false };
  if (roles.some((role) => role.role === 'faculty')) return { type: 'faculty', departmentIds: [], schoolIds: [], facultyId: user.id, isSystem: false };
  return null;
}

async function requireAnalyticsCycle(req, res, cycleId) {
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,name,status').eq('id', cycleId).maybeSingle());
  if (!cycle) { res.status(404).json({ error: 'internship cycle not found' }); return null; }
  const viewerScope = deriveViewerScope(req.user);
  if (!viewerScope) { res.status(403).json({ error: 'your role is not authorized to view analytics' }); return null; }
  // A scoped viewer may only request a cycle that contains people in their
  // permitted scope. This prevents cycle metadata from becoming an
  // organisation-wide directory even when the aggregate itself would be zero.
  if (!viewerScope.isSystem) {
    let membership = supabase.from('cycle_participants').select('id').eq('cycle_id', cycleId).limit(1);
    if (viewerScope.type === 'school') membership = membership.in('school_id', viewerScope.schoolIds);
    else if (viewerScope.type === 'department') membership = membership.in('department_id', viewerScope.departmentIds);
    else membership = membership.eq('user_id', req.user.id);
    const visible = unwrap(await membership);
    if (!visible.length) { res.status(403).json({ error: 'this cycle is outside your analytics scope' }); return null; }
  }
  return { cycle, viewerScope };
}

function rpcScope(cycleId, scope) {
  return { p_cycle_id: cycleId, p_department_ids: scope.departmentIds.length ? scope.departmentIds : null, p_school_ids: scope.schoolIds.length ? scope.schoolIds : null, p_faculty_id: scope.facultyId, p_is_system: scope.isSystem };
}

function csvEscape(value) {
  const rendered = value === null || value === undefined ? '' : String(value);
  return /[\",\r\n]/.test(rendered) ? `\"${rendered.replace(/\"/g, '\"\"')}\"` : rendered;
}

function toCsv(rows, fields = ['record_id', 'student_id', 'full_name', 'roll_number', 'department_id', 'detail', 'occurred_at']) {
  return [fields.join(','), ...rows.map((row) => fields.map((field) => csvEscape(row[field])).join(','))].join('\r\n');
}

// A small dependency-free PDF is intentionally limited to the overview's
// self-describing metric rows. Detailed queues should be exported as CSV so
// they remain useful in spreadsheet tooling.
function toOverviewPdf(cycleName, rows) {
  const escape = (value) => String(value ?? '').replace(/([\\()])/g, '\\$1').replace(/[\r\n]+/g, ' ');
  const lines = [`${cycleName} — analytics overview`, ...rows.map((row) => `${row.metric}: ${row.value} (${row.definition})`)].slice(0, 42);
  const content = ['BT', '/F1 11 Tf', '50 792 Td', ...lines.flatMap((line, index) => [index ? '0 -17 Td' : '', `(${escape(line)}) Tj`].filter(Boolean)), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, 'utf8')); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

router.get('/overview', requireAuth, requireRole(...ANALYTICS_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = cycleQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a valid UUID' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const data = unwrap(await supabase.rpc('analytics_cycle_overview', rpcScope(context.cycle.id, context.viewerScope)));
  res.json({ ...data, cycle: context.cycle, viewer_scope: context.viewerScope.type, calculated_at: data.calculated_at ?? new Date().toISOString() });
});

router.get('/drilldown', requireAuth, requireRole(...ANALYTICS_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = drilldownQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id, supported metric, and an optional limit (1-500) are required' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const data = unwrap(await supabase.rpc('analytics_cycle_drilldown', { ...rpcScope(context.cycle.id, context.viewerScope), p_metric: parsed.data.metric, p_limit: parsed.data.limit }));
  res.json({ ...data, cycle: context.cycle, viewer_scope: context.viewerScope.type });
});

router.get('/export', requireAuth, requireRole(...ANALYTICS_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = exportQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id, supported view, and format=csv|pdf are required' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const isOverview = parsed.data.view === 'overview';
  const data = unwrap(await supabase.rpc(isOverview ? 'analytics_cycle_overview' : 'analytics_cycle_drilldown', isOverview
    ? rpcScope(context.cycle.id, context.viewerScope)
    : { ...rpcScope(context.cycle.id, context.viewerScope), p_metric: parsed.data.view, p_limit: 500 }));
  const safeName = `${context.cycle.name}-${parsed.data.view}`.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'analytics-export';
  if (isOverview) {
    const rows = Object.entries(data.metrics ?? {}).map(([metric, value]) => ({ metric, value: value?.value ?? 0, numerator: value?.numerator ?? '', denominator: value?.denominator ?? '', exclusions: (value?.exclusions ?? []).join(' | '), definition: data.definitions?.[metric] ?? '' }));
    if (parsed.data.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=\"${safeName}.pdf\"`);
      return res.send(toOverviewPdf(context.cycle.name, rows));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"${safeName}.csv\"`);
    return res.send(toCsv(rows, ['metric', 'value', 'numerator', 'denominator', 'exclusions', 'definition']));
  }
  if (parsed.data.format === 'pdf') return res.status(400).json({ error: 'PDF export is available for the analytics overview; export a detailed queue as CSV.' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=\"${safeName}.csv\"`);
  res.send(toCsv(data.rows ?? []));
});

// Compatibility endpoints for deployed clients. New clients must use the
// mandatory-cycle endpoints above; these legacy RPCs are retained safely scoped.
router.get('/department/:department_id', requireAuth, requireRole('hod', 'faculty_coordinator'), async (req, res) => {
  const ownsDept = req.user.roles.some((role) => ['hod', 'faculty_coordinator'].includes(role.role) && role.department_id === req.params.department_id);
  if (!ownsDept) return res.status(403).json({ error: 'not scoped to this department' });
  res.json(unwrap(await supabase.rpc('analytics_department', { p_department_id: req.params.department_id })));
});
router.get('/school/:school_id', requireAuth, requireRole('dean'), async (req, res) => {
  const ownsSchool = req.user.roles.some((role) => role.role === 'dean' && role.school_id === req.params.school_id);
  if (!ownsSchool) return res.status(403).json({ error: 'not scoped to this school' });
  res.json(unwrap(await supabase.rpc('analytics_school', { p_school_id: req.params.school_id })));
});
router.get('/system', requireAuth, requireRole('crcs_superadmin'), async (_req, res) => res.json(unwrap(await supabase.rpc('analytics_system', {}))));

export default router;
