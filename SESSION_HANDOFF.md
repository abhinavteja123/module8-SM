# Internship Management Portal — Current Handoff

Date: 2026-09-09
Workspace: `C:\Users\ABHINAV TEJA\Downloads\module8-SM`

## Current verified state

- Frontend: `http://127.0.0.1:5173`; backend health: `http://127.0.0.1:4000/api/health`.
- Frontend production build and backend route/static/database-invariant tests passed on 2026-09-09.
- Playwright contains 24 browser cases in 5 suites. Disposable browser records are cleaned up after every completed run.
- Supabase migration `20260907000001_opportunity_management.sql` was applied on 2026-09-08. Remote `crcs_opportunities` now has `application_url` and `is_active`.
- The previously broken CRCS archive action now passes through the real create → apply → withdraw → edit → archive browser flow.
- Login now has grouped one-click buttons for all 25 persistent demo accounts. Every button authenticated successfully in a browser check.
- CRCS preference controls are now compact: the preference lock status, pending-change count, and lock/unlock action remain visible without a large empty card.
- The CRCS desktop shell no longer horizontally scrolls at a 1048px viewport; wide tables scroll within their own table container instead.
- Mentor Allocation now has a focused allocation queue, student search/type filters, mentor capacity signals, and clear success/error feedback.
- CRCS approvals use reviewable tables and decision dialogs. Research approvals show the complete pipeline; only rows in `pending_crcs_approval` can be decided by CRCS.
- Student Records is a filterable oversight table with roll-number search, internship pathway, approval stage, four report categories, document names, and signed clickable file links.
- All People now gives every student card an inline application/approval summary and a detail dialog for pathway, reports, and uploaded files.
- Research students retain all applications on their dashboard, including faculty-pending, CRCS-pending, approved, rejected, and closed applications. They can continue to browse projects.
- A disposable test student account named `Abhi` was created in CSE with roll number `CSE2026999`. Credentials were shared directly with the user and are intentionally not recorded here.
- CRCS Superadmins and CRCS Coordinators have system-wide **Portal Locks** access. HODs and Faculty Coordinators have the same controls only for their own department. They can lock a student portal, or separately lock a faculty member’s project/application workspace, assignments/deadlines/reviews workspace, and marks workspace.
- Locked students and faculty can submit a reasoned unlock request; managers decide it from the Portal Locks request queue. Approval unlocks only the requested lock. Each lock, request, and decision is appended to `audit_log` with actor, previous/new state, timestamp, and reason.
- Once a faculty member’s report deadline has passed, an attempted assignment/review or marks change automatically materialises the relevant faculty lock, records the event, and requires the same unlock-request approval path.
- The CRCS overview’s compact **Preference changes** strip opens a single lock-control dialog. It now has only four clear areas: preference changes, student portals, faculty workspaces, and everything. The people picker searches the server after two characters (rather than loading the full directory), and the same picker supports one or many selected people in one lock/unlock action.
- The people picker waits 250 ms after typing, reuses a search result for one minute, returns at most 20 people, and can search active people by name, email, or student roll number. Apply `20260909000014_lock_people_search_indexes.sql` to add the matching database indexes before operating a large (6,000+) directory.
- The lock picker also has a **Select all students/faculty in this cycle** bulk toggle. It is browser-verified: turning it on removes the individual search list, clearly describes the affected audience, and enables one action. It does not render or transmit every person to the browser: migration `20260909000015_bulk_cycle_portal_locks.sql` adds one database-side operation that resolves eligible, scoped people and writes every changed lock/audit record atomically.
- The next major platform phase is documented in `CYCLE_WORKSPACE_PLAN.md`: explicit cycle enrolment and setup, a shared top-right cycle switcher, cycle-scoped dashboards for every role, and read-only historical views. Do not add a selector alone—many current API reads still infer the open cycle and must first be made cycle-aware.
- Multi-cycle foundation is now implemented: the shared top-right selector persists `?cycle=<uuid>`. For Superadmins, the former separate **User Management** entry is now folded into a single three-step **Cycle Setup** journey: create the draft cycle and batch, choose existing people with fast multi-select search or add one/bulk-import new people directly into that cycle, then set shared student/faculty guidelines and publish one Open cycle. Categories/cohorts attach to enrolments. CRCS programme analytics, opportunities, research project browsing, self-internship lists, and marks are cycle-aware. Draft/closed cycles reject new track selections, projects, self-internships, and opportunities.
- Student locks block profile edits, track/preference and questionnaire changes, applications, withdrawals, application-detail edits, uploads, and certificate submission. Faculty-project locks block project create/edit/delete, faculty decisions, and new applications to that faculty’s projects. Read access remains available.
- `npm run seed:cycles` adds two idempotent draft cycles: **Manual Setup Cycle · Empty** (zero people for manual configuration) and **Sample Cycle · 100 Participants** (90 sample students and 10 sample faculty, with cohort categories and guidelines). It never changes the currently Open cycle.
- `npm run seed:cycles` was run on 2026-09-09: **Manual Setup Cycle · Empty** has 0 participants, and **Sample Cycle · 100 Participants** has exactly 90 students and 10 faculty. Both remain Drafts.
- Cycle Setup now uses a hierarchy-first roster builder instead of free-text categories: select Students/Faculty, then university, school, or department scope; search one person or calculate and confirm **Add all** server-side. New individual and department-first spreadsheet accounts are automatically added to the current Draft; spreadsheet accounts receive a one-time temporary-password CSV. Publishing now requires at least one student, one faculty member, and one required PDF.
- Selecting a Draft in the shared top-right cycle switcher now opens **Cycle Setup** directly at **Build roster** for that Draft instead of making the Superadmin choose the same cycle again. This was browser-verified with the 100-person sample cycle.
- The **Continue to required documents** action is intentionally available even with an empty/incomplete roster, so the Superadmin can upload required PDFs first. Only the final Publish action requires at least one student and faculty member. This click path was browser-verified on the empty Draft cycle.
- Required cycle PDFs are versioned. The CRCS Superadmin is intentionally exempt from the agreement gate so they can reach Cycle Setup and upload/replace PDFs. Every other participant and oversight role is blocked from an Open-cycle dashboard until the Superadmin has uploaded at least one required PDF; they may then skip opening a PDF but must explicitly agree to each required current version before accessing any dashboard. CRCS can review acknowledgement progress in Cycle Setup.

Complete black-box inventory: [`BLACK_BOX_TEST_CASES.md`](BLACK_BOX_TEST_CASES.md).

## Commands

```powershell
Set-Location "C:\Users\ABHINAV TEJA\Downloads\module8-SM\backend"
npm install
npm run dev
```

```powershell
Set-Location "C:\Users\ABHINAV TEJA\Downloads\module8-SM\frontend"
npm install
npx playwright install chromium
npm run dev -- --host 127.0.0.1
npm run test:e2e
```

Focused suites:

```powershell
npm run test:e2e -- e2e/self-lifecycle.spec.mjs --workers=1
npm run test:e2e -- e2e/write-actions.spec.mjs --workers=1
npm run test:e2e -- e2e/operations-regression.spec.mjs --grep-invert "invalid login" --workers=1
```

## Confirmed browser flows

- Self internship: submit details/offer letter → CRCS rejection reason → re-upload → approval → mentor allocation and automatic hierarchy → deadline/reminder → report upload → feedback.
- CRCS opportunity: post → student preference/profile → optional resume upload → apply → withdraw → edit → archive.
- Direct-internship mentor: allocation, deadline, document review, feedback, and marks screens.
- CRCS operational: approvals, templates, marks, analytics, people, and mobile mentor-allocation layout.
- Anonymous redirect and self/opportunity track guards.
- Manual browser validation: the Research dashboard exposes the application list and the **Browse projects** link for an existing student account.

## Recent implementation files

- `backend/src/routes/admin.js` — student records with documents/report progress and signed links.
- `backend/src/routes/research.js` — student research dashboard returns all applications instead of only CRCS-approved applications.
- `frontend/src/features/admin/{StudentRecordsPage,AllPeoplePage,UserManagement}.jsx`
- `CYCLE_WORKSPACE_PLAN.md` — staged design and acceptance checks for multi-cycle setup and dashboards.
- `CYCLE_ROSTER_DESIGN.md` — approved hierarchy-first roster, temporary credentials, and required-document acknowledgement design with decision log.
- `frontend/src/features/{mentor-allocations/MentorAllocationsPage,research-internship/{ResearchDashboard,ApplicationQueue},self-internship/SelfInternshipApprovalsPage}.jsx`
- `frontend/src/features/marks/AdminMarksPage.jsx` — clear approval/status terminology.
- `frontend/src/index.css` and `frontend/e2e/operations-regression.spec.mjs` — horizontal-scroll regression protection.

## Open defects — 2026-09-09 session (resolved)

0. **Fixed.** All of migrations 12–19 (portal locks through cycle analytics) were applied to the connected remote Supabase project — the remote had only 5 very early migrations, not 12–17 as previously assumed. This was the root cause of most reports below (CRCS hitting the guideline gate, the analytics epic looking unwired): the tables/RPCs those features depend on simply didn't exist server-side yet.
1. **Fixed.** `frontend/src/lib/api.js` now only enters the refresh-retry/redirect branch on a 401 when the failed request actually carried an `accessToken`; a bad-password `/auth/login` attempt (which sends none) now falls through to a normal error the LoginPage displays, instead of a silent full-page reload to `/login`.
2. **Fixed.** `frontend/src/app/router.jsx` gained a `RequireRole` guard wrapping each of `/student`, `/faculty`, `/coordinator`, `/crcs`; a signed-in user with the wrong role is redirected to `/` instead of rendering the section. Backend API routes already independently enforce roles via `requireRole` middleware — this closed the frontend-only cosmetic gap.
3. **Fixed.** `frontend/src/lib/permissions.js` `primaryRole()` now uses an explicit priority list (`crcs_superadmin, crcs_coordinator, hod, dean, faculty_coordinator, school_office, faculty, student`) instead of `roles[0]`, so `faculty_coordinator` outranks a co-held generic `faculty` role.
4. **Fixed.** `TrackSelectionPage.jsx`'s mutation `onSuccess` now `await`s `invalidateQueries(['my-track-selection'])` before navigating, so `RequireStudentTrack` reads fresh cache instead of a stale cached track and bouncing back to the preference page.
5. **Fixed.** `research-lifecycle.spec.mjs` — the "Browse projects" timeout was caused by defect 4 above and is now green. A follow-on failure (project card not found for "Send Application" after the fix) was handed to a subagent to root-cause separately; see its report when it lands.
6. **Fixed — PDF guideline gate scope.** `CycleGuidelineAcknowledgementGate.jsx` was gating every signed-in role, including `crcs_coordinator`/`crcs_superadmin` — trapping the very people who upload the documents before they could reach Cycle Setup to upload them. Gate now applies only to `student`, `faculty`, `faculty_coordinator`, `hod` (named explicitly by the product owner; `dean`/`school_office` were not named and are not CRCS, so left ungated pending a decision — flag if they should be included).
7. **Fixed — mid-cycle roster/document lock.** `backend/src/routes/cycles.js` `POST /cycles/:id/participants` and `.../participants/select-all` hard-blocked any status other than `not_started`, so a CRCS admin could never add a new faculty member (or re-enrol someone from a past cycle) once a cycle was published Open — the only path was to build a whole new cycle. Guard loosened to block only `status === 'closed'`; `CycleSetupPage.jsx`'s roster-edit view and required-document upload form now key off a new `canEditRoster` flag (`status !== 'closed'`) instead of `isDraft`. Publishing itself remains draft-only, unchanged.
8. **Not a bug — clarified.** Cross-cycle reuse of existing faculty/students already works: `/cycles/people` and `/cycles/people/count` query the global `students`/`faculty` tables (not scoped to any specific past cycle), filtered only by department/school scope and "already enrolled in *this* cycle." The university/school/department scope picker in Cycle Setup is not redundant hierarchy recreation — it's the required filter that makes a safe, server-counted "select all" possible on a 6,000+ person directory, per `CYCLE_ROSTER_DESIGN.md`'s existing decision log.

9. **Fixed — analytics drill-down metric-key mismatch.** Most KPI/funnel/workload/compliance/data-quality cards in `OperationalAnalyticsDashboard.jsx` built compound metric strings (e.g. `workload.mentor_capacity_risk`) that didn't match the backend's flat `drilldownMetrics` enum in `analytics.js`, so most drill-down clicks 400'd instead of opening a scoped record list; only the 3 alert cards happened to match. Added a `DRILLDOWN_METRIC_MAP` translating the 9 row/stage keys that have a real backend projection to their enum name; `MetricCard` (pure aggregate KPIs like `approval_rate` with no row-level backing) is now intentionally non-interactive instead of firing a doomed request. No backend/migration change needed — all 9 target metrics already existed in the enum.
10. **`research-lifecycle.spec.mjs` "Send Application" failure was a false alarm, not a code bug.** Re-investigated after defect 5's fix: replicated the exact project-creation + student-visibility flow via direct API calls (department scoping, cycle scoping, role rows) — all correct. Two consecutive full test runs passed clean (12.6s, 19.2s). The one observed failure was almost certainly the backend (`node --watch`) restarting mid-test because of concurrent file edits during this session, not a real defect. No code change was needed for this one.
11. **Fixed — Cycle Setup React Query crash.** School and department scope validation could evaluate to an ID string rather than a strict boolean. That string was passed as React Query's `enabled` option, causing “Expected enabled to be a boolean or a callback that returns a boolean” after changing scope or continuing the roster flow. `scopeValid` in `CycleSetupPage.jsx` is now explicitly wrapped in `Boolean(...)`. Browser-tested the School-scope Build roster → Required documents transition with no application error.
12. **Simplified — CRCS Portal Locks.** Removed the duplicate Portal Locks item and page from the CRCS navigation. The existing lock controls in the CRCS Overview are now the single CRCS entry point; old `/crcs/locks` bookmarks safely redirect to `/crcs`. The coordinator-specific lock route remains unchanged.

## Still open

- The Supabase security warning about RLS being disabled on `public.student_preference_change_requests` and `public.report_deadlines` is unchanged — do not enable RLS without designed and tested policies.
- Whether `dean`/`school_office` should also be exempted from (or included in) the guideline acknowledgement gate — see defect 6 above, left as explicitly named by the product owner (student/faculty/faculty_coordinator/hod only).

## Supabase security warning

Supabase reports RLS disabled on `public.student_preference_change_requests` and `public.report_deadlines`. Do not enable RLS without designed and tested policies, because doing so can break portal access.

## Key files

- `frontend/playwright.config.mjs`
- `frontend/e2e/{self-lifecycle,write-actions,research-lifecycle,operations-regression}.spec.mjs`
- `frontend/e2e/role-access.spec.js`
- `backend/db/migrations/20260907000001_opportunity_management.sql`
- `backend/db/migrations/20260909000012_portal_lock_registry.sql` — **apply this migration before using Portal Locks**; it creates the current-state lock registry.
- `backend/db/migrations/20260909000013_lock_exception_workflow.sql` — **apply after migration 12**; it adds faculty lock domains and the unlock-request workflow.
- `backend/db/migrations/20260909000014_lock_people_search_indexes.sql` — **apply after migration 13**; adds responsive name/email/roll-number search indexes for large directories.
- `backend/db/migrations/20260909000015_bulk_cycle_portal_locks.sql` — **apply after migration 14**; adds the atomic, scoped all-students/all-faculty-in-cycle lock operation and audit logging.
- `backend/db/migrations/20260909000016_cycle_participants.sql` — **apply after migration 15**; creates explicit per-cycle student/faculty enrolment for setup and scoped cycle selection.
- `backend/db/migrations/20260909000017_cycle_guidelines.sql` — **apply after migration 16**; adds the cycle batch label and shared participant guidelines.
- `backend/db/migrations/20260909000018_cycle_guideline_documents.sql` — **apply after migration 17**; adds versioned required PDFs and durable per-user acknowledgement records.
- `frontend/src/cycles/{CycleContext,CycleSwitcher}.jsx` and `frontend/src/features/cycles/CycleSetupPage.jsx` — global cycle selection and Superadmin cycle setup.
- `backend/src/routes/cycleDocuments.js` and `frontend/src/features/cycles/CycleGuidelineAcknowledgementGate.jsx` — cycle-PDF upload, acknowledgement, and dashboard gate.
- `frontend/src/{app/router.jsx,lib/api.js,features/track-selection/TrackSelectionPage.jsx}`
- `frontend/src/features/admin/LockManagement.jsx` and `backend/src/lib/portalLocks.js`
- `frontend/src/features/research-internship/{ResearchDashboard,ApplicationQueue}.jsx`
- `frontend/src/features/admin/{StudentRecordsPage,AllPeoplePage,UserManagement}.jsx`
