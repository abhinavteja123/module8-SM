# Cycle Workspace Plan

## Goal

Every authorised portal user works in one explicit internship cycle. The top-right cycle switcher controls the data shown on every dashboard, list, report, and lock screen. CRCS Superadmins can create and configure cycles; scoped managers see only the cycles and people allowed by their university, school, or department.

## Cycle states

| State | Meaning | Who can change it |
| --- | --- | --- |
| Draft | Setup is in progress; participants cannot act yet. | CRCS Superadmin |
| Open | The active operational cycle; new work and actions are allowed. | CRCS Superadmin |
| Closed | Read-only history; no new applications or edits. | CRCS Superadmin |
| Archived | Retained for audit/reporting only. | CRCS Superadmin |

Only one cycle is the default active cycle. Administrators may still select any visible historical cycle for reporting or audit; students and faculty see a historical cycle read-only.

## Top-right cycle switcher

- Shown in the shared application shell for CRCS, coordinator, faculty, and student workspaces.
- Displays the selected cycle name, batch/cohort, state, and date range.
- Persists the selection in the URL as `?cycle=<uuid>` so a shared link and page refresh retain the same context.
- Defaults to the open cycle when no cycle is supplied.
- Changing it invalidates cycle-scoped query data and reloads the page’s data for that cycle. It never changes a record in another cycle.
- The switcher only lists cycles within the user’s school/department/university scope; students and faculty additionally see only cycles in which they are enrolled.

## New-cycle setup wizard

1. **Cycle details** — name, academic year/batch, university/school, departments, opening/closing dates, and owner.
2. **Participants** — choose existing onboarded students and faculty using search/filter; import additional students by CSV/XLSX with IDs/roll numbers; validate duplicates before saving.
3. **Categories and responsibility** — assign students to cohort/category and eligible tracks; assign faculty as research mentor, direct mentor, coordinator, HOD, or evaluator within the selected scope.
4. **Programme rules** — preference window, capacity, report templates, deadlines, lock policy, and approval path.
5. **Review and publish** — display enrolment counts, missing IDs, invalid roles, and a final summary; publishing changes Draft to Open.

Participant enrolment must be explicit. Existing accounts remain reusable between cycles; an account is not automatically included merely because it existed in a previous cycle.

## Dashboard behaviour

| Workspace | Selected-cycle dashboard |
| --- | --- |
| CRCS Superadmin | Cycle health, enrolment, pathway mix, approvals, mentor capacity, deadlines, marks, lock status, and audit activity. |
| CRCS Coordinator/Admin | Assigned permissions plus approval, opportunity, and lock queues for the selected cycle. |
| University/School/Dean | School-scoped cohort, department comparisons, allocation, completion, and exception reporting. |
| HOD/Faculty Coordinator | Department-scoped students, faculty workload, applications, deadlines, marks, and locks. |
| Faculty | Only their selected-cycle projects, mentees, reports, attendance, reviews, and marks. |
| Student | Only their selected-cycle preference, applications, documents, deadlines, and marks; closed cycles are read-only. |

## Data and API changes

1. Add `cycle_participants` with `cycle_id`, `user_id`, participant kind, category/cohort, department/school snapshot, enrolment status, source (`existing`/`bulk_import`), and audit fields.
2. Add cycle-level faculty responsibility records rather than relying only on global roles.
3. Add `GET /cycles` (scoped list), `GET /cycles/:id` (details), `GET /cycles/:id/summary`, participant search/import endpoints, and a setup publish endpoint.
4. Require or consistently derive `cycle_id` on every dashboard read. Existing endpoints that silently choose the open cycle must accept the selected cycle ID.
5. Make creation/mutation endpoints reject a closed or archived cycle and enforce the selected user’s scope server-side.
6. Keep audit entries immutable with the cycle ID included in every new event.

## Delivery order

1. Cycle list/detail APIs and participant data model.
2. New-cycle setup wizard and validated bulk upload.
3. Shared selected-cycle context and top-right switcher.
4. Convert CRCS/admin/coordinator dashboards and lists to selected-cycle reads.
5. Convert faculty and student workspaces, with read-only historical access.
6. Add cycle comparison, export, and end-to-end role/scope tests.

## Acceptance checks

- Creating a Draft cycle does not expose it to participants.
- A Superadmin can enrol existing users and imported users, assign categories, and publish exactly one active cycle.
- Changing the selected cycle changes all visible counts and records, including analytics, approvals, marks, reports, and locks.
- A department manager cannot switch to or alter a cycle/person outside their scope.
- A closed-cycle user can view history but cannot create, edit, upload, lock, or approve new work.
- Browser tests cover cycle creation, enrolment, cycle switching, scoped visibility, historical read-only access, and bulk import validation.
