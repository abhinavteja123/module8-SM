# Analytics QA Plan

The operational-intelligence release is cycle-scoped. A report is correct only when its `cycle_id`, server-derived scope, definitions, calculation time, and drill-down rows all refer to the same selected cycle.

## Automated checks

- `node --test test/analytics-contract.test.mjs` from `backend` checks the API contract, mandatory UUID `cycle_id`, server-side scope derivation, response metadata, parameter constraints, and selected-cycle React Query behaviour.
- `npm run test:e2e -- analytics-cycle-contract.spec.mjs` from `frontend` verifies the CRCS page sends `cycle_id` on its overview request and sends a new request when the global cycle selector changes. It skips when the environment has fewer than two CRCS-visible cycles; run `npm run seed:cycles` in a disposable QA environment first.

## Manual acceptance checks

1. Sign in as a CRCS Superadmin, dean, HOD/faculty coordinator, faculty mentor, and student. For each account, request an overview, drill-down, and export with a known cycle. Verify that server results contain only permitted people and no caller-supplied school/department ID changes that scope.
2. For a metric card, compare its numerator, denominator, exclusions, definition, `calculated_at`, and drill-down row count. Export the same view and confirm its rows match the scoped drill-down.
3. Change from an open cycle to a draft and closed cycle. Verify all figures, alerts, download content, and details refresh; historical cycles remain read-only.
4. Seed a known anomaly for each data-quality category (unenrolled student, missing cycle, incompatible status, duplicate active application, missing evidence). Verify it appears only to permitted staff and links to a scoped corrective-action list.
5. Verify small-cohort suppression in every chart, drill-down, export, saved filter, and alert. Suppressed aggregates must not expose a reconstructable individual count.
6. Force SLA, mentor-capacity, and approval-backlog thresholds. Confirm each creates one actionable alert, links to the appropriate scoped queue, and does not repeatedly notify after acknowledgement unless the state changes.

## Test data and cleanup

Use disposable records prefixed `E2E Analytics <timestamp>`. Remove their applications, assignments, documents, marks, analytics events, alerts, audit records, roster memberships, and user accounts in dependency order after browser runs. Do not run seed scripts against production.
