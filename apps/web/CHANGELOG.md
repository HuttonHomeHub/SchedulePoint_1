# @repo/web

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
