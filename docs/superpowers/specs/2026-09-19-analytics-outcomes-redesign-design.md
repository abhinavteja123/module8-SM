# Analytics page redesign — operations/outcomes split, audit-shaped outcomes rebuild

Date: 2026-09-19

## Why

Triggered by `AUDIT Internship details.xlsx` (SRM AP's real placement-reporting workbook) and `Internship Roadmap.docx`. The portal's `internship_outcomes` feature (shipped earlier the same session) captures `mode`/`nature`/`stipend_amount`/`company_country`/`domain_sector`/`program_level`, but the analytics page only surfaces a subset, with no hierarchy, no search, and two fully dead controls.

## Field inventory (source of truth for what's "end to end")

**`analytics_cycle_overview` RPC** — every key already renders except:
- `filter_options`/`statuses`: **never emitted by the backend, anywhere.** The Status filter dropdown (`OperationalAnalyticsDashboard.jsx:244`) has always been a dead, empty control. Removed.
- `historical`/`trends`: **never emitted.** The Historical Comparison section has always shown its placeholder. Removed.
- `approval_rate`, `average_faculty_review_hours`, `average_crcs_decision_hours`: stay dropped (prior explicit user feedback — misleading math / a real, still-open backend RPC bug returning negative durations). No RPC changes in this pass.

**`internship_outcomes` table** — `mode`/`nature`/`stipend_amount`/`duration_months` already used. `domain_sector`/`company_country` are collected by `InternshipOutcomeForm.jsx` but dropped by both outcome endpoints' `.select()` — added. `source_type` (self_internship/crcs_opportunity) unused as a filter — added. `recruiter_feedback_doc_id` unused — added as a "View feedback" link (reuses `DocumentPreviewModal`, resolved via `getSignedUrl`). `students.program_level` + `departments.school_id` fetched but never grouped/filtered on — now drive the School→Level→Programme hierarchy.

**Out of scope, explicitly**: Final-internship/PPO sheet (per direct instruction), gender, research pathway (excluded from `internship_outcomes` since the feature shipped), the roadmap's target/company-source numbers (no backing table — would be fabricated data), MOU/partnerships tracking (separate, unbuilt feature).

## Design

### Bug fix (both tabs)
`AlertList` renders every alert key including `severity: 'ok'`, styled identically to a real warning (no `ok` branch in `styles{}`). Fixed to only render breached alerts; "No active alerts" shown when none.

### Tab split
`OperationalAnalyticsDashboard.jsx` gains two tabs via `?section=operations|outcomes` (reuses the existing `.portal-tabbar` pattern), default `operations`.

**Operations tab**: today's KPI groups / funnel / workload / compliance / data-quality, unchanged math. Dead status filter and historical section removed.

**Outcomes tab** (rebuilt):
- Filter bar: Nature, Mode, Programme level, Domain/Sector, Company country, Pathway — all pushed to the DB query, not JS-filtered post-fetch.
- Department table: **School → Level → Programme** grouping with computed subtotal rows at the school and school+level levels (new `Map`s in the same aggregation pass, reusing `stipendStats()` — the audit sheet's own group-header rows are blank templates; computing real subtotals is a supported improvement, not scope creep, since it's free in the existing loop).
- Company grid: search box + top-20/show-all cap (roadmap targets ~300 companies).
- Detail dialog: search box (name/roll, client-side over the already-scoped response) + columns reordered to the audit's own "Summer Internship" sheet order: Roll No. → Name → Level → Programme → School → Company → Country → Domain/Sector → Mode → Duration → Nature → Stipend (₹/month — the sheet's "LPA" header is wrong for this data; its values are monthly). Feedback-doc link where present.
- Export: new `view=internship_outcomes` on `GET /analytics/export`, CSV shaped like the audit's Dashboard sheet.

### Backend (`backend/src/routes/analytics.js`)
- Both outcome endpoints: add `domain_sector`, `company_country`, `recruiter_feedback_doc_id`, `department_id`, `schools(name)` to `.select()`.
- `outcomeQuery`/`outcomeDetailQuery`: add `program_level`, `domain_sector`, `company_country`, `source_type` as optional filters, applied via `.eq()` before fetch (not post-fetch JS filtering).
- `outcomeDetailQuery`: generalize the department/company XOR into composable filters — `department_id` + `program_level` (+ `programme_name` for exact leaf match) or `school_id` (+ optional `program_level` for a level subtotal) or `company`, plus any of the secondary filters layered on top.
- Extract the fetch+group+`stipendStats()` logic into one shared function used by both `GET /internship-outcomes` and the new export view — avoids duplicating the aggregation.
- `GET /analytics/export`: new branch for `view=internship_outcomes`, calling the shared aggregation function, CSV via existing `toCsv()`.

## Verification
- `node --check` on every touched backend file; full app-graph import.
- `frontend npm run build` clean.
- Manual: log in as a demo HOD/CRCS Superadmin account, confirm both tabs render, filters narrow results, drilldowns and exports work, and a plain `faculty` account still sees the Operations tab only (outcomes 403s as before, section simply doesn't render).

No git commit this session — working tree only, per this project's established convention.
