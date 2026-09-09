# Cycle Roster and Required-Document Design

Date: 2026-09-09

## Understanding summary

- Schools, departments, HODs, CRCS roles, coordinators, and university structure are fixed organisation data; cycles must reuse them rather than recreate them.
- Each cycle contains a roster of students and faculty. Fixed leadership roles gain their cycle access through organisation scope, not manual enrolment.
- CRCS must combine existing accounts from earlier cycles with newly created individual or bulk-imported accounts in one roster.
- Existing people must support individual search and server-side **all students/faculty** enrolment at university, school, or department scope.
- Bulk onboarding begins with an existing department selection; all rows inherit its department and school, then receive temporary credentials in a one-time download.
- CRCS uploads required cycle PDFs. Everyone with access to the cycle must explicitly agree before opening that cycle’s dashboard, even if they skip reading a document.

## Non-functional requirements and assumptions

- Directory operations must support 6,000+ users without loading a full directory into the browser. Counts and all-person enrolment execute server-side.
- Bulk operations are scoped, idempotent, auditable, and show rejected/duplicate rows without discarding successful rows.
- Password hashes are stored only server-side. The temporary-password file is generated/downloaded once and is never persisted by the application.
- Acknowledgements are durable by user, cycle, document, and document version. Replacing a document creates a new acknowledgement requirement.
- The current Open cycle must never be changed when creating or preparing another Draft.

## Decision log

| Decision | Alternatives considered | Reason |
| --- | --- | --- |
| One roster builder rather than separate onboarding tabs | Separate existing/new/import pages; bulk-first wizard | Keeps the mixed final roster visible and avoids repeated work. |
| Scope-driven enrolment | Free-text category/department fields | Uses trusted organisation hierarchy and preserves reporting quality. |
| Count and confirmation before all-person enrolment | Immediate add all | Avoids accidental enrolment of thousands of people. |
| Department-first bulk upload | Department code required in every row | Makes an intake file shorter and prevents hierarchy mismatches. |
| Downloadable temporary credentials | Activation email; both | Matches the agreed administrative onboarding process. |
| Required document acknowledgement gate | Reminder-only banner | Ensures every cycle participant formally agrees before working. |
| Roster/document additions stay open until a cycle is Closed, not just Draft (2026-09-09) | Draft-only editing, requiring a whole new cycle for latecomers | A cycle runs for weeks/months; new faculty joining a department or a late-admission student must be addable without CRCS fabricating a second cycle. Publish requirements (≥1 student, ≥1 faculty, ≥1 required doc) still apply only at publish time. |

## Final design

### Cycle roster builder

Step 2 is **Build the cycle roster**. The page always shows live counts for students, faculty, and import exceptions. The admin chooses an audience, then a scope: entire university, a school, or a department. Existing-person search remains available for precise additions. Bulk actions calculate their exact count on the server and show an explicit confirmation before enlisting all people in scope. The server resolves the people and writes enrolment/audit records without transferring the whole list to the browser.

Adding one person or importing a file uses the chosen department. New student and faculty accounts are automatically enrolled into the active draft. Bulk success rows include one-time credentials; duplicate and invalid rows are reported separately. The review area shows all enrolled people grouped by department and supports filters.

### Required cycle documents

Step 3 lets CRCS upload one or more PDFs and mark them required. At first access to a selected cycle, a blocking acknowledgement view lists every pending document. A person may open or skip a PDF, but can continue only after explicitly agreeing to all required current versions. Any newly uploaded/replaced required PDF becomes pending again. CRCS sees acknowledgement totals before and after publishing.

### Error handling and tests

Invalid scope combinations, inaccessible departments, duplicate enrolments, malformed import rows, and missing required documents return actionable errors. Publishing requires at least one student, one faculty member, and one required guideline PDF. Tests cover scoped counts, all-person confirmation, mixed roster creation, temporary credential generation, document acknowledgement, new-document re-acknowledgement, and dashboard blocking.
