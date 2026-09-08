# Internship Management Portal — Current Handoff

Date: 2026-09-08  
Workspace: `C:\Users\ABHINAV TEJA\Downloads\module8-SM`

## Current verified state

- Frontend: `http://127.0.0.1:5173`; backend health: `http://127.0.0.1:4000/api/health`.
- Frontend production build and backend route/static/database-invariant tests passed on 2026-09-08.
- Playwright contains 24 browser cases in 5 suites. Disposable browser records are cleaned up after every completed run.
- Supabase migration `20260907000001_opportunity_management.sql` was applied on 2026-09-08. Remote `crcs_opportunities` now has `application_url` and `is_active`.
- The previously broken CRCS archive action now passes through the real create → apply → withdraw → edit → archive browser flow.

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

## Open defects

1. Bad-password login has no visible alert: `api()` treats all `401`s as session expiry before `LoginPage` can display its error.
2. Logged-in students can directly open `/faculty`, `/coordinator`, and `/crcs`; add role-level route guards, not just `RequireAuth`.
3. `coordinator@example.edu` lands at `/faculty` because the generic faculty role wins over `faculty_coordinator`.
4. A new student saving **Research Internship** is returned to the preference page because the track guard sees stale query data. Update/invalidate the cache before navigation.
5. Login labels lack `htmlFor`/matching input IDs.

The full suite should not be considered green until these are fixed and rerun.

## Supabase security warning

Supabase reports RLS disabled on `public.student_preference_change_requests` and `public.report_deadlines`. Do not enable RLS without designed and tested policies, because doing so can break portal access.

## Key files

- `frontend/playwright.config.mjs`
- `frontend/e2e/{self-lifecycle,write-actions,research-lifecycle,operations-regression}.spec.mjs`
- `frontend/e2e/role-access.spec.js`
- `backend/db/migrations/20260907000001_opportunity_management.sql`
- `frontend/src/{app/router.jsx,lib/api.js,features/track-selection/TrackSelectionPage.jsx}`
