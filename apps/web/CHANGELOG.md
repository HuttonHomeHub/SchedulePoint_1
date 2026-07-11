# @repo/web

## 0.6.0

### Minor Changes

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Show per-activity baseline variance in the activities table (M7 Task D2, ADR-0025).
  When a plan has an active baseline, the plan route fetches the variance read and passes a
  per-activity map into the existing `ActivitiesTable` as an optional prop, which renders
  **Start / Finish / Float variance** columns: "3 d behind" / "2 d ahead" / "On baseline"
  (working days on the plan calendar; float flips the sign so lost float also reads as
  behind), "Added" for an activity created since capture, "Removed" for a baselined activity
  now gone, and "—" when not comparable. A plan-level **roll-up** ("vs. Contract Baseline:
  worst slip 6 d · 3 activities behind · 1 added") sits above the table. Meaning is carried
  by the text, not colour alone (WCAG 2.2); the tone colour only reinforces it. All variance
  UI is absent when there is no active baseline. `features/activities` stays dependency-free — it takes a
  shared `@repo/types` shape and the route composes it from the baselines feature (no
  feature→feature import). A Playwright journey covers capture → active → variance visible
  with an axe check. The stale `ROADMAP.md` is refreshed to reflect the delivered M0–M7
  milestones and the candidate next steps.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the baselines panel to the plan view (M7 Task D1, ADR-0025). A new
  `features/baselines` surfaces a plan's baselines under the Schedule section: name, an
  **Active** badge, when captured, the captured project finish, and the frozen activity
  count. Planners/Org Admins get **Capture baseline** (a dialog that freezes the plan's
  current computed schedule; a duplicate name or a never-calculated plan surface as
  friendly inline messages with a "recalculate first" hint), plus per-row **Activate**
  (exactly one active — activating one deactivates the rest server-side) and **Delete**
  (with a warning when removing the active baseline). Everyone else reads. The shared API
  client gains `apiFetchEnvelope` so the variance read can access the `{ data, meta }`
  roll-up; the `baselineKeys` query keys and hooks (list/detail/variance/capture/activate/
  delete) land here too. Empty/loading/error states and delete confirmation reuse the
  shared DataTable/ConfirmDialog primitives.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Time-Scaled Logic Diagram (TSLD) canvas — read-only (M8, ADR-0026). The plan
  detail's "Logic diagram" section now plots a plan's computed activities on a **Canvas 2D**
  surface: task bars and milestone diamonds positioned by their early dates on a
  time-scaled grid, dependency logic drawn as routed connectors, and the critical /
  near-critical path highlighted — by a fill colour **paired with a solid / dashed outline**
  (and a visible legend) so criticality is never conveyed by colour alone. The view is
  **drag-to-pan, scroll-to-zoom** (cursor-anchored) with a **Fit to plan** control, and
  repaints only dirty frames off a `requestAnimationFrame` loop so an idle diagram costs
  nothing.

  Because a `<canvas>` is opaque to assistive technology, the diagram is `aria-hidden` and
  paired with a **parallel focusable listbox** of the same activities: a keyboard or
  screen-reader user tabs into the diagram, arrows through activities (each announced with its
  dates, lane and criticality) and selects one, which rings it on the canvas — no capability is
  pointer-only (WCAG 2.2). The activities table remains the fuller conforming alternative.
  On-canvas **editing** (create/move/draw logic) arrives in a later release.

### Patch Changes

- Updated dependencies [[`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883)]:
  - @repo/types@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14), [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14)]:
  - @repo/types@0.5.0

## 0.5.0

### Minor Changes

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Recalculate action to the plan view (Planner/Org Admin). A `Recalculate`
  button triggers the CPM engine and refetches the schedule summary and activities
  so the computed dates, float and critical-path badges update in place; a plan
  with no start date surfaces a friendly inline prompt (from the API's 422) instead
  of a raw error, and other failures are announced politely. Readers don't see the
  action. Also darkens the `--primary` design token slightly so white-on-primary
  buttons clear the WCAG 2.2 AA 4.5:1 contrast bar (verified by axe) — an app-wide
  accessibility fix the new page surfaced.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Surface the computed CPM schedule in the plan view (read-only). The activities
  table gains early/late start & finish and total-float columns plus a
  critical / near-critical badge (late dates hide first on narrow screens; an
  uncomputed plan shows em dashes). A new schedule summary strip shows the data
  date, project finish, and the activity / critical / near-critical counts, with a
  "not yet calculated" empty state and its own loading/error states. Adds a shared
  `Badge` primitive and `scheduleKeys` / `useScheduleSummary`. The Recalculate
  action is a separate control (next).

### Patch Changes

- Updated dependencies [[`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c)]:
  - @repo/types@0.4.0

## 0.4.0

### Minor Changes

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activities table and definition CRUD to the plan-detail screen. A plan now
  lists its activities (code, name, type, duration, progress); Planners and Org
  Admins can add, edit, and soft-delete them from a form dialog that mirrors the API
  rules — the duration field is hidden for milestone types (which have no duration),
  and the constraint date only appears once a constraint type is chosen (the two are
  sent, or cleared, together). The graphical Time-Scaled Logic Diagram will edit
  these on a timeline in a later release.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity progress editor with role gating. A "Progress" action on each
  activity row opens a dialog to set percent complete and the actual start/finish
  dates; the resulting status is shown as a live, read-only preview (the API derives
  it). The action is gated on `canReportProgress` (Contributor upward), so a
  Contributor — who cannot edit an activity's definition — can still report progress,
  while Planners and Org Admins see it alongside Edit/Delete. Client-side validation
  mirrors the API (a finish needs a start and cannot precede it).

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add/edit/remove dependencies from the Logic panel. Planners and Org Admins
  (`canManageLogic`) get "Add predecessor"/"Add successor" buttons and per-row
  Edit/Remove: adding picks the other activity from the plan (self excluded),
  chooses a type (FS/SS/FF/SF) and a signed lag; editing changes type/lag with
  optimistic locking; removing confirms first. The API stays the source of truth
  for the acyclic guarantee — a cycle, duplicate, or stale-version rejection is
  surfaced inline. Viewers and Contributors keep the read-only panel.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the read-only Logic panel for activities. Each activity row on the plan-detail
  screen gets a "Logic" action (available to any member) that opens a panel showing
  its **predecessors** (what must finish before it) and **successors** (what it
  drives) — each a table of the other-end activity, dependency type (FS/SS/FF/SF),
  and signed lag. The activities table stays dependency-free: it emits an
  `onOpenLogic` callback and the plan-detail route owns the panel. Add/edit/remove
  affordances land next.

### Patch Changes

- Updated dependencies [[`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6)]:
  - @repo/types@0.3.0

## 0.3.1

### Patch Changes

- [#15](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/15) [`509a94e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/509a94e40935a3ccc171306a68bf64819e7de135) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the post-login redirect bouncing back to the sign-in screen. After a
  successful sign-in/sign-up the session query was only _invalidated_, which does
  not refetch an inactive query, so the `_authed` route guard — which reads the
  session via `ensureQueryData` (cached, no revalidation) — saw the stale
  unauthenticated `null` and redirected straight back to sign-in. The user
  appeared "stuck" and only got in by manually refreshing. The mutations now
  `fetchQuery` the session (awaited) so the cache holds the logged-in user before
  navigation, landing the user in the app (or onboarding) on the first attempt.

## 0.3.0

### Minor Changes

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the web screens to browse and manage clients and projects (E1). New routes
  `/orgs/:orgSlug/clients` (list), `/orgs/:orgSlug/clients/:clientId` (a client's
  projects), and `/orgs/:orgSlug/projects/:projectId` (the plans shell, filled in
  by E2), reachable from a new "Clients" nav item. Each screen has create/edit
  dialogs and a confirm-first soft delete, breadcrumbs, and loading/empty/error/
  not-found states; write affordances are hidden for non-writers (Viewer/
  Contributor) while the API still enforces authorisation. Covered by component
  tests and a Playwright journey (create client → open → create project) with an
  accessibility check.

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the web plans slice (E2): a project's plans table (name → plan detail,
  status, planned start) with create/edit/delete for writers, a plan form with a
  status select and an optional planned-start date (`<input type="date">`, wire
  format `YYYY-MM-DD`), and a plan-detail route (`/orgs/:orgSlug/plans/:planId`)
  showing the plan's metadata plus a region reserved for the future Time-Scaled
  Logic Diagram canvas. The project screen now lists real plans instead of a
  placeholder.

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the recycle-bin web slice (E3): a "Recently deleted" screen
  (`/orgs/:orgSlug/recently-deleted`, linked from the org nav for writers) listing
  soft-deleted clients, projects and plans newest-first, each with a Restore
  action. An item whose ancestor is still deleted can't be restored on its own, so
  its row guides the user to restore the parent first (the top-down invariant);
  restoring a client or project brings back everything deleted with it. Restore
  outcomes (and name-collision errors) are announced via the shared live region.

### Patch Changes

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the hierarchy authorisation and lifecycle foundation: `client|project|plan`
  read/create/update/delete/restore permission codes (read for every member,
  write for Planner + Org Admin), a shared `HierarchyLifecycleService` implementing
  cascade soft-delete + batch restore (one `delete_batch_id` per delete, top-down
  `PARENT_DELETED` invariant, `NAME_TAKEN` on colliding restore), and the
  `ClientSummary`/`ProjectSummary`/`PlanSummary`/`PlanStatus`/`DeletedHierarchyItem`
  cross-boundary types.
- Updated dependencies [[`a3e9e01`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a3e9e01d4684f945b48cd116374a545d39a7f9bc)]:
  - @repo/types@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`cfe1d24`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cfe1d2485ff2d1b8deeaf4328c5691754c91da40)]:
  - @repo/types@0.2.1

## 0.2.0

### Minor Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Land the web application entry point and the authentication walking skeleton:
  Vite + React app shell, design tokens, TanStack Router (code-based) with an
  `_authed` guard, TanStack Query, theme (light/dark/system) with no flash of the
  wrong theme, and accessible sign-in / sign-up forms (React Hook Form + Zod) via
  the Better Auth client. A signed-in user reaches an app shell (header, current
  user, sign-out); unauthenticated visits are redirected to sign-in. Covered by a
  component test and a Playwright journey with an axe accessibility check; CI now
  builds and end-to-end tests the web app.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the members management UI and the invitation-accept flow. Each organisation
  gets a Members screen (`/orgs/$orgSlug/members`) with an accessible roster: inline
  role changes (optimistic-lock conflicts surfaced), remove-with-confirm, and an
  Invite dialog that emails a link and shows the copyable accept URL. A public
  `/accept-invite` route previews the invitation and lets the invited user join
  (prompting sign-in as the right account when needed). Adds a header org nav and
  Dialog/Select primitives. Covered by a component test and a two-account
  Playwright journey (invite → accept → join).

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add organisation onboarding, an org switcher, and organisation-scoped routing.
  A user with no organisations is routed to a create-your-first-organisation
  screen; the header gains an accessible organisation switcher; and the app routes
  under `/orgs/$orgSlug` with the URL as the authoritative active organisation (a
  remembered "last active org" drives the home redirect). Covered by a component
  test and an extended Playwright journey (sign up → onboard → land in the org).

### Patch Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the invitation-accept flow and fix accessibility gaps found in review.

  API: invitation acceptance now enforces a verified email when
  `AUTH_REQUIRE_EMAIL_VERIFICATION` is on — a single flag that also drives Better
  Auth's `requireEmailVerification`, so the email-match identity check becomes a
  real proof of mailbox ownership the moment the verification-email loop lands
  (default off for the alpha; ADR-0016).

  Web: split the destructive colour into a solid `destructive` (button/chip
  surface) and a readable `destructive-text` for coloured text and state borders,
  so error text, invalid-field borders, and the form error summary meet WCAG AA
  contrast in both themes. The invitation-link field now uses the shared input
  primitive (proper focus ring), and the accept-invite screen announces its
  loading→resolved transitions via a polite live region.

- Updated dependencies [[`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf)]:
  - @repo/types@0.2.0
