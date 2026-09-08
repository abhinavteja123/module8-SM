# QA Report — Current Browser Regression

Date: 2026-09-08  
Workspace: `C:\Users\ABHINAV TEJA\Downloads\module8-SM`

The current black-box test inventory is [`BLACK_BOX_TEST_CASES.md`](BLACK_BOX_TEST_CASES.md). The operational handoff is [`SESSION_HANDOFF.md`](SESSION_HANDOFF.md).

## Latest results

- Frontend production build: **PASS**
- Backend route/static and database-invariant tests: **PASS**
- Playwright discovered: **24 cases in 5 suites**
- Full self-internship journey: **PASS**
- Opportunity create/edit/profile save/resume upload/apply/withdraw/archive: **PASS** after applying the Supabase opportunity-management migration
- Operational CRCS/faculty/mentor/HOD/dean/school-office browser checks: **PASS** except known negative-login assertion

## Active failures

- Bad-password login gives no visible error.
- Frontend role-level route guards are absent.
- Faculty Coordinator lands in Faculty instead of Coordinator workspace.
- New Research preference returns the student to preference selection because the track query is stale during navigation.
- Login labels are not associated with the inputs.

## Safety and cleanup

Browser write tests use uniquely named `E2E` records. The self-internship, opportunity, and interrupted research runs were checked after execution; no temporary users, opportunities, applications, documents, deadlines, or projects remain.

## Supabase

`application_url` and `is_active` were added to `crcs_opportunities` on the connected project. Supabase also reports RLS disabled for `student_preference_change_requests` and `report_deadlines`; policies must be designed before enabling RLS.
