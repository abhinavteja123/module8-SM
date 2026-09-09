# Internship Management Portal — Complete System Documentation

**Project:** Module 8 — Student Management / Internship Management Portal  
**Document status:** Implementation and operations guide  
**Last reviewed:** 9 September 2026  
**Audience:** CRCS Superadmins, CRCS Coordinators, School leadership, HODs, Faculty Coordinators, Faculty Mentors, support staff, developers, and QA teams.

---

## 1. What this system does

The Internship Management Portal manages an institution's internship programme from cycle setup through completion. It supports three student pathways:

1. **Research internship** — a student applies to a faculty-created research project.
2. **CRCS opportunity** — a student applies to an opportunity posted by CRCS.
3. **Self-internship** — a student submits an independently sourced company internship for review.

The portal has role-based workspaces, organisation-scoped reporting, approval workflows, document storage, mentor allocation, report deadlines, marks, analytics, notifications, locks, audit history, and a cycle-based operating model.

It is designed so that CRCS Superadmin owns programme configuration, while each department and school sees only the people and activity within its legitimate scope.

### Key business rules

- Every operational item belongs to an internship cycle.
- Only a CRCS Superadmin can create and publish a cycle, post/edit/archive opportunities, administer users/roles, define coordinator permissions, override marks, and configure programme-wide work.
- A rejection or revision request requires a meaningful reason. This is validated in both the user interface and backend API.
- Research and CRCS opportunity pathways are mutually exclusive once a student receives an offer/approval. Self-internship is intentionally independent of that exclusivity rule.
- A research project has a maximum capacity of four students. It remains open until full.
- Student, faculty, department, school, and programme access are enforced by the backend; hiding a menu item alone never grants or removes authority.
- Documents are stored in Supabase Storage and delivered by short-lived signed URLs rather than public object URLs.
- Sensitive actions are recorded in the audit log.

---

## 2. Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web client | React, Vite, React Router, TanStack Query | Role-aware dashboards, forms, validation feedback, selected-cycle context, responsive left sidebar. |
| API server | Node.js, Express | JWT authentication, role/scope checks, workflow validation, audit/notification writes, storage signing. |
| Database | Supabase Postgres | Organisation data, users/roles, cycles, applications, documents, marks, locks, analytics functions, audit history. |
| File storage | Supabase Storage | Resumes, offer letters, certificates, weekly reports, templates, and required cycle PDFs. |
| Authentication | Portal-issued JWT access and refresh tokens; bcrypt password hashes | Login, refresh, logout, protected API requests. |
| Validation | Zod on the API; form-level validation in React | Type checking, required reasons, UUID/date/value validation, safe bulk import processing. |
| Background checks | In-process Node schedules | Report-deadline reminders and programme analytics alert notifications, each checked at server start and hourly. |

### Request flow

```text
Browser → React route/role guard → Express API + Bearer access token
        → authentication + role/scope/lock checks → Supabase Postgres / Storage
        → audit-log and notification records → JSON response / signed file URL
```

The Supabase **service-role key is server-only**. It must never be placed in frontend source code, the Vite environment, screenshots, or browser requests.

---

## 3. Organisation hierarchy and access model

```text
University / programme
└── School
    └── Department
        ├── HOD
        ├── Faculty Coordinators
        ├── Faculty Mentors
        └── Students

CRCS Superadmin ─ system-wide programme owner
CRCS Coordinator ─ system-wide, but only for permissions explicitly granted by Superadmin
School Office / Dean ─ school-scoped oversight
```

Organisation records (schools and departments) are shared institutional data. They are not recreated for each internship cycle. Cycles enrol the relevant people from that hierarchy.

### Scope hierarchy

| Scope | Typical roles | Visible data |
| --- | --- | --- |
| System | CRCS Superadmin; permitted CRCS Coordinator | All enabled programme data permitted to that role. |
| School | Dean, School Office | Departments, faculty, students, allocations, analytics, and documents in their assigned school. |
| Department | HOD, Faculty Coordinator | People and operational data in their assigned department only. |
| Mentor | Faculty | Their projects and current mentees only. |
| Self | Student | Their own profile, applications, deadlines, documents, feedback, and marks only. |

The server derives scope from verified role assignments. A caller cannot pass a different school or department ID in a URL to expand their access.

---

## 4. Roles and permissions

### 4.1 CRCS Superadmin

The CRCS Superadmin is the programme owner. This is the only role with full operational authority.

- Creates draft cycles; builds a cycle roster; uploads required cycle PDFs; publishes the Open cycle.
- Creates, imports, updates, disables, removes, or changes roles for portal users.
- Assigns CRCS Coordinator permissions.
- Posts, edits, and archives CRCS opportunities.
- Reviews/finalises research and self-internship approvals.
- Reviews opportunity applicants, changes statuses, and assigns direct mentors after approval.
- Creates report templates and sees all student records, documents, marks, analytics, people, audits, and mentor allocations.
- Sets/clears preference locks and programme locks, decides unlock requests, and may override marks with an immutable override record.
- Must not remove their own role; the last active CRCS Superadmin cannot be removed.

### 4.2 CRCS Coordinator

A CRCS Coordinator is **not** a second Superadmin. The role is deliberately permission-based.

The Superadmin grants individual permissions such as:

- `view_opportunities`
- `view_research_approvals`
- `view_analytics`

The CRCS left sidebar only displays pages authorised for that coordinator, and protected backend endpoints enforce the same permission. A coordinator cannot silently reach a hidden feature by typing its URL.

### 4.3 Dean

The Dean is a school-scoped oversight role.

- Views school-level activity, analytics, workload, completions, and department comparisons.
- Does not approve student internship applications merely by being Dean.
- Cannot alter records outside the assigned school.

### 4.4 School Office

The School Office is a school-scoped operational/oversight role.

- Views the school overview and mentor allocation information for its school.
- Does not receive CRCS programme-administration rights unless separately assigned another role.

### 4.5 HOD

The HOD owns a single department’s visibility, not the normal student approval chain.

- Sees department-wide student, faculty, coordinator, mentor allocation, report, marks, and activity information.
- Uses department-scoped analytics and may manage department locks/unlock requests.
- Is an oversight and intervention role; HOD does **not** approve Research, CRCS Opportunity, or Self-internship applications in the default workflow.
- Cannot see another department’s records.

### 4.6 Faculty Coordinator

A Faculty Coordinator is a department-scoped coordinator for a subset of faculty, distinct from HOD.

- Sees their department’s operational view and assigned faculty relationships.
- Can reassign current research mentors when the workflow requires it.
- Sees mentor allocations and can manage locks/unlock requests within their department.
- Is not automatically a programme approver and cannot perform CRCS Superadmin actions.

### 4.7 Faculty Mentor

Faculty work in one of two modes:

| Faculty type | Main work |
| --- | --- |
| Research mentor | Creates research projects, reviews applications to those projects, supervises research mentees, records attendance/reports/marks. |
| Direct internship mentor (`mentorship_scope = crcs_self`) | Receives CRCS-assigned Opportunity or Self-internship students, manages deadlines, reviews documents, and awards marks. |

A faculty member can act only for their current assigned mentees. Reassignment updates the current assignment history; previous mentors do not retain the right to change the student's current records.

### 4.8 Student

- Completes and maintains their profile.
- Acknowledges required current cycle documents before entering the operational dashboard.
- Selects an internship pathway during the open preference window.
- Applies to research projects or CRCS opportunities, or submits a self-internship.
- Uploads application documents, reports, and a final certificate as required.
- Views decisions, rejection/revision reasons, feedback, mentor assignments, deadlines, and marks.
- Can request an unlock for their own locked student portal only.

---

## 5. Cycle model

### 5.1 Cycle states

| State | Meaning | Normal write behaviour |
| --- | --- | --- |
| `not_started` / Draft | Being configured by CRCS. | Superadmin may configure roster and required documents. Participants do not operate in it. |
| `open` | Current operational cycle. | Eligible work is allowed, subject to workflow status, dates, locks, and role. |
| `closed` | Historical cycle. | Read-only history; no new applications, uploads, approvals, or edits. |
| Archived | Retained for audit/reporting. | Historical/read-only; not a live operating cycle. |

Publishing a draft opens it and closes an already open cycle. The normal system therefore has one active Open cycle at a time.

### 5.2 Selected-cycle context

The shared top-right cycle selector persists the choice as:

```text
?cycle=<cycle-uuid>
```

It refreshes cycle-scoped data without changing records from another cycle. Superadmins can select drafts and history; users only see cycles that are inside both their organisational scope and enrolment/role context. Historical data remains viewable where the role allows it, but is not editable.

### 5.3 Cycle setup journey (Superadmin)

1. **Create draft** — set name, batch/cohort, dates, and programme context.
2. **Build roster** — add existing students/faculty by search or server-counted scope (university, school, department); create individuals; or bulk-import accounts.
3. **Set responsibility and guidance** — establish the cycle’s participating people, categories/cohorts, and shared guidelines.
4. **Upload required PDFs** — one or more versioned PDF guidelines/agreements can be marked required.
5. **Review and publish** — publishing requires at least one student, one faculty member, and one required PDF.

The roster and required documents may still be updated while a cycle is Open to handle late admissions or new faculty. Once Closed, they cannot be changed.

### 5.4 Participant onboarding and imports

- Existing accounts can be reused across cycles without recreating their organisation record.
- The roster builder supports focused search and a server-side **Add all** operation; it does not send a full institutional directory to the browser.
- Bulk onboarding is department-first: the operator selects the trusted department, then imports spreadsheet rows that inherit that department/school.
- Success rows can provide a one-time temporary-password CSV. Password hashes are never returned or stored in application records.
- Duplicate/invalid rows are reported without discarding valid rows.
- Enrolment operations are scoped, idempotent, and audited.

### 5.5 Required guideline acknowledgement

Required cycle PDFs are versioned. At first access to a cycle, relevant users see a blocking acknowledgement screen until they explicitly agree to each current required document.

- Replacing a required document creates a new acknowledgement requirement.
- The acknowledgement records include user, cycle, document, and document version.
- CRCS Superadmin is exempt so they can configure documents before normal dashboard access.
- The implemented gate applies to students, faculty, faculty coordinators, and HODs. Dean and School Office treatment is a pending policy decision; see the operational notes section.

---

## 6. Student path selection and exclusivity

Students select one preference in the open cycle:

- `research`
- `crcs_opportunity`
- `self_internship`

The Superadmin can lock preference changes. A student who needs a change after locking submits a request; the Superadmin reviews it and records the result.

### Exclusivity rules

| Situation | Result |
| --- | --- |
| Faculty approves a research application | Competing active Research applications are closed/revoked automatically. |
| CRCS offers/approves an opportunity | Competing Research/CRCS opportunity route is blocked/closed as applicable. |
| Student is approved in Research or CRCS Opportunity | Further active Research/CRCS Opportunity applications are prevented. |
| Student submits Self-internship | Allowed alongside the other pathway decision process by the stated business rule. |

The API checks this rule at write time, so it cannot be bypassed by stale browser data or direct requests.

---

## 7. Workflow: Research internship

### 7.1 Project management

Research-capable faculty create projects with a title, description, eligibility/context, and capacity. The platform uses a maximum capacity of **four students per project**.

Faculty can edit or delete their own project while policy/status permits. A locked faculty-project workspace prevents project creation, editing, deletion, and application-decision actions.

### 7.2 Student application flow

```text
Student selects Research
  → browses eligible faculty projects
  → applies to one or more projects
  → Faculty Mentor decision
      ├─ Reject: mandatory reason shown to student
      └─ Approve: competing research applications revoked automatically
          → CRCS final decision
              ├─ Reject: mandatory reason shown to student
              └─ Approve: research internship confirmed and mentor assignment active
```

Students retain visibility of their entire research-application history: pending, faculty-approved/CRCS-pending, approved, rejected, revoked, and closed applications.

### 7.3 During internship

- Current mentor sees allocated research students.
- Mentor may record attendance and supervise weekly reports, synopsis, final report, presentation, and viva work.
- Students upload reports and receive comments or verified/revision status.
- Faculty Coordinator can reassign a current research mentor where authorised. Reassignment records the old assignment, replacement, reason, actor, and time.
- Faculty enters marks for their current mentee; CRCS Superadmin may override a mark with an immutable override log.

---

## 8. Workflow: CRCS opportunities

### 8.1 Opportunity management

CRCS Superadmin manages the opportunity catalogue for an Open cycle.

An opportunity can include:

- title and organisation name;
- rich description and eligibility guidance;
- optional minimum CGPA (0–10);
- optional application deadline;
- optional external application URL;
- applicant questions/application answers;
- active/archive status.

Editing preserves the audit history. Archiving is preferred over permanent deletion when applications exist, preserving applicant history and reporting. Legacy database compatibility is retained only while the checked-in enhancement migration has not yet been applied; production should apply all migrations.

### 8.2 Student application flow

```text
Student selects CRCS Opportunity
  → sees active, non-expired opportunities for selected cycle
  → supplies optional answers and resume/documents where required
  → applies
  → may withdraw while workflow permits
  → CRCS reviews application
      ├─ Reject: mandatory reason
      ├─ Under review
      ├─ Offer
      └─ CRCS approved
          → CRCS assigns eligible direct mentor
          → internship active under assigned mentor
```

The CRCS opportunity manager exposes an opportunity’s full applicant list. For each applicant, authorised CRCS users can inspect supplied answers, resume/attachments via signed links, application status, decision reason, and mentor assignment. Bulk status updates and spreadsheet imports are supported for operational administration.

### 8.3 Mentor allocation

Only faculty with `mentorship_scope = crcs_self` are eligible direct mentors. The system calculates current allocation load across CRCS Opportunities and Self-internships and only presents mentors below the implemented allocation limit (five active allocations).

---

## 9. Workflow: Self-internship

### 9.1 Submission and review

```text
Student selects Self-internship
  → submits company, role, duration, location and internship details
  → uploads required company profile and/or offer letter
  → assigned Faculty Mentor review
      ├─ Revision/reject: mandatory reason
      └─ Approve
          → CRCS final review
              ├─ Reject: mandatory reason
              └─ Approve: self-internship becomes active
                  → CRCS assigns a direct mentor when needed
```

Students can re-upload corrected supporting documents. A re-submission after a rejected supporting record can return it to submitted status, enabling a clear correction loop instead of requiring a new internship record.

### 9.2 Completion

During an active self-internship, the student submits reports; the current assigned mentor reviews them and awards marks. At completion, the student uploads the certificate, and CRCS verifies final completion according to the programme workflow.

---

## 10. Shared mentoring, reports, and marks

### 10.1 Mentor allocations

The Mentor Allocations view unifies active students across Research, CRCS Opportunity, and Self-internship paths. It supports:

- current mentor and track visibility;
- student search and type/status filters;
- mentor capacity indicators;
- direct-mentor assignment for CRCS-managed tracks;
- current/reassigned history for Research;
- role-scoped visibility for faculty, coordinator/HOD, school office/dean, and CRCS.

### 10.2 Report templates and deadlines

CRCS Superadmin creates reusable report templates/types. Assigned mentors create deadlines for their current active students.

| Feature | Behaviour |
| --- | --- |
| Student deadlines | Student sees their own due dates through `GET /report-deadlines/my`. |
| Mentor queue | Mentor sees deadlines assigned by them through `GET /report-deadlines/assigned`. |
| Reminder | The backend notifies the student during the 48 hours before a deadline, once per deadline. |
| Late operational freeze | After a faculty-created deadline passes, a subsequent assignment/review or marks edit can create the applicable faculty lock automatically. |

### 10.3 Documents and review

Students upload documents to the configured Supabase Storage bucket. The system stores metadata in the `documents` table and returns signed URLs for authorized display/download.

Supported uses include:

- opportunity resume/application material;
- self-internship company profile, offer letter, and certificate;
- weekly/midterm/synopsis/final reports;
- report templates and required cycle PDFs.

Document reviewers can:

- leave a non-empty feedback comment;
- mark a document `verified`;
- request a revision; **revision comment/reason is mandatory**.

Faculty can only review current mentees’ documents. CRCS can review broader authorised records. HOD, coordinator, dean, and school office visibility is scoped to their organisational area and is not an editing grant.

### 10.4 Marks

The supported mark fields are:

- weekly report score;
- mid marks;
- synopsis marks;
- thesis marks;
- presentation (PPT) marks;
- viva marks.

Faculty can write marks only for a student they currently mentor in the selected cycle. CRCS Superadmin can override a single field, and the application records the old value, new value, actor, and time in `marks_override_log` plus the audit log.

---

## 11. Portal locks and unlock exceptions

Portal locks are operational controls distinct from the cycle preference lock.

### 11.1 Lock types

| Lock | What it blocks |
| --- | --- |
| `student_portal` | Profile changes, preference/questionnaire changes, applications, withdrawals, application-detail changes, uploads, and certificate submission. Read access remains available. |
| `faculty_projects` | Research project create/edit/delete and faculty application decisions; new applications to that faculty’s projects are also blocked. |
| `faculty_assignments` | Mentor assignment/deadline/review workspace changes. |
| `faculty_marks` | Marks changes. |

CRCS Superadmin and CRCS Coordinator have programme-wide lock access. HOD and Faculty Coordinator can operate the same controls only for people in their department.

### 11.2 Lock lifecycle

```text
Manager locks person or eligible cycle audience
  → affected student/faculty receives locked response (HTTP 423) on a protected write
  → affected person submits a reasoned unlock request
  → authorised manager approves or rejects it
      ├─ approve: unlock only that specific lock
      └─ reject: lock remains
  → every step is auditable
```

The people picker searches active users after at least two characters and supports name, email, and student roll number lookup. It limits results and caches searches on the client, avoiding directory-scale browser downloads. The bulk cycle operation resolves people and writes lock/audit rows atomically in the database.

### 11.3 Automatic deadline lock

When a report deadline assigned by a faculty member has passed, the next attempt to edit protected faculty assignment/review or marks work can materialise a faculty lock automatically. This forces the same explicit unlock-request and audit workflow rather than permitting unrecorded late editing.

---

## 12. Analytics, records, notifications, and audit history

### 12.1 Programme analytics

Analytics is cycle-aware and role-scoped. The API does not accept arbitrary department/school filters from the browser; scope comes from the authenticated role.

The analytics overview covers programme health such as:

- pending reviews;
- overdue reports;
- missing required-document acknowledgements;
- unassigned active internships;
- duplicate active applications;
- missing cycle enrolment;
- mentor capacity risk;
- pending unlock requests;
- inconsistent workflow statuses.

Authorised users can open a drill-down queue (up to 500 rows) and export:

| Export | Availability |
| --- | --- |
| Overview CSV | Yes |
| Overview PDF | Yes; intentionally concise/self-describing metrics. |
| Detailed queue CSV | Yes |
| Detailed queue PDF | Intentionally not available; CSV is more useful for record-level data. |

### 12.2 Student records and People

CRCS Superadmin can view filterable student records and all people. The records view includes profile context, chosen pathway, approval stage, report progress, document metadata, and signed file links. The People view provides an inline application/approval summary and a detail view for pathway, reports, and uploaded files.

### 12.3 Notifications

The portal creates in-app notifications for key workflow events, including document feedback/revision, upcoming report deadlines, and programme alerts.

- Deadline notification sweep: on startup and hourly; sends once per deadline when due in the next 48 hours.
- Analytics alert sweep: on startup and hourly; notifies Superadmins about positive-count alerts such as overdue reports, capacity risk, and pending reviews.
- Analytics alert delivery has a deduplication record to prevent repeated same-day notifications for the same observed alert count.

### 12.4 Audit log

Audit rows preserve who performed a material action, the role used, entity type/id, prior/new values where applicable, and the timestamp. Examples include:

- opportunity post/edit/archive;
- approval decisions and mandatory reasons;
- document comments and review status;
- mentor reassignments and user removal replacements;
- role and coordinator-permission changes;
- mark overrides;
- locks, automatic locks, unlock requests, and unlock decisions;
- cycle and roster operations.

The audit-log API is restricted to CRCS Superadmin and supports entity type/entity ID filtering.

---

## 13. Frontend workspaces and navigation

The portal uses a persistent **left sidebar**, not a top navigation menu. The common shell includes the selected-cycle switcher and user/logout controls.

| Workspace | Main navigation |
| --- | --- |
| Student | Chosen pathway dashboard, My Profile, Internship Preference, My Documents. |
| Faculty Research | My research projects, Applications to review, My mentored students, Review reports, Set deadlines, Enter marks. |
| Faculty Direct Mentor | My allocated students, Set report deadlines, Review reports, Award marks. |
| Coordinator / HOD / Dean | Overview; School Overview for Dean; Reassign Student Mentors for Faculty Coordinator; Mentor Allocations for appropriate scoped roles; Department Locks for HOD/Faculty Coordinator. |
| CRCS | Permission-scoped Opportunities and Research Approvals for Coordinators; Superadmin additionally sees Overview, Mentor Allocations, Report Types, Student Records, Student Marks, Programme Analytics, All People, and Cycle Setup. |

The router protects role areas and student-path pages. A signed-in user who manually navigates to another role’s route is redirected, while the API independently returns `403` for unauthorized data/actions.

---

## 14. API reference

### 14.1 General conventions

Base URL in local development:

```text
http://127.0.0.1:4000/api
```

Protected requests use:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

Most endpoints return JSON. File uploads use `multipart/form-data`. List endpoints return arrays unless documented as an object with contextual data.

### 14.2 Standard response behaviour

| Status | Meaning |
| --- | --- |
| `200` | Successful read/update. |
| `201` | Resource created. |
| `204` | Deleted/archived action completed with no response body. |
| `400` | Invalid input, missing required value, expired deadline, or malformed import. |
| `401` | Missing/invalid/expired authentication token. |
| `403` | Authenticated but wrong role, scope, or ownership. |
| `404` | Resource not found. |
| `409` | Conflict: duplicate/competing application, wrong workflow state, last Superadmin, etc. |
| `423` | Student/faculty workspace is locked. Response includes lock context. |

Validation errors are returned as an `error` field; Zod schema failures may include field-level details. The frontend displays these instead of silently reloading.

### 14.3 Authentication

| Method/path | Purpose | Access |
| --- | --- | --- |
| `POST /auth/register` | Controlled registration flow where enabled by policy. | Public route, but portal onboarding currently uses administrator-created accounts. |
| `POST /auth/login` | Login with email/password. | Public |
| `POST /auth/refresh` | Exchange refresh token for a fresh access token. | Refresh token |
| `POST /auth/logout` | End portal session. | Authenticated |

Example login:

```json
POST /api/auth/login
{
  "email": "user@university.edu",
  "password": "user-password"
}
```

The browser uses the returned access token for API calls and refreshes it when appropriate. A bad password now returns a visible error rather than causing a silent redirect.

### 14.4 Organisation and profile

| Method/path | Purpose | Main access |
| --- | --- | --- |
| `GET, POST /schools` | List/create schools. | Authenticated / admin policy |
| `GET, POST /departments` | List/create departments. | Authenticated / admin policy |
| `GET /users/me` | Current authenticated identity and roles. | Authenticated |
| `GET /students/me/profile` | Current student profile. | Student |
| `PATCH /students/me/profile` | Update student profile, unless student portal locked. | Student |

### 14.5 Cycles, rosters, guidance, and selections

| Method/path | Purpose |
| --- | --- |
| `GET /cycles` | Scoped selectable cycle list. |
| `GET /cycles/current` | Current Open cycle context. |
| `GET /cycles/:id/summary` | Cycle summary/counts. |
| `POST /cycles` | Create a draft cycle (Superadmin). |
| `PATCH /cycles/:id/guidelines` | Update shared cycle guidelines. |
| `GET /cycles/people/count` | Server-side count before scoped Add all. |
| `GET /cycles/people` | Focused person search for roster builder. |
| `GET /cycles/:id/participants` | Current cycle roster. |
| `POST /cycles/:id/participants` | Add participant(s)/individual import flow. |
| `POST /cycles/:id/participants/select-all` | Atomically enrol selected scoped audience. |
| `POST /cycles/:id/publish` | Validate and publish draft. |
| `GET /cycle-documents/:cycleId` | List guideline PDFs. |
| `GET /cycle-documents/:cycleId/status` | Current user acknowledgement status. |
| `GET /cycle-documents/:cycleId/progress` | Superadmin acknowledgement progress. |
| `POST /cycle-documents/:cycleId` | Upload versioned cycle PDF. |
| `PATCH /cycle-documents/:cycleId/:documentId` | Update/replace document metadata/version. |
| `POST /cycle-documents/:cycleId/:documentId/acknowledgements` | Explicit agreement to current document version. |
| `GET, POST /students/me/track-selection` | Read/select pathway. |
| `POST /students/me/questionnaire` | Save student questionnaire information. |
| `GET /students/me/internship-status` | Student’s current pathway/status summary. |

### 14.6 Research

| Method/path | Purpose |
| --- | --- |
| `GET /research/my-mentor-profile` | Determine research/direct mentor scope. |
| `GET, POST /research/projects` | Browse/create projects. |
| `PATCH, DELETE /research/projects/:id` | Edit/delete own project, respecting locks. |
| `GET /research/applications` | Faculty/CRCS application queue according to role and scope. |
| `POST /research/applications` | Student applies to project. |
| `PATCH /research/applications/:id/faculty-decision` | Faculty approve/reject; rejection requires reason. |
| `PATCH /research/applications/:id/crcs-decision` | CRCS final approve/reject; rejection requires reason. |
| `GET /research/mentees` | Current mentor’s research students. |
| `GET /research/mentor-assignments` | Assignment history/queue. |
| `POST /research/mentor-assignments/:id/reassign` | Authorised coordinator reassignment. |
| `POST /research/attendance` | Record research attendance. |
| `GET /research/dashboard/:student_id` | Research dashboard/status for permitted viewer. |

### 14.7 CRCS opportunities

| Method/path | Purpose |
| --- | --- |
| `GET /opportunities` | Active opportunity catalogue. |
| `POST /opportunities` | Post opportunity (Superadmin). |
| `PATCH, DELETE /opportunities/:id` | Edit/archive or safely delete opportunity. |
| `GET /opportunities/:id` | Opportunity detail and authorised applicant information. |
| `GET /opportunities/my-applications` | Student’s applications. |
| `POST /opportunities/:id/apply` | Apply with optional answers. |
| `PATCH /opportunities/applications/:id/withdraw` | Withdraw application where allowed. |
| `GET /opportunities/applications` | CRCS applicant queue. |
| `PATCH /opportunities/applications/:id/details` | Update reviewable applicant detail. |
| `PATCH /opportunities/applications/:id/status` | Update status; rejection requires reason. |
| `PATCH /opportunities/applications/:id/mentor` | Assign eligible direct mentor after approval. |
| `GET /opportunities/mentor-options` | Available direct mentors with allocation load. |
| `POST /opportunities/applications/bulk-import` | Import application data. |
| `PATCH /opportunities/applications/bulk-status` | Bulk status decision/update. |

### 14.8 Self-internships

| Method/path | Purpose |
| --- | --- |
| `GET, POST /self-internships` | List/create current student self-internship. |
| `GET /self-internships/:id` | Detail, scoped to participant/reviewer. |
| `PATCH /self-internships/:id/mentor` | Assign direct mentor. |
| `PATCH /self-internships/:id/mentor-decision` | Faculty decision; rejection requires reason. |
| `PATCH /self-internships/:id/crcs-decision` | CRCS decision; rejection requires reason. |
| `PATCH /self-internships/:id/certificate` | Upload/associate completion certificate. |
| `GET /self-internships/mentor-options` | Eligible direct mentor options. |

### 14.9 Documents, deadlines, allocations, and marks

| Method/path | Purpose |
| --- | --- |
| `GET, POST /report-templates` | Manage report templates. |
| `POST /documents/upload` | Upload report/application/certificate document. |
| `GET /documents` | List signed document records subject to scope. |
| `PATCH /documents/:id/comment` | Mentor/CRCS feedback comment. |
| `PATCH /documents/:id/review` | Verify or request revision; revision requires comment. |
| `GET /report-deadlines/my` | Student deadlines. |
| `GET /report-deadlines/assigned` | Faculty-created deadlines. |
| `POST /report-deadlines` | Create deadline for current mentee. |
| `GET /mentor-allocations` | Unified mentor allocation view. |
| `GET /marks` | Programme marks list (Superadmin). |
| `GET /marks/:student_id` | Scoped marks view. |
| `PUT /marks/:student_id` | Current mentor enters marks. |
| `PATCH /marks/:student_id/override` | Superadmin overrides a field with audit trail. |

### 14.10 Administration, locks, permissions, and audit

| Method/path | Purpose |
| --- | --- |
| `GET, POST /admin/users` | Manage user directory/onboarding. |
| `POST /admin/users/bulk` | Bulk user import. |
| `PATCH /admin/users/:id` | Update user information/status. |
| `PATCH /admin/users/:id/roles` | Change role/scope assignments. |
| `GET /admin/users/:id/dependencies` | Check active mentee/coordinator dependencies before removal. |
| `POST /admin/users/:id/remove` | Deactivate user; requires replacement where needed. |
| `GET /admin/preferences` | View preference lock/change requests. |
| `PATCH /admin/cycles/:id/preference-lock` | Lock/unlock track changes. |
| `GET /admin/locks` | Scoped lock directory. |
| `GET /admin/locks/people?type=&q=` | Search people for lock picker. |
| `POST /admin/locks/bulk-cycle` | Atomic scoped cycle-wide lock/unlock. |
| `GET /admin/locks/audit` | Lock-specific audit history. |
| `GET /admin/locks/me` | Student/faculty current own locks and requests. |
| `POST /admin/locks/:id/unlock-requests` | Submit self unlock request with reason. |
| `GET /admin/unlock-requests` | Scoped pending unlock requests. |
| `PATCH /admin/unlock-requests/:id` | Approve/reject unlock request. |
| `PATCH /admin/locks/:lockType/:subjectId` | Set individual lock state. |
| `PATCH /admin/preference-change-requests/:id` | Decide locked-preference request. |
| `GET /admin/student-records` | CRCS student oversight records. |
| `GET /admin/crcs-coordinator-permissions/me` | Current coordinator grants. |
| `PUT /api/admin/crcs-coordinator-permissions/:user_id` | Superadmin sets coordinator grants. |
| `GET /admin/audit-log` | Programme audit log (Superadmin). |

### 14.11 Analytics

| Method/path | Purpose |
| --- | --- |
| `GET /analytics/overview?cycle_id=<uuid>` | Scoped cycle KPI and alerts. |
| `GET /analytics/drilldown?cycle_id=<uuid>&metric=<key>&limit=100` | Scoped underlying queue. |
| `GET /analytics/export?cycle_id=<uuid>&view=overview&format=csv` | CSV/PDF overview or detailed CSV export. |
| `GET /analytics/department/:department_id` | Legacy department endpoint; validates ownership. |
| `GET /analytics/school/:school_id` | Legacy school endpoint; validates ownership. |
| `GET /analytics/system` | Legacy system endpoint for Superadmin. |

New integrations should use the mandatory-cycle endpoints (`overview`, `drilldown`, `export`) rather than legacy endpoints.

---

## 15. Database and storage model

The original schema plus chronological migrations are in `backend/db/schema.sql` and `backend/db/migrations/`.

### Core entities

| Domain | Important records |
| --- | --- |
| Identity/organisation | `users`, `user_roles`, `students`, `faculty`, `schools`, `departments`, faculty coordinator assignments. |
| Cycle setup | `internship_cycles`, `cycle_participants`, cycle guidelines/documents, acknowledgements. |
| Preference/workflow | `student_track_selections`, preference change requests, research projects/applications, CRCS opportunities/applications, self internships. |
| Mentoring | `mentor_assignments`, mentor assignment audit/history, faculty mentorship scope. |
| Documents | `documents`, `report_templates`, `report_deadlines`. |
| Assessment | `marks`, `marks_override_log`. |
| Governance | `portal_locks`, `portal_unlock_requests`, `crcs_coordinator_permissions`, `audit_log`, notifications, analytics alert deliveries. |

### Storage

The configured bucket defaults to `documents`. Objects are uploaded through the backend and accessed through generated signed URLs. Do not make the bucket publicly readable merely to make downloads convenient; that would bypass user/role/scope checks.

---

## 16. Security and validation controls

1. **Passwords:** stored as bcrypt hashes; never store or log plaintext credentials.
2. **JWTs:** short-lived access token plus refresh token. Configure strong, unique secrets outside source control.
3. **Backend authorization:** `requireAuth`, `requireRole`, organisation-scope checks, ownership checks, current-mentor checks, and `requireCrcsPermission` are applied at API boundaries.
4. **Cycle authorization:** closed/invalid cycles reject write actions; selected-cycle visibility is scoped.
5. **Workflow validation:** state transitions, duplicates, competing internship restrictions, capacity, deadlines, and required decision reasons are backend-validated.
6. **Lock enforcement:** protected mutations check student/faculty lock state; locked actions return `423` with actionable context.
7. **File access:** signed URLs are generated only after record-level scope checks.
8. **Input validation:** Zod schemas validate user/admin request bodies, IDs, booleans, enum values, URLs, dates, numbers, and reason length.
9. **Auditing:** material privileged decisions write immutable contextual records.
10. **Bulk safety:** server-side scope resolution, duplicate checks, explicit count/confirmation UX, and atomic bulk lock operations avoid unbounded client directory exposure.

### RLS caution

Supabase has reported RLS disabled for `public.student_preference_change_requests` and `public.report_deadlines`. Do not enable RLS impulsively: the server uses a service-role architecture and any RLS policy must be designed and tested against all protected paths first. Track this as a planned security hardening item.

---

## 17. Local installation and operation

### 17.1 Prerequisites

- Node.js LTS and npm
- A Supabase project with the required database migrations applied
- Supabase Storage bucket for documents
- Chromium installed for browser testing when needed

### 17.2 Environment variables

Create `backend/.env` from `backend/.env.example`. Do not commit actual values.

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
SUPABASE_STORAGE_BUCKET=documents
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-a-different-long-random-secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
PORT=4000
```

### 17.3 Start the project

Backend:

```powershell
Set-Location "C:\Users\ABHINAV TEJA\Downloads\module8-SM\backend"
npm install
npm run dev
```

Frontend:

```powershell
Set-Location "C:\Users\ABHINAV TEJA\Downloads\module8-SM\frontend"
npm install
npm run dev -- --host 127.0.0.1
```

Local endpoints:

```text
Frontend: http://127.0.0.1:5173
Backend:  http://127.0.0.1:4000
Health:   http://127.0.0.1:4000/api/health
```

### 17.4 First real Superadmin

The system does not rely on demo data for production administration. Bootstrap the first actual Superadmin once:

```powershell
Set-Location "C:\Users\ABHINAV TEJA\Downloads\module8-SM\backend"
$env:BOOTSTRAP_ADMIN_EMAIL = "admin@university.edu"
$env:BOOTSTRAP_ADMIN_PASSWORD = "use-a-strong-unique-password"
$env:BOOTSTRAP_ADMIN_NAME = "CRCS Administrator"
npm run bootstrap:admin
```

The bootstrap command refuses incomplete values and refuses to create another first admin once a Superadmin exists. After login, the Superadmin onboards other roles through Cycle Setup / People administration.

### 17.5 Database migration order

Apply all files in `backend/db/migrations/` in date/name order. Important feature groups are:

| Migrations | Feature group |
| --- | --- |
| `20260907000001`–`00009` | Opportunity management, detailed applications, preference control, report deadlines, post-approval mentor allocation, School Office, mentorship scope. |
| `20260908000010`–`00011` | All-track deadlines and self-internship application details. |
| `20260909000012`–`00015` | Lock registry, unlock exceptions, search indexes, atomic bulk cycle locks. |
| `20260909000016`–`00018` | Cycle participants, cycle guidelines, versioned required PDFs/acknowledgements. |
| `20260909000019`–`00020` | Cycle analytics and analytics-alert notification delivery. |

Do not skip later migrations: the backend contains limited temporary compatibility fallbacks, but complete production behaviour requires the full migration set.

### 17.6 Optional disposable QA data

The repository contains development seed commands only. They must not be run in production:

```powershell
npm run seed
npm run seed:cycles
```

`seed:cycles` is idempotent and intentionally does not replace the currently Open cycle, but it still creates test records and is unsuitable for a live institutional database.

---

## 18. Testing and QA

### Automated checks

```powershell
# Backend flow/static/database-invariant checks
Set-Location "C:\Users\ABHINAV TEJA\Downloads\module8-SM\backend"
npm test

# Frontend production build
Set-Location "C:\Users\ABHINAV TEJA\Downloads\module8-SM\frontend"
npm run build

# Browser suite
npx playwright install chromium
npm run test:e2e
```

The Playwright coverage is organised across five suites / 24 browser cases, including role access, self-internship lifecycle, research lifecycle, write actions, and operations regressions. Disposable browser records are cleaned up after completed test runs.

### Confirmed end-to-end scenarios

- Authentication failure visibly reports an error; anonymous users are redirected away from protected workspaces.
- Cycle draft setup, hierarchy-first roster creation, required-PDF acknowledgement, and publish preconditions.
- Research: project creation → application → faculty decision → CRCS decision → mentoring/report work.
- Self-internship: submission → rejection with reason → corrected re-upload → approval → mentor allocation → deadline/report/feedback.
- Opportunity: post → student application with optional resume → withdrawal → edit → archive → applicant review and status changes.
- Mentor allocation UI, capacity signals, direct mentor workflow, document review, and marks.
- Role/scope enforcement for CRCS, HOD, Dean, coordinator, faculty, and student views.
- Lock/search/bulk-lock and unlock request/decision flow.
- Analytics dashboard interactions, drill-down metric mapping, export behaviour, and responsive/table-scroll checks.

The detailed black-box inventory is in [BLACK_BOX_TEST_CASES.md](BLACK_BOX_TEST_CASES.md), and the current session summary is in [SESSION_HANDOFF.md](SESSION_HANDOFF.md).

---

## 19. Operational checklist for CRCS Superadmin

### Before a new cycle opens

- [ ] Confirm schools, departments, HODs, faculty coordinators, faculty, and student records are correct.
- [ ] Create the Draft cycle with correct dates/batch details.
- [ ] Build and verify the student/faculty roster.
- [ ] Ensure direct mentors have the correct mentorship scope.
- [ ] Set the CRCS Coordinator permissions required for that cycle.
- [ ] Upload required, current PDF guidelines and agreements.
- [ ] Verify that at least one student, one faculty member, and one required PDF exist.
- [ ] Configure opportunity/research/report rules and publish the cycle.

### While the cycle is open

- [ ] Review research and self-internship decision queues; include a reason for every rejection.
- [ ] Post and maintain CRCS opportunities; archive instead of destroying items with history.
- [ ] Monitor mentor capacity and assign direct mentors after CRCS approval.
- [ ] Review overdue reports, missing acknowledgements, unlock requests, and analytics alerts.
- [ ] Use scoped locks only when justified; include a reason and resolve exception requests promptly.
- [ ] Review audit history before making sensitive corrections or removals.

### At cycle close

- [ ] Ensure final reports, certificates, reviews, and marks are complete.
- [ ] Resolve outstanding rejected/revision and unlock items.
- [ ] Export required analytics/record reports.
- [ ] Close the cycle only after confirming no further write work is required.
- [ ] Preserve the cycle as historical evidence; do not delete data to simulate a new cycle.

---

## 20. Known policy decisions and maintenance notes

1. **Guideline gate scope:** the implemented acknowledgement gate explicitly covers students, faculty, faculty coordinators, and HODs. Decide whether Dean and School Office should also acknowledge cycle PDFs, then update both policy and code/test coverage consistently.
2. **RLS:** the current server-side service-role design works, but the two reported RLS-disabled tables require a deliberate policy design before enabling RLS.
3. **Dependency advisories:** review and schedule non-breaking upgrades for reported moderate transitive advisories. Do not force major upgrades during an active cycle without regression testing.
4. **Background notifications:** reminders and analytics alerts run inside the Express process. In multi-instance production, move them to one elected worker or a scheduled job to avoid duplicate execution (database deduplication protects analytics alerts, but scheduler ownership is still preferable).
5. **Production email/SMS:** current notifications are in-app. Add an approved delivery integration only after defining notification consent, retry, data retention, and escalation policy.
6. **Backups and retention:** Supabase backups, storage retention, signed URL duration, audit retention, and bulk-import credential handling must be configured according to institutional policy.

---

## 21. Documentation maintenance

This file is the primary end-to-end implementation guide. Update it whenever a role, workflow status, API contract, migration, storage policy, route, or operational rule changes.

When implementing a new feature, update all applicable items together:

1. database migration and data model;
2. API validation/authorization and endpoint reference;
3. frontend role navigation and user flow;
4. audit/notification impact;
5. automated and browser QA cases;
6. this document and `SESSION_HANDOFF.md`.

That keeps the portal’s business rules, implementation, and handoff information aligned.
