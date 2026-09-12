# Internship Portal: End-to-End Remodeling Implementation Plan

Date: 2026-09-11  
Workspace: `C:\Users\ABHINAV TEJA\Downloads\module8-SM`  
Status: **Implementation in progress. This document is a plan, not a claim that all changes or tests are complete.**

## 1. Objective and agreed decisions

Complete the existing internship portal across every role and all three pathways: research, CRCS opportunities (exclusive and external/open-source), and self-internship. Correct incomplete workflows, inconsistent data, hierarchy access, and UI glitches before adding narrowly useful supporting capabilities.

- Retain React/Vite, Express, and Supabase.
- Preserve established roles, permissions, navigation, approval authority, and closed-cycle history rules.
- Remodel existing pages; avoid duplicate dashboards or parallel workflows.
- Hide unpublished cycles from everyone except CRCS Superadmin performing setup.
- Support a directory of at least 6,000 students, hundreds of faculty, and hundreds of applications without rendering or downloading the entire directory for ordinary browsing.
- Use subagents for bounded backend, frontend, and academic-workflow assignments, with the primary agent responsible for integration and verification.
- Do not mark the work complete based only on builds, source inspection, or unauthenticated HTTP 401 responses.

## 2. Current evidence and implementation baseline

The starting handoff and source already contain applications, research answers/resumes, document requirements, attendance, marks, mentor reassignment, cycle setup, guideline acknowledgement, portal locks, hierarchy overviews, and journey reset. These are existing features to finish and align, not new features to advertise.

Confirmed source-level gaps at the start:

1. Draft cycles are returned to enrolled participants and oversight users before publication.
2. The acknowledgement gate checks drafts and can block users with unpublished documents.
3. Shared cycle visibility checks do not consistently enforce membership, lifecycle, and row-level hierarchy.
4. Publication closes the old cycle and opens the new one using separate database updates.
5. Research, mentor allocation, attendance, and some academic screens infer a global/current cycle inconsistently.
6. CRCS marks starts with a global student directory and legacy fixed score columns.
7. Student Records uses fixed report categories while assessment uses dynamic requirements.
8. Marks totals exclude two requirements by mutable display titles.
9. Individual attendance oversight access lacks equivalent department/school restrictions.
10. Journey reset uses separate permanent database deletions and non-retryable file cleanup.
11. Some directory/data reads can silently stop at the database REST service's default row limit.
12. Handoff and QA documents contain older claims that conflict with newer changes.

These findings require authenticated API/browser verification after integration. Earlier reports are not proof of current deployed behavior.

## 3. Lifecycle and visibility policy

| Role | Draft (`not_started`) | Open | Closed |
| --- | --- | --- | --- |
| CRCS Superadmin | Setup access | University-wide management | Read-only history |
| CRCS Coordinator | Hidden | Assigned capabilities and authorized cycle | Authorized read-only history |
| Dean | Hidden | Own school | Own school's read-only history |
| School Office | Hidden | Own school and existing actions | Own school's read-only history |
| HOD | Hidden | Own department | Own department's read-only history |
| Faculty Coordinator | Hidden | Authorized department/faculty assignments | Hidden |
| Faculty | Hidden | Enrolled cycle and assigned projects/students | Hidden |
| Student | Hidden | Enrolled cycle and own records | Hidden |

### Shared access enforcement

- Centralize cycle lifecycle checks in the existing visibility helper, with explicit `read`, `write`, and `setup` intent.
- Enforce enrollment and role scope before reading records. Scope record queries as well as access to the cycle itself.
- Derive school/department/assignment scope from authenticated role assignments, never from client-supplied role names.
- Validate explicit cycle IDs and record IDs. A hidden cycle must remain inaccessible through a direct URL or API call.
- Use the selected authorized cycle consistently in requests, query keys, summaries, tables, exports, and details.
- Reject ordinary writes to closed cycles. Historical review does not grant historical editing rights.
- Preserve intentional roster additions while a cycle is Open; new participants complete published onboarding after enrollment.

### No accessible Open cycle

- Show: **No active internship cycle is available yet.**
- Keep account/profile access and logout available.
- Do not request draft documents, display draft names/counts, or redirect repeatedly between preference and dashboard pages.
- Clear stale cycle selections and cached records after account changes or lost access.
- Preserve an explicitly selected authorized historical view for oversight users.

### Publication

- Validate draft status, at least one student, at least one faculty member, and at least one active required guideline document.
- Use one database transaction/RPC to validate, close the previous Open cycle, open the target, and record the audit event.
- Serialize concurrent publication attempts so the database cannot retain multiple Open cycles.
- On failure, preserve the previous valid state; do not leave the institution with an accidentally closed active cycle.
- Show publication errors clearly and refresh visibility after a successful publish.

## 4. Role-by-role dashboard remodeling

### Student

- Keep the existing pathway workspace as the landing destination.
- Add current stage and next-action guidance derived from applications, approvals, mentor assignment, documents, attendance, and marks.
- Keep My Applications as the single application-history workspace, including decisions, reasons, and uploaded application files.
- Show mentor and available hierarchy contacts without inventing missing assignments.
- Organize documents by configured requirements and actual review state, including missing, submitted, revision requested, verified, and overdue.
- Display dynamic marks and attendance consistently, distinguishing zero from not entered and absence from an unmarked week.
- Improve project search using existing title, faculty, department, and availability data.

### Research Faculty

- Keep project creation and application decisions in the research workspace.
- Show selected cycle and hierarchy context alongside relevant supervision work.
- Connect mentored-student details to report review, deadlines, attendance, assessment, and handoff actions.
- Make pending and resubmitted work easy to find without opening every student.

### Direct Internship Mentor

- Show assigned CRCS/self-internship students and their actionable supervision work.
- Preserve mentorship-scope restrictions; do not expose research project approval controls.
- Use the same attendance, report, and assessment behavior as research supervision where the workflow is shared.

### Faculty Coordinator

- Show the authorized department and mapped faculty with relevant student workload.
- Provide links to existing permitted allocation/reassignment and exception workflows.
- Avoid institution-wide counts or accidental access through generic oversight routes.

### HOD

- Show department hierarchy, coordinators, faculty, enrolled students, allocation gaps, submissions, and assessment progress.
- Reuse existing coordinator mapping and Student Records controls.
- Make summary counts open corresponding scoped records.

### Dean

- Show school-level department comparisons and academic progress.
- Drill down to authorized department/student records.
- Preserve existing read/decision authority; dashboard changes do not introduce additional powers.

### School Office

- Show school operational records, department progress, and authorized allocation work.
- Preserve existing action permissions while making the landing page informative.

### CRCS Coordinator

- Provide a useful landing page assembled from granted capabilities.
- Hide unavailable actions and independently enforce permissions in APIs.
- Do not expose Superadmin-only setup/reset controls.

### CRCS Superadmin

- Prioritize pending approvals, unallocated students, missing assessments, document progress, access requests, and cycle readiness.
- Link each actionable count to its corresponding filtered queue.
- Keep approval dialogs consistent while preserving pathway-specific decision rules.
- Clearly distinguish preference access, portal locks, and exceptional reset.

## 5. Scalability and accessible interaction requirements

### Server-side data handling

- Principal directories and queues use bounded pagination, normally 25 records with a maximum of 100 per request.
- Return exact filtered totals with page metadata; do not present a truncated response as a full population.
- Filter and search before pagination. Changing search/filter resets the page.
- Use stable ordering with an ID tie-breaker to prevent records moving unpredictably between pages.
- Batch related lookups for the visible page; avoid one network/database request per student for attendance, marks, or hierarchy.
- Fetch full student documents and signed download links on detail opening instead of signing every file in a 6,000-person directory.
- For operations that genuinely require complete data, read explicit ordered chunks or use database aggregates; never depend on an implicit REST row limit.
- Scope before enriching records; avoid sending huge UUID lists when joins or database filtering can resolve membership.
- Add and validate appropriate indexes for cycle membership, entity lookups, and frequently filtered fields.

### Frontend interaction

- Use compact tables for comparison and queues; use detail panels/dialogs for full records.
- Search by relevant names, email, roll number, project, or organization as supported by each page.
- Provide visible page controls, filtered counts, clear filters, and deliberate empty states.
- Keep filters and selected cycle when returning from a detail view.
- Prevent duplicate submissions; preserve user input after recoverable failures.
- Show retryable errors instead of indefinite loading.
- Keep horizontal scrolling inside wide tables, not the whole application.
- Label controls, provide keyboard focus, accessible dialog behavior, and readable status text that does not rely only on color.
- Avoid rendering thousands of cards, options, or rows simultaneously.

### Performance verification

- Exercise pages with representative 6,000+ record fixtures and hundreds of applications/faculty.
- Verify correct totals, records beyond the first 1,000, bounded DOM rows, and stable pagination.
- Measure request counts and response behavior before setting a claimed response-time guarantee.
- Report measured local results separately from unverified production concurrency or load capacity.

## 6. Academic and application workflow corrections

### Applications and approvals

- Align status labels, decision reasons, disabled-action explanations, and successful mutation refreshes across all pathways.
- Preserve pathway-specific faculty/CRCS approval transitions and exclusivity rules.
- Validate selected cycle and direct-record access on reads, applications, edits, withdrawals, decisions, and mentor changes.

### Dynamic requirements and marks

- Replace fixed report buckets and CRCS score columns with active configured requirements.
- Add an explicit assessment classification (`is_assessed`) and backfill proof-only requirements appropriately.
- Keep proof submission visible without counting it toward an assessed total.
- Validate score limits, enrollment, actual pathway, mentor ownership, and cycle write access server-side.
- Ensure faculty previews, saved totals, student marks, and CRCS oversight agree.
- Do not reinterpret a rename as a grading-policy change.

### Attendance

- Resolve attendance for an explicit authorized cycle and internship entity.
- Apply organizational scope to oversight access and current mentor ownership to writes.
- Keep summaries batched for tables and distinguish present, absent, and unmarked states.
- Correct the initial week selection after asynchronous data arrives.
- Preserve attribution and audit meaningful edits.

### Mentor handoff

- Use existing eligible-target rules and authorization.
- Record old/new mentor, actor, time, and reason across pathways.
- Preserve historical submissions, attendance, and grading attribution.
- Revoke the former mentor's write access immediately after handoff.

## 7. Exceptional reset integrity

- Retain the existing single-student, Open-cycle, Superadmin-only restriction and required reason/confirmation.
- Add an impact-preview endpoint showing affected counts and retained information.
- Move database cleanup and the audit event into one transactional RPC.
- Preserve institutional audit history and cycle membership.
- Restore project capacity safely as part of the same transaction.
- Queue physical file cleanup durably after database commit; record failures and allow retries.
- Never validate reset by deleting a real student's journey. Use disposable fixtures and rollback/failure-injection tests.

## 8. Interfaces and compatibility

- Retain existing endpoint naming where possible.
- Extend `requireVisibleCycle(req, res, cycleId, { mode })` for explicit access intent.
- Propagate `cycle_id` consistently to affected dashboards, mentor allocations, attendance, marks, and student records.
- Paginated lists use `{ items, total, page, page_size }`; Student Records retains `{ cycle, records, requirements, total, page, page_size }`.
- Where legacy callers still require arrays, preserve compatibility during migration and update principal screens to paginated calls.
- Directory filters include search, role, department, and school; student records support appropriate pathway filtering.
- Fetch document detail by the selected student and cycle, not by an unscoped global directory request.
- Coordinate frontend contracts with backend owners before integration.

## 9. Subagent ownership and integration

| Owner | Assignment | Boundaries |
| --- | --- | --- |
| Backend foundation subagent | Cycle guard, cycle routes/documents, publication, mentor-allocation scope, hierarchy overview | Does not edit frontend or academic/admin routes owned elsewhere |
| Frontend subagent | User-friendly role dashboards, navigation, cycle waiting/gates, paginated tables, dynamic academic UI, accessibility | Owns frontend implementation; primary owns E2E integration tests |
| Academic workflow subagent | Marks, attendance, reports/documents, research/opportunity/self workflow access and handoffs | Does not edit cycle foundation or administrative reset/directory |
| Primary agent | Administrative pagination, student-record detail, reset integrity, contracts, migrations, integration, live QA, documentation | Reviews and integrates all changes |

- Use separate file ownership and explicit messages for shared contracts.
- Integrate foundational behavior before judging dependent dashboards.
- Do not run stateful end-to-end tests while concurrent edits are restarting the backend.
- Review subagent output independently; a subagent's completion message is not acceptance evidence.

## 10. Delivery sequence

### Stage A: Access and data correctness

- [ ] Shared lifecycle/membership enforcement across affected APIs.
- [ ] Publication transaction and migration validation.
- [ ] Correct selected-cycle and organizational scope in summaries and records.
- [ ] No draft visibility or draft acknowledgement for participants.
- [ ] Correct assessment and attendance source of truth.

### Stage B: All-role frontend remodeling

- [ ] Student, research faculty, and direct mentor workspaces completed.
- [ ] Faculty Coordinator, HOD, Dean, and School Office dashboards completed.
- [ ] CRCS Coordinator and Superadmin workflows completed.
- [ ] Principal large-data screens use server-side pagination/search.
- [ ] Shared loading/error/empty states and responsive accessibility checked.

### Stage C: Reliability and useful additions

- [ ] Next-action guidance and improved search.
- [ ] Mentor handoff history and ownership checks.
- [ ] Reset preview, transaction, and cleanup retry.
- [ ] Query/cache and duplicate-submit glitches corrected.

### Stage D: Verification and delivery

- [ ] Backend tests and frontend production build pass.
- [ ] Migration-dependent behavior verified against the deployed schema.
- [ ] Authenticated API scope/lifecycle matrix passes.
- [ ] All three complete internship journeys pass.
- [ ] Every role checked in the browser, including large-data and narrow-screen cases.
- [ ] Failure and concurrency cases verified for publication/reset.
- [ ] Disposable test data cleaned and cleanup checked.
- [ ] Handoff and QA documents reconciled with actual results.

## 11. Acceptance test matrix

| Area | Required scenarios |
| --- | --- |
| Cycle lifecycle | Draft hidden; Open available only to authorized users; closed history restricted and read-only |
| Direct access | Forged cycle ID, bookmarked draft URL, unrelated student ID, other department/school rejected |
| Onboarding | No draft PDFs; published required versions acknowledged; late enrollment works |
| Account changes | Logout/login and lost access clear inaccessible selection/data |
| Student journeys | Research, exclusive/external CRCS, and self-internship through appropriate approval, mentor, documents, attendance, marks |
| Dashboards | Correct hierarchy, matching count/drill-down population, permitted actions only |
| Assessment | Dynamic components; proof excluded; rename stable; wrong track/cycle rejected; reload totals agree |
| Attendance | Correct entity/cycle; absent versus unmarked; valid week range; scoped oversight; mentor ownership |
| Handoff | Previous attribution retained; new mentor can act; former mentor cannot write |
| Publication | Missing prerequisites rejected; failure rollback; concurrent publish leaves valid single Open state |
| Reset | Required input enforced; preview accurate; database rollback on error; cleanup failure retryable |
| Scale | 6,000+ records; exact totals; records after 1,000 accessible; page-bounded DOM; no per-row request explosion |
| Usability | Keyboard controls, visible focus, dialogs, mobile/narrow layout, retry states, preserved form input |

## 12. Migration and deployment status

New database functions/columns must be applied and verified before related actions are declared operational. Never substitute unsafe non-transactional writes when a required RPC is missing.

At document creation, the configured Supabase management MCP URL returned **HTTP 401** and no callable Supabase management connector was available in the active tools. Existing application database credentials support normal application reads, but do not establish authorized schema-management access. Consequently, remote deployment of new migrations is **not yet verified**. Continue implementation and local validation; record any remaining deployment dependency explicitly.

Do not enable RLS automatically. Preserve existing protections while designing/testing any required policy changes.

## 13. Completion reporting

The final handoff must list implemented behavior, actual commands/tests and their results, migration deployment status, known failures, and remaining limitations. It must not equate route reachability, compilation, or mock tests with full live end-to-end success.

This plan remains the complete scope document. `SESSION_HANDOFF.md` and `QA_REPORT.md` will carry the verified delivery state after integration.
