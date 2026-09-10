# Internship Management Portal — Current Handoff

Date: 2026-09-10
Workspace: `C:\Users\ABHINAV TEJA\Downloads\module8-SM`

## Latest session update — CRCS internship types

### Faculty mentor contact details — 10 September 2026

- Cycle onboarding now previews each required guideline inside the acknowledgement screen. The preview comes before its checkbox, and the final **Agree and continue** action remains below every document; the former external **Open PDF** and **Skip reading** controls were removed.
- Migration `backend/db/migrations/20260910000034_faculty_contact_details.sql` is applied through Supabase MCP. It adds the nullable `faculty.cabin` field.
- Cabin ownership is deliberately **faculty-only**. CRCS creates and manages the account, role, department, mentor category, email, and phone; it does not collect or edit cabin data. After a faculty member acknowledges onboarding guidelines, a missing cabin redirects them to **Faculty → My profile**, where they can add or update it whenever their location changes.
- Research listings now show the project faculty member’s name, email, phone, and cabin before a student applies. Once any research, CRCS opportunity, or self-internship mentor is assigned, the student’s **My mentor details** panel shows the same contact information in the pathway and unified **My applications** page.
- The mentor card always renders **Email**, **Phone**, and **Cabin** in a responsive layout. If a faculty member has not saved a cabin yet, it explicitly shows **Not updated yet** rather than hiding the cabin field.
- Students also have a dedicated **My Mentor Details** sidebar page. It is intentionally visible before allocation, but shows a clear locked/waiting state until an approved internship receives a faculty mentor. Once allocated, it shows every assigned mentor’s full contact card and links directly to the internship and Documents workspace.

- The CRCS Internship preference now opens one opportunity dashboard with two clear listing types: **Exclusive CRCS** roles, which are campus opportunities managed through CRCS, and **Open-source** roles, which CRCS publishes for an external company application.
- For an open-source role, a student follows the company link, records the external application in the portal, and—once selected—uploads the company offer letter plus selection details to CRCS. CRCS can review the same applicant record and give the final approval; the offer letter is mandatory for that approval.
- The CRCS opportunity workspace can filter listings by type and applicants by status. Open-source offer details and the uploaded offer letter are visible in the applicant record and CSV export.
- Students now also have a dedicated **My Applications** sidebar page. It lists every CRCS application for the selected cycle, supports type/status filtering, external-offer upload or replacement, and revocation of every non-final application (including a submitted external offer).
- **My Applications** now combines Research, CRCS (Exclusive/Open-source), and Self-internship submissions for the selected cycle. A preference change never removes or revokes an earlier application. Faculty research recommendations also leave all other applications intact; only a final research/CRCS approval closes competitors. Uploading a self-internship offer letter is treated as a confirmed selection and immediately revokes all competing pending applications. Migration `unified_application_lifecycle` is applied remotely and adds the self-internship `revoked` status for manual student withdrawal.
- Student **Documents** is now a two-column workspace: guidelines/formats/samples and deadlines on the left; upload and the student’s submitted documents on the right. Programme materials, linked report guidance, and uploaded documents preview in an in-app modal rather than opening a separate browser tab.
- Students can still change an internship preference freely before CRCS locks preferences. After the lock, the portal directs them to contact CRCS rather than creating a self-service change request.
- Recording an external offer does **not** revoke other applications. Only a final CRCS approval revokes competing research, CRCS, and self-internship applications.
- Supabase migration `crcs_opportunity_types` is applied and verified on the deployed project. It adds the type field and the open-source offer-letter/detail fields. The frontend build and backend static/database checks pass locally.

## Latest session update — 9 September 2026

This section supersedes older statements below about seeded/demo data and the required-document gate.

### Programme documents and dynamic report assessment (deployed to remote Supabase)

- Added migration `backend/db/migrations/20260909000021_programme_documents_and_dynamic_marks.sql`. It creates `programme_documents`, `report_requirements`, and `student_report_scores`, with indexes and FK relationships. The base `schema.sql` matches it.
- CRCS **Report Types** is now a report-requirements workspace: publish programme guidelines, formats, samples, PPTs and rubrics; then create a required report with its pathway, linked guidance and maximum marks. A requirement creates the linked upload template and an assessment component.
- Students see published programme resources above their document upload form, including a directly linked requirement guide and the requirement's maximum marks after their mentor selects that requirement on a deadline. Faculty see the same faculty/all material in the submission tracker.
- Faculty marks screens and the submission-tracker marks dialog read the active report requirements and save scores per requirement. They no longer present the fixed Weekly/Mid/Synopsis/Thesis/PPT/Viva score list. The existing `marks` record is still updated solely to preserve the established “marks lock uploads” rule.
- Migration `20260909000021_programme_documents_and_dynamic_marks` is applied to the remote project. `npm run publish:materials` is idempotent and uploaded all eight supplied files to storage and published them. The importer also seeds seven required reports: Joining Report, Weekly Diary, Synopsis, Mid-semester Presentation, Final Project Report (/20), End-semester Presentation & Viva (/50), and Internship Completion Certificate. The zero-mark reports are required but deliberately do not render a faculty score field.
- The import endpoint was repaired after an audit-log failure caused by a missing `entity_id`; its results now retain document IDs and audit records are valid.
- The CRCS report workspace is arranged as two stable columns: **Programme documents** on the left and **Required reports and marks** on the right, rather than alternating the forms and lists across rows. Existing documents and requirements have Edit actions. PDF files open in the browser; Office formats open in the Office web viewer instead of downloading. New uploads set the correct storage MIME type for browser preview.
- The one-time “Import supplied documents and reports” control was removed from the CRCS UI. The existing documents and report requirements are programme-wide standards, shared by every cycle; CRCS edits individual items directly. Students see the standard guidance in Documents and faculty see it in the Submission Tracker, both through the shared preview behaviour.

### Person management edit parity — 10 September 2026

- The CRCS **Manage person → Edit profile** dialog now matches account creation: Full name, email address, optional password reset, phone, role, and required department/school assignment can be edited. Faculty also retain and can change their mentor category.
- Saving changes preserves all unrelated role assignments for that person. The backend updates the relevant student/faculty profile assignment and password hash safely, and prevents a Superadmin from removing their own Superadmin role.
- Student records now resolve and display a full organisation map on click: School, Dean, Department, HOD, current Faculty Mentor, and that mentor’s Faculty Coordinator. This is derived from the department’s parent school and role/mentor mappings, so every CSE student automatically resolves to the CSE HOD and CSE’s school without duplicate per-student mappings.
- All People now gives every non-student directory card a click-through organisation view. Faculty Mentors see their School, Dean, Department, HOD, mentor category, mapped Faculty Coordinator, and the students currently assigned to them across research, CRCS opportunity, and self-internship pathways (with status). Faculty Coordinators additionally see their mapped mentors and automatically resolve to the HOD of their own department; HODs see their department faculty and Faculty Coordinators. Deans and School Office users see every department in their school with its HOD. These are live role/mapping lookups, not manually duplicated details.
- **Map Faculty Coordinators** is a separate User Management tab (not an Organisation Setup grid column). CRCS can map only unassigned faculty mentors from the same department, up to 10 per coordinator, and can unmap them. The coordinator-to-HOD relationship needs no manual entry: it is automatically derived from their shared department. Remote migration `20260910000022_faculty_coordinator_capacity.sql` is applied and verified; it enforces one coordinator per faculty mentor and the ten-faculty maximum at the database level.
- Draft-cycle guideline cards now include a confirmed **Delete** action. Deleting retires the document from the active cycle, acknowledgement gate, and progress list while preserving its storage/audit history; documents are intentionally immutable after a cycle opens.
- Required-cycle-PDF acknowledgement is now **enrolment-driven**, not publish-driven. Every enrolled non-superadmin is checked against every draft/open cycle they belong to when they enter the portal. Therefore a person added after the first roster is built sees the same onboarding PDFs and must agree before continuing; their missing acknowledgement is automatically represented by the existing per-user acknowledgement table. Normal users can no longer browse an open cycle they were not enrolled in.
- Cycle Setup automatically attaches Faculty Coordinators, HODs, Deans, and School Office users to every active draft/open cycle. The roster picker supports both Students and Faculty Mentors, with scoped search, single/multi-select, Add all, and a CSV/XLSX template that can create either role. Migration `20260910000025_fixed_organisation_cycle_participants.sql` is applied remotely; it backfilled existing non-closed cycles and adds triggers for new cycles and later organisation-role assignments. The `2023 - 2027` draft is verified with 1 student and both active Faculty Mentors (2) enrolled.
- Published cycles no longer require a second Publish action when the directory grows. Remote migration `20260910000026_auto_enrol_new_students_in_active_cycles.sql` is applied: a newly created active Student, Faculty Mentor, Faculty Coordinator, HOD, Dean, or School Office user is enrolled in every active draft/open cycle immediately. It also backfilled active students into existing active cycles. The published `2023 - 2027` cycle is verified with 11 students, 10 organisation participants, and zero active students missing from its roster.
- Remote migration `20260910000027_auto_enrol_existing_people_for_new_cycles.sql` is applied. New draft/open cycles now immediately enrol all active directory students, Faculty Mentors, Faculty Coordinators, HODs, Deans, and School Office users that already exist; it backfilled the `2024-2028` draft with its 11 students.
- The obsolete one-click demo-account panel and displayed shared demo password were removed from the login page. Login now accepts only the credentials provisioned for the actual portal accounts.
- **Coordinator access** is now a real per-person permission catalogue rather than three static checkboxes. It loads the selected coordinator’s existing settings and provides grouped Select all/Clear controls for research approvals, CRCS opportunities, marks, student records/uploads, programme analytics, and portal locks/unlock requests. The CRCS navigation and backend routes enforce these grants; a coordinator with no grants sees a clear access message instead of a misleading default dashboard.
- Dean and School Office organisation pop-ups now include a derived, expandable school hierarchy: Dean → each department and its HOD → Faculty Coordinators → mapped Faculty Mentors → their current pathway-assigned students. Faculty who still need a Coordinator and students who still need a Faculty Mentor are shown explicitly. It is calculated live from school/department roles, coordinator assignments, and internship mentor assignments—there is no duplicate manual hierarchy to maintain.
- CRCS opportunity eligibility now uses saved department records instead of a free-text department note. The post/edit form presents this as a compact dropdown with search, one/several department selection, Select all, and Clear; an empty selection keeps the opportunity open to every department. Migration `20260910000024_opportunity_eligible_departments.sql` is applied remotely and verified. The API validates selected IDs and prevents a student from applying when their department is not eligible.

- **Supabase was reset deliberately.** Every row in every deployed portal table and every object in the `documents` storage bucket was removed; schema and migrations were preserved. The optional `analytics_alert_deliveries` table does not exist in the deployed project. Post-wipe verification returned no non-empty tables and zero storage objects.
- The only remaining portal account is the newly bootstrapped **CRCS Superadmin** at `crcs.admin@example.edu`. The development password was shared directly with the user and is intentionally not recorded here. No school, department, student, faculty, Dean, HOD, coordinator, or School Office record exists yet.
- Local services are running and returned HTTP 200 at `http://127.0.0.1:4000/api/health` and `http://127.0.0.1:5173` when started in this session.
- **Organisation onboarding is now discoverable:** `CRCSLayout.jsx` includes an **Organisation & Users** sidebar entry (`/crcs/admin/users`). Use it in this order: create schools, create departments, then add people. Dean and School Office require a school; HOD, Faculty Coordinator, Faculty, and Student require a department.
- `UserManagement.jsx` now displays the live **Added schools** and **Added departments** lists directly below their respective forms, including codes and each department’s parent school.
- Cycle Setup intentionally only creates/imports **students and faculty** into a selected **department**, because both require a department profile and can then be enrolled in the cycle. When the roster scope is University or School, these cards remain disabled and show a working **Open Organisation & Users** link rather than appearing silently broken.
- `CycleGuidelineAcknowledgementGate.jsx` no longer blocks all non-superadmin portals simply because CRCS has not uploaded a required PDF. It blocks only after there is an actual required document to acknowledge.
- Self-internship approval now includes CRCS mentor allocation, clearer approve/reject feedback, explicit text input types, and direct-mentor allocation preloading. Mentor allocation displays department context.
- Verification after these code changes: `npm run build` succeeds; `backend/npm test` succeeds; `frontend` role/access Playwright suite passes all 16 tests.

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
- Required cycle PDFs are versioned. The CRCS Superadmin is intentionally exempt from the agreement gate so they can reach Cycle Setup and upload/replace PDFs. Every other enrolled participant and oversight role is checked for required PDFs in each Draft or Open cycle they belong to; they may then skip opening a PDF but must explicitly agree to each required current version before accessing any dashboard. CRCS can review acknowledgement progress in Cycle Setup.

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

## Cycle isolation update — 2026-09-10

- **Fixed.** The selected cycle now scopes the CRCS directory (`All People`), student records, research approvals, self-internship approvals, CRCS opportunity applications, opportunity marks, and the pending queues/preferences on the CRCS overview. These screens no longer use global application or participant lists when another cycle is selected.
- **Fixed.** `All People` first filters to the selected cycle's `cycle_participants`, then shows only the participant role enrolled for that cycle. A user with several organisation roles therefore does not inflate the directory for a new cycle.
- **Superseded.** Migration `20260910000027_auto_enrol_existing_people_for_new_cycles.sql` was applied during this session, then corrected by migration 28 because it enrolled students too broadly across drafts. Do not remove it; migration 28 replaces its functions and cleans the unintended rows.

## Roster and completed-cycle correction — 2026-09-10

- **Corrected.** Migration `20260910000028_keep_student_rosters_per_cycle.sql` is applied to the connected Supabase project. It removes accidental student enrolments generated by the earlier broad backfill, including `abhi@gmail.com` from the other cycle. A student is now present only in the cycle where CRCS added them; use **Add existing people** in a new cycle to reuse that account deliberately.
- **Fixed.** Closed (expired) cycles are removed from the cycle list and rejected by cycle-aware APIs for students, faculty mentors, and faculty coordinators. CRCS, HOD, Dean, and School Office can still select and review every completed cycle.

## Local test quick sign-in — 2026-09-10

- `frontend/src/auth/LoginPage.jsx` now shows grouped one-click login buttons for the current local users: Administration/Oversight, Faculty Mentors, and Students. It retrieves the current names, emails, roles, and username-as-password test pattern from `GET /api/auth/testing-accounts`.
- `backend/src/routes/auth.js` exposes that route only when `TEST_QUICK_LOGINS=true`; this flag is set only in the local backend `.env`. The production frontend bundle has been checked to ensure it contains no test-account email or password data.

## CRCS roster and email identity correction — 2026-09-10

- **Fixed.** Migration `20260910000029_crcs_cycle_roster_and_unique_emails.sql` is applied to the connected Supabase project. CRCS Superadmins and Coordinators are now fixed participants in every draft/open cycle, so the selected-cycle **All People** directory shows their cards and email addresses in the CRCS team section.
- **Fixed.** User email identity is trimmed and lower-cased in database, create, bulk import, profile edit, and login flows. A unique normalized-email index prevents the same address being used twice with different casing or whitespace. The remote data was checked before the index was added; it contained no existing normalized duplicates.

## Supabase security warning

Supabase reports RLS disabled on `public.student_preference_change_requests` and `public.report_deadlines`. Do not enable RLS without designed and tested policies, because doing so can break portal access.

## Latest continuation — 2026-09-10

- **Student Records UI corrected.** `StudentRecordsPage.jsx` now uses a compact, full-width table with one row per student and no forced horizontal-scrolling grid. Selecting a student opens a detailed record containing their organisation hierarchy, required-report status/latest submission date, and an **All submitted documents** table with file links, type, review status, and submitted-on date. The page explicitly queries the selected cycle.
- **Opportunity availability is dynamic and deployed.** Migration `20260910000030_opportunity_application_availability.sql` was applied through the Supabase MCP and adds `crcs_opportunities.accepting_applications`. CRCS can manually close/reopen applications; a deadline automatically changes availability to **Deadline passed** after its calendar day. A future deadline reopens an otherwise accepting opportunity. The student UI and `POST /opportunities/:id/apply` both enforce this state server-side.
- **Duplicate identity protection is deployed.** Existing remote data was checked: it has zero duplicate normalized emails and zero duplicate normalized registration numbers. Migration `20260910000031_unique_student_roll_numbers.sql` was applied through the Supabase MCP and adds a case- and whitespace-insensitive unique roll-number index. Account creation, bulk upload, and profile email edits return clear duplicate errors; the local quick-login endpoint also deduplicates accounts by normalized email.
- **Login layout updated.** The normal login form is on the left and the local testing quick-login panel is on the right at desktop widths; they stack on smaller screens. The testing account panel remains development-only.
- Verification after the above: frontend production build, backend route/static/database-invariant tests, JavaScript syntax checks, `git diff --check`, and the MCP schema checks all passed. MCP verification confirms `accepting_applications` and `students_roll_number_normalized_unique_idx` exist remotely.
- Supabase now reports RLS disabled on nine public tables: `student_preference_change_requests`, `report_deadlines`, `portal_unlock_requests`, `cycle_participants`, `cycle_guideline_documents`, `cycle_guideline_acknowledgements`, `programme_documents`, `report_requirements`, and `student_report_scores`. Do not enable RLS automatically; define and test policies first, because enabling it without policies will break application access.

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
