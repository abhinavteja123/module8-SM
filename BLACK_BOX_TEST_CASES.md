# Black-Box Test Cases

Date: 2026-09-08  
Scope: browser-visible user actions, pages, controls, messages, and saved outcomes.  
Status: **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN**.

## Authentication and routing

| ID | User action | Expected result | Status |
|---|---|---|---|
| BB-AUTH-01 | Sign in with valid student credentials | Student workspace opens | PASS |
| BB-AUTH-02 | Sign in as CRCS, faculty, HOD, dean, school office, coordinator | Correct landing page and logout work | PASS for 9/10 roles |
| BB-AUTH-03 | Sign in with wrong password | Visible invalid-credentials alert | FAIL |
| BB-AUTH-04 | Open protected URL while logged out | Redirect to Login | PASS |
| BB-AUTH-05 | Student opens Faculty, Coordinator, CRCS URLs | Student is blocked/redirected | FAIL |
| BB-AUTH-06 | Faculty Coordinator signs in | Coordinator landing opens | FAIL |
| BB-AUTH-07 | Use labels to identify login inputs | Inputs have accessible labels | FAIL |

## Preference selection

| ID | User action | Expected result | Status |
|---|---|---|---|
| BB-TRACK-01 | Self-track student opens Opportunities | Redirect to Self-Internship | PASS |
| BB-TRACK-02 | Opportunity-track student opens Self-Internship | Redirect to Opportunities | PASS |
| BB-TRACK-03 | New student saves CRCS Opportunity | Opportunities opens | PASS |
| BB-TRACK-04 | New student saves Research Internship | Research dashboard and Browse projects open | FAIL |
| BB-TRACK-05 | Locked preference is changed | CRCS change request is created | NOT RUN |
| BB-TRACK-06 | CRCS decides a preference request | Student path updates only after approval | NOT RUN |

## Self-internship journey

| ID | User action | Expected result | Status |
|---|---|---|---|
| BB-SELF-01 | Submit company, website, address, offer source, offer letter | CRCS review state | PASS |
| BB-SELF-02 | CRCS reviews request | Details and offer document visible | PASS |
| BB-SELF-03 | CRCS rejects with reason | Reason and re-upload action shown | PASS |
| BB-SELF-04 | Student re-uploads and resubmits | Request returns to CRCS | PASS |
| BB-SELF-05 | CRCS approves and allocates mentor | Student is locked; hierarchy visible | PASS |
| BB-SELF-06 | Mentor sets deadline; student uploads report; mentor requests revision | Reminder, upload, feedback visible | PASS |
| BB-SELF-07 | Mentor enters marks | New uploads are locked | NOT RUN |

## CRCS opportunities

| ID | User action | Expected result | Status |
|---|---|---|---|
| BB-OPP-01 | CRCS posts opportunity | New opportunity card appears | PASS |
| BB-OPP-02 | CRCS edits opportunity | Changed values persist | PASS |
| BB-OPP-03 | Student saves phone and CGPA | Success message and saved profile | PASS |
| BB-OPP-04 | Student submits note/resume application | Application progress appears | PASS |
| BB-OPP-05 | Student withdraws | Withdrawn state appears | PASS |
| BB-OPP-06 | CRCS archives post-withdrawal opportunity | Archive succeeds with history retained | PASS after migration |
| BB-OPP-07 | CRCS offers/rejects/approves individual applicant | Status and required reason are visible | NOT RUN |
| BB-OPP-08 | CRCS imports CSV/XLSX and bulk updates applicants | Correct matches/status/errors | NOT RUN |
| BB-OPP-09 | Approved student views opportunities | Apply action is absent | PASS |

## Research internships

| ID | User action | Expected result | Status |
|---|---|---|---|
| BB-RES-01 | Faculty creates project | Project and success message appear | PASS |
| BB-RES-02 | Faculty edits project | Changed details persist | PASS |
| BB-RES-03 | Research student browses and applies | Faculty gets pending request | BLOCKED by BB-TRACK-04 |
| BB-RES-04 | Faculty approves/rejects | Application moves to CRCS or shows reason | BLOCKED by BB-TRACK-04 |
| BB-RES-05 | CRCS final decision | Student sees approved/rejected state | BLOCKED by BB-TRACK-04 |
| BB-RES-06 | Coordinator reassigns mentor | New mentor shown to student | NOT RUN |

## Faculty, documents, marks, and administration

| ID | User action | Expected result | Status |
|---|---|---|---|
| BB-FAC-01 | Direct mentor opens allocation/deadline/document/marks screens | Screens load without server error | PASS |
| BB-FAC-02 | Open/close student, file, and marks dialogs | Controls work without mutation | PASS |
| BB-FAC-03 | CRCS views approvals, templates, marks, analytics, people | Pages load without server error | PASS |
| BB-FAC-04 | Mentor allocation at 390px | No horizontal overflow | PASS |
| BB-FAC-05 | CRCS adds report template | Template appears in deadline/upload options | NOT RUN |
| BB-FAC-06 | Faculty saves marks | Totals persist and student uploads lock | NOT RUN |
| BB-ADM-01 | Superadmin adds/edits/deactivates/reassigns user | Data and dependent assignments update | NOT RUN |
| BB-ADM-02 | CRCS locks preferences and decides requests | Correct student status is visible | NOT RUN |

## Repeatable suites

| Test file | Coverage |
|---|---|
| `frontend/e2e/role-access.spec.js` | login, logout, roles, URL and track guards |
| `frontend/e2e/self-lifecycle.spec.mjs` | full self-internship lifecycle |
| `frontend/e2e/write-actions.spec.mjs` | opportunity CRUD, profile, resume, apply/withdraw/archive |
| `frontend/e2e/operations-regression.spec.mjs` | operational screens, dialogs, mobile layout |
| `frontend/e2e/research-lifecycle.spec.mjs` | research flow; captures current preference blocker |

Run all tests from `frontend` with `npm run test:e2e`.
