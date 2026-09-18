# Frontend Design Upgrade — Full Spec

Date: 2026-09-17
Scope: `frontend/` only (React + Tailwind, Internship Management Portal). No backend endpoint changes, no React Query key/prop/route/permission-gate changes anywhere in this scope. Restyle + shared-component additions + motion, not a rewrite.

## 0. Why / constraints

- Current UI is default Tailwind indigo/slate, empty `tailwind.config.js theme.extend`, no toast/skeleton/dialog primitives (14 pages hand-roll their own `fixed inset-0` modal), no icon library, no motion library.
- ~60 page components across 8 role layouts (Student, Faculty, Coordinator/HOD/Dean/School Office, CRCS). Too large for one diff — phased rollout, commit per phase.
- Hard rule carried through every phase: **restyle only**. No renames of query keys, props, routes, or permission checks. No behavior changes to existing save/validation logic (e.g. marks total-exclusion rules, cycle-guideline scroll-lock, lock-status gating).
- Reference mockup supplied by user (image in conversation, "ACADEMIA" portal mock) is the ground-truth visual target for palette, components, and page-header/table patterns below.

## 1. Design direction

Hybrid, per user decision:
- **Premium curved** everywhere except dense data grids: soft shadows, `rounded-2xl`/`rounded-3xl`, warm paper background, institutional (not startup-SaaS) feel.
- **Brutalist/operational** only on: `AdminMarksPage`, `MarksEntryForm` grid, `AllPeoplePage` directory table, analytics/overview metric tables (`OperationalAnalyticsDashboard`, `SuperadminOverview`, `ActivityMonitorPage`). Square corners, hairline dividers, monospace data cells, no shadow. Restrained subset only — no scanlines/noise/ASCII framing, wrong register for an institutional portal.

## 2. Tokens (`tailwind.config.js theme.extend`)

Exact values from the approved reference mockup:

| Token | Value | Use |
|---|---|---|
| `paper` | `#FAF9F6` | app background (replaces `bg-slate-50`) |
| `ink` | `#14151A` | primary text (replaces `text-slate-900`) |
| `brand` | `#0F4C81` (+ 50-900 scale) | primary accent (replaces `indigo-600`) |
| `gold` | `#B8873D` | secondary accent - sparing use: highlights, one badge tone, masthead accents |

Font: **Plus Jakarta Sans** for headings and body (single font, avoid a second web-font load).

Because `theme.extend` is currently empty and every page uses literal Tailwind classes (`slate-*`, `indigo-*`), remapping the `slate` and `indigo` color scales themselves inside `theme.extend.colors` - rather than only adding new `brand`/`paper`/`ink`/`gold` tokens - repaints the whole app with near-zero per-page edits. Verify each literal usage still reads coherently (flag: `shadow-indigo-200` in `button.jsx` and a few one-off `bg-indigo-*` badges) before relying on this fully; patch individual spots that don't.

## 3. New shared components (`components/ui/`, foundation phase)

All new, all restyle-compatible (no existing call sites change their contract):

- **`Skeleton`** - shimmer via `animate-pulse`, replaces `.loading-state` text placeholder (22 call sites).
- **`Toast`** - success/error, slide-in, auto-dismiss. New capability (nothing exists today) for transient feedback; `.inline-notice` (17 call sites) restyled and kept for persistent inline banners, not replaced.
- **`Dialog`** - accessible modal (focus trap, Escape to close, backdrop click) replacing the 14 hand-rolled `fixed inset-0` modals with one contract. Each call site swaps its markup, keeps its own open/close state and logic untouched.
- **`EmptyState`** - icon + message + optional action, replaces ad-hoc "no records" text.
- **`DataTable`** (brutalist variant, for section-1's 5 dense pages) - sticky header, column sort/filter, column visibility toggle, pagination, bulk-action row, keyboard navigation, density toggle, export to CSV/Excel, search + filter chips.
- **`Breadcrumb`** - `Home > Section > Page`, used in the new page-header pattern (section 5).
- **`StatCard`** - icon, label, value, trend delta (up/down + %), used in both the bento dashboard layout and the page-header stat strip.
- **`Badge`** gets a real `colorFor()` fix - currently silently grays out any status not in `{pending, approved, rejected, revoked}` (a live gap: `OrgOverviewPage` passes `status="indigo"/"slate"`). Add explicit tones incl. `active`, `under_review`, `unknown`, each with a small Phosphor dot/check/clock icon per the reference mock's badge style - not just a color dot.

Existing primitives restyled in place (`Button`, `Card`, `Input`, `Select`, `Label`, `Page`) - same props, new visual language: curved, soft-shadow, `brand`-accented, with explicit focus/error/success/disabled states per the reference mock's "Form States" panel (default, focused ring, error with message, success with check, disabled with reduced opacity - `Input`/`Select` need an optional `error`/`success` prop plumbed through, additive not breaking).

## 4. Icons

New dependency: `@phosphor-icons/react`, **Light** weight. Replaces the single emoji hit (`TrackSelectionPage.jsx`) and every ad-hoc unicode glyph/arrow across the app. Every sidebar nav item, status badge, empty state, notification, and button-with-icon gets a real vector icon from one consistent set - no mixing icon families.

## 5. Page header pattern (new shared layout, used on every top-level page)

From the reference mock's "Page Header & Layout" panel:
1. `Breadcrumb` (Home > Section > Page)
2. Title + one-line subtitle, "Last updated <timestamp>" on the right, primary action button(s) (e.g. Export, Add) top-right
3. Stat strip - 3-4 `StatCard`s (icon, value, trend) summarizing the page's data
4. Toolbar row - Filters button, search input, Columns selector (data-table pages only)

Applied to every page that currently just renders a bare `<h1>` and a card - i.e. most of the 60. This is the single biggest "premium" lever since it's one new component (`PageHeader`) reused everywhere, not 60 bespoke edits.

## 6. Dashboard / overview pages - Asymmetric Bento

Role landing pages (Student home, Faculty home, `OrgOverviewPage`, CRCS overview) get an asymmetric `StatCard` grid - one wide highlight card (`col-span-8`) beside stacked smaller ones (`col-span-4`), not a uniform 3-up grid. Below the stat strip, an "Executive view" section may show a trend line + a distribution donut **only where the data already exists** from current analytics endpoints (no new backend routes in this scope) - e.g. `OperationalAnalyticsDashboard`'s existing per-department counts can back a donut; a login/activity time-series would need to already be returned by an existing endpoint or the chart is skipped for that page. New dependency: `recharts` (small, Tailwind-friendly, fully themeable to `brand`/`gold`).

Mobile: every bento/asymmetric layout collapses to single-column, wide card first, `px-4 py-8`, no rotation/overlap, `min-h-[100dvh]` never `h-screen`.

## 7. Login page - its own creative treatment

Editorial-split layout:
- **Left panel** - institutional masthead: mark/pillar icon (Phosphor) + portal wordmark, a small-caps tracked tagline line (e.g. "A MODERN ACADEMIC PORTAL"), a secondary descriptor line ("Clean. Consistent. Institutional. Built to last."), generous whitespace, `paper`/`ink`/`gold` palette. This masthead pattern (icon mark + tracked small-caps tagline) is also reused, scaled down, in the `Shell` header for brand consistency across the whole app.
- **Right panel** - the actual login form + demo quick-login list, rendered as staggered interactive cards (framer-motion entrance stagger), not a flat list.
- Mobile: masthead collapses to a compact header band above a full-width form.

## 7a. Glassmorphism - login page only

Scope narrowed by explicit request: glass effect **only** on the login page, nowhere else in the app (`Dialog`, `Shell` header, dropdown panels all stay flat/opaque per section 1's normal curved-premium treatment).

- **Login left masthead panel** - frosted glass card (`backdrop-blur-xl bg-white/40`, hairline `ring-1 ring-white/50`) over a soft low-opacity radial gradient in `brand`/`gold`. The one deliberate glass moment in the app.
- **Login quick-login demo cards** (right panel) - subtle glass **on hover only**, flat/opaque at rest so the list stays readable.

## 8. List/queue pages - motion

`ApprovalsHub`, `ApplicationQueue`, `ReviewQueue`, notification list: cards enter with a framer-motion stagger (fade + rise, ~40ms offset per item). Slight alternating tilt (`-1deg`/`1deg`) **on hover only**, never at rest, never on brutalist tables - data must stay scannable. New dependency: `framer-motion`.

Micro-interactions applied app-wide: page fade-in on route change, `Dialog` enter/exit, `Toast` slide-in, button hover/press (scale `0.98` on press), smooth (non-`linear`/`ease-in-out`) transitions. No scroll-jacking anywhere. All motion respects `prefers-reduced-motion` (skip/shorten animations).

## 9. Accessibility (non-negotiable, applies to every new/restyled component)

WCAG AA contrast on the new palette (verify `brand`/`gold` against `paper`/`ink` before locking hex values in code), full keyboard navigation, visible focus states (already partially present via `focus-visible:ring` convention - extend, don't replace), screen-reader labels/ARIA where semantics aren't implicit, `Dialog` focus trap + Escape-to-close, semantic HTML (`<table>`, `<dl>`, real `<button>`s) over generic `<div>` soup in every new component.

## 10. Rollout phases (each: build -> `frontend npm run build` + existing `frontend/e2e/*.spec.mjs` green -> commit -> check in before next phase)

1. **Foundation** - tokens (`tailwind.config.js`, `index.css`), restyle existing `components/ui/*`, add `Skeleton`/`Toast`/`Dialog`/`EmptyState`/`Breadcrumb`/`StatCard`/`DataTable`/`PageHeader`, install `@phosphor-icons/react` + `framer-motion` + `recharts`, fix `Badge.colorFor()`.
2. **Shell + Login** - `Shell.jsx` (header/nav, masthead), `LoginPage.jsx` (editorial split).
3. **Student layout** - all pages under `StudentLayout`.
4. **Faculty layout** - all pages under `FacultyLayout`.
5. **Coordinator/HOD/Dean/School Office layout** - all pages under `CoordinatorLayout`.
6. **CRCS layout** - all pages under `CRCSLayout`, including the brutalist marks/analytics/directory tables (largest phase - most of section 1's dense-data pages live here).

## 11. Explicitly out of scope this pass (backlog, not built now)

From the reference mock's "Additional Upgrades" panel - real ideas, but each either touches backend/new data model or is a distinct feature, not a restyle. Do not build silently inside a phase above; re-scope separately if wanted later:
- Global search (Cmd/Ctrl+K)
- Audit-log viewer UI (backend `audit_log` table already exists per project history - frontend view does not)
- Per-record activity timeline
- Unsaved-changes-protection prompt
- Advanced filter chips beyond what `DataTable`'s basic search/filter already covers
- Dark mode
- Print-friendly views
- Marks-entry spreadsheet behavior upgrades (Tab-to-next-cell, multi-cell paste) - visually the grid is restyled in phase 6, but the *interaction* upgrade (paste, tab-nav) touches save-path logic the project history flags as previously buggy; treat as a separate follow-up, not bundled into the restyle.

## 12. Verification gate (every phase)

- `frontend npm run build` clean
- Existing Playwright specs in `frontend/e2e/*.spec.mjs` pass (includes `cycle-guideline-upload.spec.mjs` - the scroll-lock-sensitive one)
- Manual spot-check: no React Query key, prop name, route path, or permission-gate line changed in the diff (`git diff --stat` scan before each phase commit)
