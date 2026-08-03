# Technical debt register

Known shortcuts, gaps, and deferred decisions, with the intent to address them.
Keep this honest and current — undocumented debt is the expensive kind.

> Format: each item has a short description, why it exists, the risk if left,
> and a remediation intent. Remove items when resolved (note it in
> [DECISIONS.md](DECISIONS.md) or `CHANGELOG.md` if significant).

**Delete resolved rows; do not annotate them "RESOLVED".** A row that says it is
done is a row a reader still has to read, and nine of them had accumulated here.
Worse, several rows were resolved in the _title_ while their remediation column
still described the work as outstanding — so the register disagreed with itself.
The commit message and `DECISIONS.md` are the history; this file is the backlog.
Where only part of an item is done, rewrite the row to be about **what is left**,
and rename it to match, rather than appending a "(a) RESOLVED" prefix.

**When you delete a row, add its number to [Closed numbers](#closed-numbers) at
the foot.** One line. That ledger is not ceremony: ADRs cite these numbers and are
never rewritten, so a deleted row leaves dangling references — and a freed number
looks available, which is how two different items both came to be numbered 83.

**Reconcile periodically.** A row is a claim about the code, and claims rot: the
2026-07-27 pass (below) found one row asserting the app had no domain code when
it had nineteen modules, one understating a duplication by 5×, and one whose
"still to do" had shipped a fortnight earlier. Verify against the codebase, not
against memory — most rows here name a file or a flag, so checking is cheap.
Doing this after each epic, while the context is fresh, is cheaper than a sweep.

| #   | Item                                                                | Why it exists                                                                                                                                                                                                                                                                                                                                     | Risk                                                                                                                                                                                                                                                                                                                                                            | Remediation intent                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Web e2e is Chromium-first**                                       | The web entry point has landed (M1, A2): CI now runs `pnpm build` (api + web) and a Playwright journey (sign-up → shell → sign-out, with an axe check) against a real API + Postgres. The Playwright config defines chromium/firefox/webkit projects but coverage so far is exercised mainly on Chromium.                                         | Firefox/WebKit-specific regressions may slip until those projects are routinely run.                                                                                                                                                                                                                                                                            | Keep the cross-browser projects green as the UI grows; expand journeys per feature.                                                                                                                                                                                                                    |
| 2   | **Swagger CLI plugin disabled**                                     | The `@nestjs/swagger` CLI plugin generated a `metadata.ts` that tripped `noUnusedLocals`. OpenAPI is currently produced via explicit `@Api*` decorators (which works), so the plugin is optional.                                                                                                                                                 | Without the plugin, DTO schemas must be annotated by hand.                                                                                                                                                                                                                                                                                                      | Optionally re-enable `plugins: ["@nestjs/swagger"]` in `nest-cli.json` to auto-enrich schemas; verify the build stays green.                                                                                                                                                                           |
| 3   | **Observability wiring is partial**                                 | Structured logging + correlation IDs are implemented; OpenTelemetry metrics/traces (ADR-0013) and a backend are not yet wired.                                                                                                                                                                                                                    | Limited metrics/traces until wired.                                                                                                                                                                                                                                                                                                                             | Add the OTel SDK + exporter and a collector per environment.                                                                                                                                                                                                                                           |
| 4   | **Async/cache/storage not wired**                                   | BullMQ (ADR-0009), Redis cache (ADR-0010), and object storage (ADR-0011) are designed but not yet added to the stack (no jobs/hot paths/files exist yet).                                                                                                                                                                                         | Patterns exist on paper only.                                                                                                                                                                                                                                                                                                                                   | Add Redis/MinIO to compose and the modules when the first job/cached read/file lands.                                                                                                                                                                                                                  |
| 5   | **Hosting: the current setup IS the decision (settled 2026-08-01)** | Recorded as "undecided" since the foundation stage, which read as work owed. It is not. The product owner runs the Docker Compose stack with the ADR-0047 Watchtower profile **enabled**, so a merged release is pulled and recreated on that host and every release is reviewed by a person. That is a deployment model, not the absence of one. | None today. The cost of the deferral is bounded because the container/registry foundation is deliberately platform-neutral (ADR-0018 self-migrating image, ADR-0027 per-package tags, GHCR), so moving is a decision rather than a rewrite. Costing managed-host against Kubernetes now would mean costing them against a load profile that does not exist yet. | **Revisit when one of these becomes true**, and write the ADR then: a second operator needs to run their own instance; a tenant needs an availability guarantee a single host cannot make; or the release cadence outgrows one person reviewing each one. Until then this row is a record, not a task. |
| 7   | **Performance targets are estimates**                               | Set before real workloads exist.                                                                                                                                                                                                                                                                                                                  | Targets may be wrong.                                                                                                                                                                                                                                                                                                                                           | Re-baseline against real metrics once deployed.                                                                                                                                                                                                                                                        |
| 8   | **CSP not finalised for web**                                       | App origins/assets unknown until features land.                                                                                                                                                                                                                                                                                                   | Weaker XSS mitigation than achievable.                                                                                                                                                                                                                                                                                                                          | Tighten the nginx/`helmet` CSP once origins are known.                                                                                                                                                                                                                                                 |
| 9   | **Auth library relatively young**                                   | Better Auth is now wired into the `AuthContextService` seam (email + password, cookie sessions; ADR-0003, A1). Ecosystem maturity remains a watch item.                                                                                                                                                                                           | Ecosystem maturity risk.                                                                                                                                                                                                                                                                                                                                        | Monitor releases/advisories; keep the boundary swappable behind the seam.                                                                                                                                                                                                                              |
| 10  | **ESLint pinned to v9**                                             | ESLint 10 is available, but `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-react` still cap their peer range at ESLint 9. Dependabot's major bump is ignored (see `.github/dependabot.yml`).                                                                                                                                | Missing ESLint 10 features/fixes until the plugins catch up.                                                                                                                                                                                                                                                                                                    | Remove the `eslint` major-ignore and bump the ESLint group once the plugins publish v10-compatible releases.                                                                                                                                                                                           |
| 11  | **Prisma pinned to v6**                                             | Prisma 7 removes `url` from the datasource block and requires a driver adapter + `prisma.config.ts` — a deliberate migration, not a routine bump. The major is ignored in Dependabot.                                                                                                                                                             | Missing Prisma 7 improvements until migrated.                                                                                                                                                                                                                                                                                                                   | Do the Prisma 7 migration deliberately (driver adapter, `prisma.config.ts`, `PrismaService` wiring) — worth an ADR — then un-ignore.                                                                                                                                                                   |
| 12  | **CodeQL off on private repos**                                     | Code scanning uploads are free on public repos but need GitHub Advanced Security (paid) on private ones. The CodeQL workflow is gated to public repos (`.github/workflows/codeql.yml`) so apps generated from this template stay green instead of failing on every push.                                                                          | No static-analysis (CodeQL) scanning on private repos.                                                                                                                                                                                                                                                                                                          | Enable GitHub Advanced Security, or make the repo public, to activate CodeQL; Dependabot, secret scanning, and the security-reviewer agent remain active meanwhile.                                                                                                                                    |

| 13 | **TypeScript pinned to v5** | TypeScript 7 (the native compiler) removed `baseUrl` and `moduleResolution: node10` from tsconfig, which the shared presets rely on for the `@/` and `@repo/*` path aliases. The major is ignored in Dependabot. | Missing TypeScript 7 speed/features until migrated. | Migrate the tsconfig presets (drop `baseUrl`, move to `paths`/`bundler` resolution), verify nest/vite resolution, then un-ignore. |

| 14 | **Append-only audit log missing** | No append-only audit-log framework exists yet (flagged in the A1 and C1 security reviews), so security-sensitive events are only in operational logs + row audit columns: (a) authentication events (sign-up/in/out); (a2) membership role changes / removals and invitation create/revoke/accept (who did what to which org, before→after); (b) Better Auth's rate-limit store is in-process memory — per-replica once scaled; (c) the `accounts` OAuth token columns are unencrypted at rest (harmless today — only email+password is enabled). | No tamper-evident audit trail for permission changes / deletions / auth; rate limits weaken under horizontal scaling; token columns unencrypted before OAuth ships. | Build an `AuditLog` model + service (SECURITY_STANDARDS.md) and write auth + membership/invitation events to it; back the rate-limit store with Redis (ADR-0010) before scaling out; add field-level encryption for OAuth token columns before enabling social providers. |

| 15 | **OpenAPI accuracy gaps** | Repo-wide, from the B2 API review: (a) `201 Create` responses don't set a `Location` header (`docs/API.md` asks for one) — present in the reference template too; (b) the `@Api*Response` decorators declare the bare DTO, not the `{ data }`/`{ data, meta }` envelope the `TransformInterceptor` actually returns. | Generated OpenAPI is slightly inaccurate about response shape and `Location`. | Add a shared `@ApiDataResponse()`/`@ApiPaginatedResponse()` swagger helper and a `Location` header on creates; backport to the reference template so the two stay in step (ADR-0015). |

| 16 | **Email verification not enforced (invitation identity)** | From the C2 security review: `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults `false` because no verification-email loop exists yet (only a logging `MailService` stub). Invitation acceptance grants org membership on an email-match check that only proves mailbox ownership when verification is on (ADR-0016 §5). | An adversary who registers an account for a matching address **and** holds the one-time invite token could accept; account-squatting can also block the real invitee's sign-up. Alpha-only, deliberately accepted. | Build the verification-email flow through the `MailService` port, then set `AUTH_REQUIRE_EMAIL_VERIFICATION=true` — the accept-time `emailVerified` gate and Better Auth enforcement are already wired to that flag, so no further code change is needed. Consider a stricter per-route throttle on `POST /invitations/preview` \| `/accept` at the same time. |

| 17 | **Members UI a11y polish (non-blocking)** | From the C3 accessibility review, after the blocking contrast/focus/live-region fixes: (a) controls use the native `disabled` attribute while a mutation is pending, so keyboard focus drops to `<body>`; (b) the `Dialog` `description` isn't linked via `aria-describedby`; (c) modal initial focus lands on the ✕ close button rather than the first field; (d) no `aria-live` success confirmation for role change / removal / link-copy; (e) light `muted-foreground` (4.73:1) and the sm remove button (36px vs. preferred 44px touch target) are within-spec but tight. | Minor friction for keyboard/AT users; all currently meet AA. | Prefer `aria-disabled` + pointer-events guard over native `disabled` on pending controls; add `aria-describedby` to `Dialog`; set an explicit initial-focus target; add a shared polite toast for success; revisit the tight tokens/targets when the notifications component lands. |

| 18 | **CI image job has no layer cache** | The `image` job (`.github/workflows/ci.yml`, ADR-0020) builds both container images from scratch on every run: the Dockerfiles' `--mount=type=cache,id=pnpm` BuildKit cache is local to an ephemeral runner and isn't persisted across CI runs, and the job invokes `docker compose … --build` directly without a GHA-backed buildx cache. | Slower CI (full `pnpm install` + `prisma generate` + `tsc` + `vite build` each run); more Action minutes. | Wire `docker/setup-buildx-action` + `cache-from`/`cache-to: type=gha` (or `docker buildx bake`) so image layers persist across runs. |

| 20 | **Keyset cursor is resolved before the scope filter** | From the C1 security review (pre-existing shared behaviour, also in `client.repository.ts`/`org-member.repository.ts`): the list repositories pass `cursor: { id }` to Prisma, which resolves that row by global `id` uniqueness before the org/client `WHERE` filter is applied. A cursor value copied from another org's row is therefore accepted as a valid pagination anchor. | None exploitable — the returned page is still filtered by `organizationId`/`clientId`, so no cross-scope rows leak; only the anchor position is honoured. Cosmetic/robustness. | Validate the cursor belongs to the resolved scope (or use an opaque signed cursor) in the shared list-repository helper when one is extracted; capture the standard in an ADR/`docs/API.md` pagination note. |

| 21 | **Systemic web-a11y & polish follow-ups (E1 reviews)** | Non-blocking items from the E1 component/UX/accessibility reviews that are pre-existing or systemic, so best fixed once at the primitive/shell level rather than per-feature: (a) no required-field indicator in the shared `Form`/`TextField` primitive (affects every form — sign-in/up/invite/create-org too); (b) no focus-to-heading / `document.title` update on client-side route navigation (router/`AuthedLayout` level); (c) `sm` ghost row-action buttons are 36px (below the 44px touch-target preference), shared with `MembersTable`; (d) no shared `EmptyState` primitive (icon + copy + action) — empty states are text-only; (e) from the E2 review: no shared `DateField` form primitive — a `TextField type="date"` is hand-composed where the CPM/GPM feature set needs it repeatedly (baseline/actual/constraint dates). **The `SelectField` half of this item is DONE** (2026-07-27, #42): the primitive exists and `InviteMemberDialog` + the plan status select are on it. | Minor friction for keyboard/AT and touch users; all current states still meet WCAG 2.2 AA. | Add a required-indicator to the `Form` primitive; add a route-change focus/title manager once in `AuthedLayout`; introduce `EmptyState`, `SelectField`, and `DateField` primitives (folding the calendar-date wire↔display contract into `DateField`) and bump the row-action target size when the design system is next revised. |

| 23 | **Header org-nav was never folded into the rail** — _the responsive-collapse half is addressed (ADR-0029, `VITE_NAV_TREE` default-on); the fold-in is not: `app-header.tsx` still renders Overview / Clients / Members / Recently deleted as its own row_ | From the E3 UX review: the org nav (`apps/web/src/components/layout/app-header.tsx`) is a single flex row that grew to four items (Overview / Clients / Members / Recently deleted). `docs/FRONTEND_ARCHITECTURE.md` documents the intended shell as "nav collapses to a drawer/sheet below `lg`", which isn't built. E3 mitigated the immediate overflow by making the nav shrink and scroll horizontally (`min-w-0 flex-1 overflow-x-auto`, links `whitespace-nowrap`) so it never pushes the page into horizontal overflow, but a horizontally-scrolling nav strip is a stopgap, not the intended mobile pattern. **The persistent app-shell (ADR-0029) is landing this:** M1 added the shell — a Project Explorer rail pinned on `lg`+ and an off-canvas drawer (with a header menu button) below `lg` — behind `VITE_NAV_TREE` (default off). The primary navigation moves into the rail/drawer once the flag flips on at M2. | On narrow viewports the primary nav becomes a scroll strip rather than a proper menu; discoverability of later items is weaker. Every new nav item makes the row tighter. | Complete the navigator (M2), flip `VITE_NAV_TREE` on, and fold the header org-nav items into the rail; move low-frequency maintenance items (e.g. "Recently deleted") into an org-settings/admin area once one exists. |

| 28 | **TSLD canvas ring/stroke colour treatment** | From the D5 link-legality UX + a11y reviews. **(a)** The **legal** drop-target ring during a link-draw is visually identical to the ordinary **selection** ring (`paint.ts` — both `palette.selection`, solid, 2px), so two rings with different meanings can appear in the same style at once (predates D5). **(b)** The **illegal** ring reuses `palette.critical` (`--color-destructive`), the same token as the CPM critical-path **bar fill** (`paint.ts`), so an illegal drop hovered over a critical-path activity draws red-on-red — weaker contrast exactly where the signal matters, and overloads one colour for two meanings. **(c)** `--color-destructive` is documented (`globals.css`) as tuned for button surfaces; its use as a **state-border/stroke** on the canvas (the critical-bar outline too) wants a contrast check vs `--color-destructive-text` in both themes. | Cosmetic/robustness; the illegal ring is still distinguishable by its dash (colour + pattern, WCAG 1.4.1 holds), so not an AA failure. | Give the legal drop-target ring a distinct treatment from selection; pick a canvas "danger stroke" token distinct from the critical-bar fill; verify destructive-token stroke contrast in both themes when the canvas palette is next revised. |

| 30 | **Canvas-first workspace fast-follows — what's left (ADR-0030 M1–M5 reviews)** | Of the original eight, four are done — (b) `useMenuTrigger` extracted, (d) the hidden-pane rAF pause (now regression-tested, see the 2026-07-27 entry in DECISIONS.md), (h) the duplicate "Activities" landmark renamed — and (a) was deliberately left as a `matchMedia` transition side-effect in `app-shell.tsx` rather than migrated onto `useMediaQuery`. Remaining: **(c)** the mobile Diagram/Activities `WorkspaceViewToggle` and the pen banner's segmented controls are both hand-rolled roving-`tabindex` single-selects — extract a shared `Tabs`/`SegmentedControl` primitive; **(e)** the panel-height clamp recomputes against `bodyHeight` on every workspace resize (`plan-workspace.tsx`) — an O(n) re-clamp, fine at current scale; **(f)** `usePlanWorkspaceModel` is covered only through the two route layouts, never directly; **(g)** the rail-prefs localStorage key changed shape (`width`→`size`) when it moved onto the shared primitive, dropping any persisted rail width once — accepted pre-1.0 per ADR-0030. | Minor; all current states meet WCAG 2.2 AA and sit within the perf budget. | Extract the `Tabs`/`SegmentedControl` primitive when the next consumer lands (it would be the third); add a direct `usePlanWorkspaceModel` test; revisit the resize re-clamp only if it profiles hot. (g) needs no action. |

| 31 | **`VITE_CANVAS_TOOLBAR` ships dark during build + M5 fast-follows (ADR-0031)** — _(a) `SelectionActionsBar` mounted + (b) plan-chrome dialogs deduped into a shared `PlanChromeDialogs` 2026-07-13_ | The canvas-maximal chrome reclaim + future-proof Toolbar architecture (ADR-0031, spec `docs/specs/canvas-toolbar-architecture.md`) is built behind `VITE_CANVAS_TOOLBAR` (default-off, `apps/web/src/config/env.ts`), layered on ADR-0030's `VITE_CANVAS_WORKSPACE`. M0–M5 have landed (flag/ADR, `<Toolbar>` primitive, TSLD registry, pen-gating + floating selection bar, the toolbar-hosted layout, the flag-on Playwright journey, and the M4/M5 review remediation — recalc-command regression, context/UI-state memoisation, toolbar-control CVA, the below-`md` pane switch, and the three a11y blockers); only the **default-on flip awaits product sign-off**. **Deferred fast-follows:** (a) **resolved 2026-07-13** — the floating `SelectionActionsBar` (M3) is now **mounted**: the canvas writes the selected activity's viewport anchor to a `selectionAnchorRef` each frame (ADR-0026 D3, only on moved frames), the bar reads it on its own rAF (transform-positioned, change-detected) to follow pan/zoom, clamps itself inside the viewport edges, hands focus back to the listbox when it hides/unmounts while focused, and Edit/Delete open host-owned dialogs via a shared `ActivityCrudDialogs` (the "Set constraint" action was dropped as redundant with Edit). **Accepted trade-off (new fast-follow):** floating just above the selection overlays the region directly above it, so on a dense diagram it can cover the activity in the lane above for as long as the selection is active — accepted as a contextual, transient overlay; a future lane-aware / side placement is the fast-follow. (b) the three plan-chrome dialogs (Plan details / Baselines / Calendar) are **duplicated** between `plan-actions-menu.tsx` (flag-off) and `plan-workspace-toolbar.tsx` (flag-on) — extract a shared `PlanChromeDialogs`; (c) the toolbar layout's **collapsed** state is session-local (not persisted; height still persists) — thread a `defaultCollapsed`/separate key through `useResizablePanelPrefs`; (d) on an **empty/uncalculated** plan the frame/lens/help commands are **hidden** (`isVisible: hasDiagram`) rather than shown-disabled-with-reason as the spec's edge-case prefers — accepted for now since the empty plan still surfaces its only relevant actions (Add activity + Recalculate), but reconcile spec↔code (either disable-with-reason, or update the spec) when the empty-state copy is next revised; (e) non-blocking a11y recommendations from the M5 audit — the toolbar doesn't `.focus()` the new roving stop when a `ResizeObserver` demote unmounts the focused button mid-session (rare; falls back to `<body>`); `aria-orientation="horizontal"` while Up/Down are also wired (harmless superset); the segmented zoom presets are `aria-pressed` buttons rather than a `radiogroup`; and a manual NVDA/VoiceOver pass on the `CompactPenStatus` live-region + Start/Stop/Take-over sequence is still owed. | Divergent code paths coexist behind the flag until the flip; three layered flags (`VITE_CANVAS_WORKSPACE` → `VITE_CANVAS_TOOLBAR`); the dialog duplication can drift. | Flip `VITE_CANVAS_TOOLBAR` default-on once signed off (**done**); mount the selection bar (**done**), dedup the dialogs (**done**); still to do: a lane-aware / side placement for the floating bar so it never covers the lane above, persist the collapsed state, reconcile the empty-state hide-vs-disable, and clear the non-blocking a11y recommendations as fast-follows once the layout has soaked. Rollout tracked in the flag comment (`env.ts`). |

| 32 | **`btree_gist` extension install needs `CREATE`-on-database at deploy (ADR-0036, M1)** | The M1 calendar-shift migration (`20260715120100_calendar_shift_model`) runs `CREATE EXTENSION IF NOT EXISTS "btree_gist"` — the **first** `CREATE EXTENSION` in the project — to back the GiST `EXCLUDE` non-overlap constraints on shifts/exception windows. Under ADR-0018 the self-migrating container runs `prisma migrate deploy` as the app DB role; a least-privilege managed Postgres role may lack `CREATE`-on-database. `btree_gist` is a **trusted** extension on PG13+, so a role with `CREATE` can install it, and the CI `image` smoke-boot exercises the whole migration via the entrypoint successfully — but this has not been run against a locked-down managed instance. | If the prod migration role lacks `CREATE`-on-database, `migrate deploy` aborts at container startup, blocking the entire release (not just calendars). | Before the first M1 deploy to a managed host, confirm the migration role has `CREATE`-on-database, or pre-install `btree_gist` out-of-band (superuser) so `IF NOT EXISTS` is a no-op. Record the chosen approach in `docs/DEPLOYMENT.md`. |

| 33 | **M1 minute-rework non-blocking review nits (ADR-0036)** | Non-blocking items from the M1 specialist reviews, deferred as cheap-later: (a) **security** — `durationDays` has `@Min(0)` but no `@Max`, and the new `× 1440` conversion lowers the `INTEGER` overflow threshold to ~1.49 M days; a huge value currently 500s (opaque `INTERNAL_ERROR`, no leak) instead of a clean 400 — add `@Max(3650)` to `create/update-activity.dto.ts` to match the `lagDays` pattern; (b) **api/db** — `MINUTES_PER_DAY = 1440` is redeclared locally in ~~6 files instead of importing the exported constant from `schedule/day-compat-calendar.ts` — centralise; (c) **api** — the read-side `Math.round(minutes / 1440)` silently rounds; harmless while every write is integer-day-constrained, but add a dev-only assert/log for `minutes % 1440 !== 0` once M3 makes non-day-aligned minutes reachable; (d) **backend-perf** — constraint `resolve()` is recomputed up to 3× per constrained activity across the forward/effective-Visual/backward passes — memoise the resolved constraint once per `computeSchedule`; (e) the `duration_minutes` DB `DEFAULT 480` (8 h) no longer equals "one working day" (the old `duration_days DEFAULT 1` = 1440) — defensive-fallback only (the service always sets it explicitly), note in the ADR. | All minor: (a) is a robustness/DoS-annoyance (clean 400 vs opaque 500); (b)/(c)/(e) are maintainability; (d) is a constant-factor CPU cost that multiplies exposure to the (now-fixed) calendar-walker cost. | Pick up (a)/(b) opportunistically; do (c)/(d) alongside the M3 lag-calendar wiring (when non-day-aligned minutes and per-edge calendars land); (e) is a one-line ADR note. |
| 35 | **M6-F7 float-&-critical settings review fast-follows (ADR-0035 §17/§18/§20)** | Non-blocking items from the F7 specialist reviews (ux/component/accessibility), deferred as section-wide or cheap-later rather than blocking the flagged slice: (a) **section-wide settings grouping** — the plan "Schedule" section now stacks five settings (Calendar / Recalc mode / Expected-finish / and F7's three float-critical controls) loosely with `mt-3` and no visible sub-heading; F7 groups its three for AT via a `fieldset`/sr-only-`legend` (edit) + `aria-label`ed `dl` (read-only), but a visible heading + tighter grouping was deliberately NOT added to avoid a lone sub-heading the four siblings lack — a whole-section "group + head the settings" pass (and the `mt-3`→`mt-6` spacing nudge the ux review flagged) is owed; (b) **shared labeled-select primitive** — `SelectField` landed 2026-07-27 (#42), but the `PlanScheduleOptionSelect` helper (promoted out of `PlanScheduleSettings.tsx`) was deliberately NOT folded into it: it is richer (optimistic value, `aria-busy`, a hint that swaps to “Saving…”), so the right move is to rebuild that helper ON `SelectField` rather than flatten it — tracked in #42; (c) **saving-state not announced** — the "Saving…" hint swap isn't in a live region, so only the final success/error announces (shared with the recalc/expected-finish siblings via `useOptimisticSelect`) — a shared-hook enhancement if busy-state announcements are wanted; (d) **error-path test gap** — F7 now tests the error/rollback + busy paths, but the recalc-mode/expected-finish siblings still don't, and `use-optimistic-select.ts` has no direct unit test. | All minor; F7 itself meets WCAG 2.2 AA and its states are tested. (a)/(b) are maintainability/consistency; (c) is a shared-hook nicety; (d) is a coverage gap on the siblings, not F7. | Do the section-wide grouping/heading/spacing pass when the plan-settings area is next revised; extract `SelectField` (folding #21(e)/#34(b)) at the next `<Select>` consumer and migrate `OptionSelect` onto it; add busy-state announce to `useOptimisticSelect` if wanted; backfill the error/busy tests for the sibling pickers + a direct `use-optimistic-select` test. |
| 37 | **WBS canvas summary bars + navigator-tree nesting deferred (ADR-0038, M5-epic F8)** | F8 shipped the WBS **form surface** — the Type picker offers `WBS_SUMMARY`, and a flag-gated WBS **parent picker** nests any activity under a plan summary (round-tripping `parentId` through create/update, behind `VITE_ADVANCED_ACTIVITY_TYPES`). The plan's explicitly **"deferrable" larger piece** was not built: (a) rendering a **summary span-bar** (and the LOE span-bar) on the TSLD canvas over the branch it heads (ADR-0026/0030 — a larger canvas piece); (b) showing the `parentId` hierarchy as **visual nesting in the Project Explorer / activities view** (indented tree rows under their summary, ADR-0029). Today the parent is set via a Select and the roll-up shows only in the activity's own dates. **Partly closed 2026-07-28:** the Gantt view (ADR-0059, default-on) renders indented, collapsible summary rows with a span-bar over each branch — so the grouping now has an at-a-glance surface. What is still open is (a) on the **TSLD canvas** and (b) in the **Project Explorer / activities table**. | Low: the WBS feature is fully usable via the form (create a summary, nest activities, Recalculate, dates roll up) — only the at-a-glance _visualisation_ of the grouping is missing. Now on the **default-on** surface (`VITE_ADVANCED_ACTIVITY_TYPES` flipped on), so a planner sees the type/parent pickers but not a canvas summary bar or nested tree. | Add summary/LOE span-bar rendering to the canvas mapping seam (a pure `RenderActivity` addition + painter branch, like the constraint-pin/overlap cues) and indented nesting to the activities table/navigator, with component + a11y (WCAG 2.2 AA) tests, when the canvas rendering work is next scheduled. |
| 34 | **No all-`TWENTY_FOUR_HOUR` lag scale smoke (ADR-0036 §6)** | The existing 500-node recalc smokes (`schedule.e2e-spec.ts`) exercise only the default `PROJECT_DEFAULT` lag path, which is zero-overhead by construction. There is no structural smoke at scale with, say, 500 edges **all** carrying `TWENTY_FOUR_HOUR` — the one path whose per-edge cost actually changed (0 → a few binary-search calendar calls). The engine unit test already proves _termination_ of a single ±11-year elapsed lag (`compute.lag-calendar.spec.ts`, N16), so this is the many-edge axis, not the huge-lag axis. (The row's second half — four copy-pasted `<Label>`+`<Select>` blocks across the dependency dialogs — is done: they are `SelectField` as of 2026-07-27.) | A coverage gap, not a suspected defect: the code is sound by reasoning plus the termination test, and it only bites on the rare all-24H plan. | Add the smoke next to the existing calendar-load smoke when that e2e is next touched — it would turn "O(log) by inspection" into a measured fact. |
| 40 | **Contributor cost-progress wiring (EV2a security review)** | Was a two-part row; **(a) is done** (2026-07-18): `@Max(MONEY_MINOR_UNITS_MAX)` on the integer-money fields and `@Max(DECIMAL_18_4_MAX)` on the `Decimal(18,4)` fields, with boundary-reject specs. What remains is (b): a Contributor can record progress but the cost-side inputs that progress implies are not wired to that role's write path. | Low — the fields exist and are validated; the gap is which role may edit them, and Contributors currently cannot, which is the safe direction to be wrong in. | Decide whether cost progress is a Contributor capability or stays Planner-only, then wire (or document) it explicitly rather than leaving it an accident of which endpoint shipped first. |
| 42 | **`SelectField` migration residue (was: composite not extracted)** — the primitive **landed 2026-07-27**; what remains is the sites it deliberately did not absorb. | A survey while extracting found the idiom hand-assembled **33×** across 15 files, not the ~6 this row claimed. `SelectField` (`components/ui/form.tsx`) now owns the label/hint/error/`aria-describedby` wiring and **16 sites moved onto it** (all seven in `ActivityFormDialog`, the five dependency-dialog selects, the cross-plan type + lag calendar, plan status, invite role). Not migrated, each for a stated reason: **(a)** the four **flag-forked** pickers (activity calendar, assignment resource, plan calendar, resource calendar) render a `Combobox` or a `Select` under one label — `SelectField`'s `renderControl` escape hatch exists for them but the fork also carries its own busy/optimistic state, so moving them is a behaviour change, not a lift; **(b)** the **optimistic-select family** (`PlanScheduleOptionSelect` and the `PlanRecalcModePicker` / `PlanExpectedFinishToggle` / `PlanCalendarPicker` siblings) — already extracted locally, and richer (optimistic value, `aria-busy`, a hint that swaps to “Saving…”); the right move is to rebuild **that** helper on `SelectField`, not to flatten it; **(c)** `CalendarFormDialog`'s Scope select, which reuses one `scopeErrorId` on two mutually-exclusive paragraphs — a real defect to fix on its own, not inside a refactor; **(d)** the five library/table **filter** selects, whose `aria-describedby` points at explainer paragraphs rendered outside the block (supported via the merge, but they are a filter row, not a form field); **(e)** `MembersTable`'s in-cell role select (no visible label, by design) and `OrgSwitcher` (a raw `<select>` with hand-copied chrome that has drifted from the primitive — its own bug). | Low and now bounded: the 16 migrated sites share one implementation, so the next a11y fix lands once. The residue is (a)/(b) genuinely different components, (c)/(e) latent defects worth their own change, (d) a judgement call. | Rebuild `PlanScheduleOptionSelect` on `SelectField` (absorbs (b), and then (a) becomes a lift rather than a rewrite); fix the duplicate `scopeErrorId` (c) and `OrgSwitcher`'s drifted chrome (e) as small standalone changes. Supersedes the `SelectField` asks in #21(e) and #34(b), which are now met. |
| 43 | **Resource-histogram bucket size not URL-deep-linkable (M7 rung-5 ux review)** | The histogram's Day/Week/Month `granularity` is component-local `useState`, so it can't be shared/bookmarked and resets to the WEEK default each open — unlike the URL-state convention (TanStack Router) the app uses for other view selections. | Minor: a planner re-picks the bucket size each time; nothing is lost. | Lift `granularity` into the plan route's search params (like other URL-derived view state) so the histogram opens on, and can be linked at, a chosen bucket size. |
| 45 | **Inter-project M2 (programme scheduling) web fast-follows (ADR-0045, IPD-M2 reviews)** | Non-blocking items from the M2 specialist reviews (ux/component), deferred behind `VITE_PROGRAMME_SCHEDULING` (default-off): (a) **ux** — the cross-plan link surface lives only on the flag-off plan-detail route + the flag-on canvas workspaces, but the flag-on **toolbar-hosted** layout (ADR-0031) mounts `ProgrammeScheduleSection` inside the workspace body rather than integrating a programme-recalc affordance into the toolbar chrome band; a first-class toolbar item is owed once the surface is considered for default-on; (b) **ux** — the cross-plan-link **picker** (`AddCrossPlanLinkDialog`) loads only page 1 of candidate predecessor plans/activities with no pagination or type-ahead, so on a large org a valid predecessor beyond the first page can't be selected — add search/pagination before default-on; (c) **component** — the stale/423/422 notice blocks in `ProgrammeScheduleSection.tsx` repeat a bordered "banner" shape (`role="status"`/`role="alert"` + icon-less coloured box) that also recurs elsewhere — extract a shared `Banner` primitive; (d) **component** — the cross-plan dependency-type / lag labels are duplicated inline rather than hoisted to a shared `lib/` constant (overlaps the existing dependency-label duplication); (e) **ux (flag-off race)** — adding a cross-plan link from the successor's Logic panel invalidates the org schedule namespace (to surface the programme section), which can racily unmount the still-open Logic panel — a planner sometimes has to re-open it to see the new "Driven by" edge (the flag-on programme e2e re-opens the panel to stay deterministic). Keep the panel open across the create's invalidation (e.g. a scoped invalidation or a stable dialog subtree) before default-on. | All minor; the M2 surface is behind a default-off flag and meets WCAG 2.2 AA. (a)/(b) are usability gaps that only bite at scale/once default-on; (c)/(d) are maintainability; (e) is a transient panel-close annoyance (the write always succeeds — the programme section appears regardless). | Before flipping `VITE_PROGRAMME_SCHEDULING` on: add a toolbar-integrated programme-recalc affordance for the toolbar-hosted layout, search/pagination to the cross-plan picker, and keep the Logic panel open across a cross-plan add. Extract a shared `Banner` primitive and hoist the cross-plan label constants to `lib/` when the next consumer lands. |
| 46 | **Notes M2 API non-blocking review items (ADR-0046, notes reviews)** | Non-blocking items from the Notes M2 specialist reviews (api/security/backend-perf). All three passed with no blocking findings; deferred: (a) **api** — the flat `NotesController` has no `GET …/notes/:noteId` single-item read (unlike the `dependencies`/`cross-plan-dependencies` flat controllers), so a client that gets a 409 "stale — refresh" on `PATCH …/notes/:noteId` must re-page the whole thread to refetch the one note; add `GET :noteId` for parity + a cheap 409-retry target when convenient (the flagged web M3 refetches the thread on 409, so it isn't blocking). (b) **api/backend-perf (repo-wide)** — the shared `PaginationQueryDto.order` (`asc`/`desc`) is accepted + Swagger-documented but silently ignored on the note-list endpoints (both directions hard-coded newest-first); this is a pre-existing repo-wide pattern also present in `dependencies`, not a notes regression — honour `order` or drop it from the base DTO for endpoints that don't support it, repo-wide. (c) **backend-perf (scale watch-item)** — `listByPlan` leads with `plan_id` against the **full** (non-partial) `notes_plan_id_created_at_id_idx`, so `entity_type='PLAN'` + `deleted_at IS NULL` are applied as post-index-scan filters; for a plan with a very high ratio of ACTIVITY→PLAN notes the backward index scan may heap-fetch many non-matching rows before filling a page. This is the accepted M1 index trade-off (ADR-0046 / `docs/DATABASE.md`), not an M2 defect. (d) **security (hardening)** — `NoteRepository.findAuthorNames` does an org-unfiltered `user.findMany` by id set; safe today (ids only ever come from already-org-scoped notes) but enforce that invariant (a guard/typed wrapper) rather than only documenting it, before the helper gets a second caller. | All non-blocking; M2 passed api + security + backend-perf review. (a) is a small ergonomic gap masked by the web thread-refetch; (b) is a pre-existing repo-wide DTO nit; (c) is an accepted, documented index trade-off (watch under skewed load); (d) is defence-in-depth on a currently-safe path. | Add `GET :noteId` (or document the omission) when the notes API is next touched; fix the `order` param repo-wide (honour or drop) as its own change; `EXPLAIN ANALYZE` `listByPlan` once a realistically activity-note-skewed dataset exists and add a partial `(plan_id, created_at, id) WHERE entity_type='PLAN' AND deleted_at IS NULL` index if it degrades; tighten the `findAuthorNames` scoping invariant before a second caller. |
| 48 | **TSLD export & print fast-follows (Stage C1, `VITE_EXPORT_PRINT`)** | Deferred by decision / from the six C1 reviews (all passed; the four blocking findings were folded before flip). (a) **ux/a11y** — app-handled **`Ctrl/Cmd+P`** is not wired: the native shortcut still prints the raw app chrome + one-viewport canvas bitmap rather than routing to the whole-diagram image path (US-4). Deferred deliberately — intercepting the browser print shortcut is a known footgun; add an opt-in app handler if planners ask. (b) **perf/devops** — no **CI bundle-budget gate** exists yet (the budgets in `docs/FRONTEND_QUALITY.md` are advisory until the walking-skeleton roadmap item); jsPDF is the first heavy lazy dep, so a `size-limit`/visualizer check asserting the jsPDF chunk stays off the initial bundle and under the per-lazy-chunk budget is now worth wiring. (c) **devops** — the **web image SBOM** (Syft over the nginx runtime stage) enumerates OS packages but not bundled npm components (`jspdf` et al.), because the runtime stage carries only built `dist/` assets — a structural gap for the SPA image, not specific to jspdf; add a build-stage CycloneDX/`pnpm licenses` SBOM artifact if npm-level completeness is wanted. (d) **perf** — the whole-diagram export raster caps at 8192 px/side (~256 MiB RGBA worst case); fine on desktop but a lower ceiling or a device-memory caveat may be warranted for constrained mobile. (e) **component** — the export image legend (`EXPORT_LEGEND`) and CSV column set are hand-authored mirrors of the live `TsldLegend` / activities table rather than a shared source; low-risk drift on a legend key / an intentional CSV superset, but a shared-source pass is owed if either grows. | All minor; C1 shipped with security/devops/perf/a11y/ux/component reviews green and the four blockers folded. (a) is a deliberate UX call; (b)/(c) are pre-existing repo-wide gaps this stage surfaces; (d) is a bounded, documented product cap; (e) is maintainability. | Wire an opt-in `Ctrl/Cmd+P` handler if requested; add a CI bundle-budget check now that a heavy lazy dep landed; add a build-stage npm-level SBOM artifact for the web image; revisit the raster cap / add a mobile caveat; extract a shared legend-entries + CSV-column source when either next changes. |
| 49 | **Nest `ThrottlerGuard` storage is in-process memory (per-replica)** | From the Stage F F-M3 security review (ADR-0051 guest read surface). The app-wide `ThrottlerModule.forRootAsync` (`app.module.ts`) declares no `storage`, so rate-limit buckets live in each API process's memory. Under horizontal scaling the global default (100/60 s) and the tighter guest-surface limit (30/60 s, the first genuinely unauthenticated surface) are enforced **per replica**, so the effective ceiling multiplies by the replica count. Sibling gap to #14(b) (Better Auth's own in-memory rate-limit store), which already calls for a Redis backing before scaling out. Trust-proxy resolution of the real client IP (the other half of a correct per-IP limit) **was** fixed in F-M3 (`app-setup.ts` now sets Express `trust proxy` from `TRUSTED_PROXY_IPS`). | Single-replica today, so the limit holds; the gap only opens on scale-out, where a scraper/DoS gets N× the intended request budget against the unauthenticated guest surface. | Back Nest's `ThrottlerModule` with the shared Redis store (`@nest-lab/throttler-storage-redis` over the ADR-0010 Redis) at the same time as #14(b)'s Better Auth store, before the API runs more than one replica. |
| 51 | **TSLD visual-refresh fast-follows (ADR-0052 M4/M5, `VITE_CANVAS_DIRECT_MANIPULATION` reviews)** | Non-blocking items deferred from the M4/M5 specialist reviews (perf/component/ux), all behind the default-off flag: (a) **perf** — there is still **no automated draw-budget/perf gate** for the TSLD canvas: ADR-0026's ≤ 4 ms p95 @ 2,000-activities budget is documented but unenforced in CI, and M5 briefly shipped a per-frame `computeEdgeFanOut` recompute (5–11 ms alone at 2,000 activities / 4,000 edges) that only review caught — a benchmark test (e.g. a vitest bench or a Playwright trace assertion over the synthetic 2,000-activity scene) would have failed it automatically. (b) **perf** — `classifyHit` iterates **all** activities per call (per pointer-move while the resize/lag zones are armed); cull the candidates to the visible set / a spatial bucket before default-on so hover cost is bounded by the viewport like the paint. (c) **ux** — the lag-run dash pattern (`[2,2]`) vs the non-driving link dash (`[4,3]`) may be too subtle a distinction at typical zoom; consider a visually distinct treatment (weight/colour-with-shape or a tick pattern) if planners misread lag runs as slack ties. (d) **component** — the M5 fan-out `elbowShift` derives from the **predecessor-side** offset only (`routeOrthogonal`'s last argument), so a bundle crowded ONLY on the successor side with identical anchor days gets no elbow separation — the lines still overlap on their vertical run. | All minor and flag-gated: (a) is a repo-wide testing gap the M5 near-miss made concrete; (b) only bites on very large plans with editing armed; (c)/(d) are legibility polish on rare topologies. | Add an automated canvas draw-budget check (bench or trace-based) before the flag flips default-on; cull `classifyHit` to visible candidates; revisit the lag-run treatment with planner feedback; fold the successor-side offset into `elbowShift` when the fan-out is next touched. |
| 53 | **Library `q` search is an unindexed (bounded) ILIKE — `pg_trgm` GIN deferred (ADR-0053 §4 / M4)** | The M4 search on `calendars`/`resources` uses Prisma `contains` + `mode: 'insensitive'`, i.e. `name ILIKE '%q%'` (OR'd with `code` on resources). A **leading-wildcard, case-insensitive** match is not a btree range, so no existing or addable btree index can serve it — not the `(organization_id, created_at, id)` composites, not `text_pattern_ops` (left-anchored only), not an expression index on `lower(name)` (prefix only). The chosen plan is deliberate: the leading equality on `organization_id` bounds the candidate set to **one tenant** in cursor order and the ILIKE is a recheck over it — a bounded filter, not a table-wide seq scan, at the ADR-0053 sizing of ≲1,000 calendars / ≲5,000 resources per tenant. For the same measure-first reason the archive filter added **no** index: `archived_at` is tri-state (`exclude`/`include`/`only`), so a partial `WHERE archived_at IS NULL` twin would serve only the default and would today be a byte-for-byte duplicate of the existing composite (no row is archived yet). | Low today and bounded by tenant size; it degrades linearly if a tenant's library grows well past the assumed ceiling (import-heavy tenants are the likely first case), or if archived rows come to dominate a library so the default list scans mostly-filtered entries. Both show up as list/search p95 creep, never as incorrect results. **Measured at the ADR-0053 ceiling during the M6 backend-performance review** (Postgres 16, every migration applied, one org seeded with 1,000 calendars / 5,000 resources): worst-case resource search (no match, full candidate scan) **3.8 ms**; a match at the tail of cursor order **3.2 ms**; the 1,000-calendar case **0.56 ms** — all two orders of magnitude inside the 200 ms p95 budget, confirming the deferral is correct at the stated scale. A committed seeded-benchmark test (so the claim is pinned in CI rather than living in a migration comment and this row) is still outstanding. Escalate only on further measurement (`docs/PERFORMANCE.md`): (a) a `pg_trgm` GIN index on `lower(name)` (`gin_trgm_ops`) — note it needs `CREATE EXTENSION pg_trgm`, a privileged one-off DDL step the app's DB role may not hold, which is part of why it is deferred; (b) a partial `(organization_id, created_at, id) WHERE deleted_at IS NULL AND archived_at IS NULL` composite if archived rows dominate; (c) a partial ORG-tier calendar composite if PROJECT rows dominate the org list (ADR-0053 "Follow-ups"). |
| 56 | **Pure gesture→overlay helpers live in `TsldCanvas.tsx` rather than a pure module** | Raised by the ADR-0054 M6 component review against `gestureSourceId` / `gestureGhostDetail`, but the finding is older and wider than this epic: `ghostRect`, `liveResize`, `lagChip` and their siblings — all pure `GestureState → overlay geometry` functions with no React, DOM or canvas dependency — already sit at the top of `apps/web/src/features/tsld/components/TsldCanvas.tsx` and are exported solely for unit tests. The ADR-0026 architecture puts pure render logic in `features/tsld/render/*`, so the whole cluster is on the wrong side of that seam. Moving only the two new ones was rejected as making the file _less_ consistent, not more. | Maintainability only — the functions are pure and fully unit-tested where they are. Cost is that a reviewer must read a 1,500-line component file to review pure geometry, and that the component file is the de-facto home for logic the architecture says lives elsewhere. | Move the whole cluster to a `render/gesture-overlay.ts` module in one pass (mechanical: re-export, update the two test files' imports), rather than migrating helpers piecemeal as each epic touches them. |
| 57 | **Recycle-bin list has no index for its filter or its sort, and the screen pages it to exhaustion** | The `deleted_at IS NOT NULL` filter and the `ORDER BY deleted_at DESC, id ASC` on all three `UNION ALL` branches are unindexed: `clients`/`projects`/`plans` each index `(organization_id, created_at, id)`, none carry `deleted_at`. So Postgres filters and top-N sorts over **every** row for the org in that table, live rows included. That predates TECH_DEBT #22 and was deliberately deferred there as measure-first. What #22 did not weigh: the screen fetches via `apiFetchAllPages` (`use-deleted-items.ts`), which walks `?limit=100` to exhaustion — so the scan is re-run **per page**, making one screen-open cost `O(pages x org rows)` rather than `O(org rows)`. #22's own commit used that same pagination-amplification argument to justify fixing the row over-fetch immediately; it applies with more force here, and I did not apply it consistently. | Grows with an org's total row count, not its deleted-row count, and multiplies by page count. Harmless on a small org; an org that has ever created and deleted a lot of plans pays it on every visit to Recently deleted. | **Measure first — this is still unmeasured** (the reviewing agent had no database either). Get an `EXPLAIN ANALYZE` at realistic row counts; if it confirms the scan, add the partial index already named in `recycle-bin.repository.ts` — `(organization_id, deleted_at DESC, id) WHERE deleted_at IS NOT NULL` per table. Also worth asking whether the screen should page to exhaustion at all. Raised by the backend-performance-reviewer agent, 2026-07-27. |
| 83 | **ADR-0068 §6 promises a count the calendar editor does not show** | §6 states the editor "names how many activities' displayed durations will change" when hours-per-day is edited, following the ADR-0053 §2 per-class-count pattern. What shipped is the consequence without the count ("an activity showing 10 days today will show a different number"), because no endpoint returns that count — it needs a per-calendar usage read across activities and plans. The ADR is corrected to record this as deferred rather than left describing a feature that does not exist (ADR-0058's rule). | Low: the warning is accurate, just less specific than promised. | A `GET …/calendars/:id/usage` returning the affected-activity count, or an amendment dropping the requirement if the count proves not worth the read. |

## Principles for managing debt

- Prefer paying debt down opportunistically while touching nearby code.
- Never add **undocumented** debt: if you take a shortcut, add a row here.
- Security- and data-integrity-related debt is prioritised above convenience.

## Detailed items

The table above carries the older, one-line rows. Items that need more than a table cell get a
section here. Both are the same register — the split is how much explaining a row needs, not how
important it is.

Headings are `### <number>. <title>`, always. Three rows had drifted to `##`, which made every
detailed item a child of "Principles for managing debt" in the document tree rather than a sibling
of its peers.

### 58. The tiered ruler and TODAY chip (ADR-0055 S4, deferred)

S4 landed the canvas month bands — the diagram on its own banded ground — but deliberately stopped
short of the tiered ruler redesign (year centred / month names / day numbers) and the TODAY chip.
Both are DOM work over the canvas, both were specified (`docs/specs/designed-ui/`, S4-F2), and both
were held back rather than rushed alongside a change to the painter's hot path in the same slice.

They are additive and behind the same `VITE_CANVAS_VISUAL_LANGUAGE` flag, so they can land as their
own slice without re-opening anything S4 shipped.

### 60. The Gantt's scroll behaviour is unmeasured on real hardware

The Gantt's substrate decision (ADR-0059 §1) rests on one claim: the live node count is bounded by
the viewport, not by the plan. That claim **is** measured — the flag-on Playwright journey
(`apps/web/e2e-gantt/gantt-scale.spec.ts`) seeds two plans an order of magnitude apart through the
API and asserts they render the identical row window, in a real browser, with the real virtualizer.
It is a structural assertion and it means the same thing on every machine.

What is **not** measured is how a 2,000-row programme _feels_ to scroll on the hardware a planner
actually uses. That is the same gap as #59 and for the same reason: the only browser available to
CI is a headless Chromium on a shared cloud runner, with no GPU compositor and no comparable
thermal profile. Row virtualization makes the per-frame cost independent of plan size in principle,
which is why this did not block the M6 flip — but "in principle" is exactly the phrase #59 exists
to distrust.

**What would close it:** open a 2,000-activity plan in the Gantt under DevTools on the ADR-0026 §16
envelope (a mid-tier laptop, iPad-class Safari), record dropped frames while scrolling, and note
the numbers in ADR-0059. Deliberately **not** turned into a CI gate: a millisecond threshold
measured on a runner would be noise dressed as a guarantee.

### 62. `canReadCost` is derived from the role because the DTO cannot say

The activity DTO returns `null` for a cost field that is **unset** and `null` for one the caller
**may not read** — the two are indistinguishable on the wire. So the tabbed activity editor
(ADR-0060 §6) decides whether to show its Cost tab from the caller's role, via
`deriveActivityEditorGating`'s `canReadCost` input, rather than from the payload.

That is sound **today** and only today: `cost:read` and `activity:update` are granted to exactly
the same roles (Planner and Org Admin, `org-permissions.ts`), so "can edit the activity" and "can
see its money" coincide, and the derivation cannot be wrong. It is a coincidence the code depends
on without being able to check.

The day those permission sets diverge — a role that may edit an activity but not see its cost, or
the reverse — the client will show or hide the Cost tab incorrectly, and no test will fail,
because every test asserts the current coincidence.

It now has a **second consumer**: the activity editor's Resources tab passes the same
`gating.cost.readable` into `ActivityResourcesPanel`, so an assignment's money fields follow the
Cost tab's answer rather than its own. That widens the blast radius of the coincidence without
changing its nature — one derivation, two surfaces.

**What would close it:** have the API say so rather than making the client guess — either a
`meta.permissions` block on the activity read, or a distinguishable "redacted" marker on the cost
fields (not `null`). Until then, treat the permission sets as coupled: changing one without the
other is a client bug in a different file.

### 63. The Progress tab carries no unsaved marker for its three panels

Every other tab in the activity editor shows a dirty/error marker in its tab label (ADR-0060 §4).
**Progress does not** — its three panels (Reported progress / How value is measured / Weighted
steps) own independent forms, and none of their state reaches the tab.

So: edit the weighted steps, switch to General, and nothing anywhere says the Progress tab has
unsaved work. The discard confirmation on close has the same blind spot — it names General,
Scheduling and Cost, never Progress. Neither is data loss with consequences (each panel is one
Save from durable, and the panels are visible the moment you return to the tab), which is why this
is debt and not a defect — but it is an inconsistency the tab strip's own rationale argues against,
found by the M6 UX gate.

**What would close it:** lift the three panels' `isDirty`/`errorCount` to the dialog — a callback
prop per panel, or a small shared context — and fold them into the same `marker()` the other three
tabs use, plus into `dirtyScopeNames` for the confirmation.

### 64. Fields still use native `disabled`, so a mid-session pen loss can drop focus

ADR-0060's Save buttons were moved to `aria-disabled` + a pointer-events guard (`ScopeSaveBar`),
because a natively-disabled button is blurred to `<body>` the instant it flips — and they flip on
every save. The **fields** they sit beside were not: they are still natively `disabled` when the
scope is un-writable.

That is fine while writability is fixed for a session, and it is not — the pen can be taken over
by another user mid-edit (ADR-0028), which flips every definition field from enabled to disabled
under whatever focus the user had. Rarer than the Save case (which fired on the happy path, every
time), same root cause, same WCAG 2.4.3 exposure. Raised by the M6 accessibility gate as the
lower-priority half of that finding.

**What would close it:** extend the `aria-disabled` treatment from `ScopeSaveBar` to the form
primitives (`TextField`/`SelectField`/`CheckboxField`), which would fix every gated surface in the
app at once rather than this editor alone — which is also why it is a separate piece of work.

**Widened by the convergence epic (ADR-0062).** The Resources surface is now a tab of the same
long-lived session rather than a dialog opened and closed in seconds, so its natively-`disabled`
controls (`ActivityResourcesPanel`'s assign fields, and `AssignmentRow`'s cost / units / rate saves,
driving checkbox, curve select and Unassign) sit inside exactly the window this entry describes.
`AssignmentRow` is the **worse** case and the one to fix first: on `canWrite` going false it does not
disable its editors, it **unmounts** them for a read-only summary line — a guaranteed focus-to-`<body>`
rather than a possible one. Raised by the ADR-0062 accessibility gate.

### 65. A link's lag or type edited from the dialog is not recorded for undo

The undo stack now covers a dependency **add** and **remove** symmetrically (the convergence epic's
M5, `recordDependencyAdd` / `recordDependencyRemove`), and the canvas lag-anchor drag records its
own change. What is still missing is the third way a link changes: the **Edit link** dialog, where a
planner sets the type, the lag and the lag calendar.

So `Shift+←/→` on a link is undoable and typing `5` into the same link's lag field is not — from one
panel, one row apart. That is a worse inconsistency than the gap the add seam just closed, because
both routes are visible at once.

**What would close it:** an `onEdited` seam on `EditDependencyDialog` carrying the **pre-edit**
snapshot (the inverse needs the old type/lag/lagCalendar, which the mutation's response does not
contain), recorded through a `dependencyEditCommand`. It wants a coalescing key so a lag nudged five
times is one undo step rather than five — which is why it is its own piece of work rather than a
line in the epic that noticed it.

### 66. A shaded create form still accepts input it cannot submit

The house rule is shade-with-a-reason, and `ScopeSaveBar` implements it correctly: the Save is
`aria-disabled` with the reason `aria-describedby`-linked. But on the two create forms this epic
shipped — **Add a link** (`AddLinkSection`) and **Assign a resource** (`ActivityResourcesPanel`) —
only the Save is gated. The fields above it stay fully interactive, so a member who cannot write can
fill in an entire form and meet the refusal at the end of it.

Not a WCAG failure (the reason is announced, and the control is reachable), and deliberately not
"fixed" by adding native `disabled` — that is #64's defect, reintroduced. It is the same question as
#64 from the other side: what the shaded _state_ of a whole form should look like.

**What would close it:** decide the pattern once — a `readOnly` pass-through on the form primitives,
or a section-level treatment — and apply it to both forms together. Raised by the ADR-0062
accessibility gate as a nit, and by its ux gate as "the form should say so before the last click".

### 67. The Logic panel's post-remove focus target is the whole panel

After removing a dependency, `ActivityLogicPanel` moves focus to a wrapper around **everything** —
both tables, the add form and the cross-plan/notes slots. It is not a regression (it is what
`DependencyEditor` always did, and it beats dropping focus to `<body>`), but this epic shipped a
better pattern one file over: `ActivityResourcesPanel` falls back to a narrow region around just the
assigned list, and lets its host override the target — which the dialog uses to focus its Close
button.

**What would close it:** narrow `regionRef` to the two `<section>`s and add the same host-override
seam Resources has, so removing a link from the dialog lands on Close and from the tab lands on the
list. Raised by the ADR-0062 accessibility gate.

### 68. **Add note** lands on the Notes tab but not in its composer

`openActivityEditor`'s `steps` intent carries `focusSteps`, which the editor wires to the steps
heading. The `notes` intent carries only the tab, on the reasoning that "the intent IS the reveal" —
true visually, but the native `<dialog>`'s initial focus is the ✕ close button regardless of which
tab is active (the pre-existing gap in #17c). So a keyboard or screen-reader user who chose **Add
note** still traverses ✕ → the Notes tab → the panel before reaching the composer.

**What would close it:** a `focusNotes` flag on the intent, mirroring `focusSteps` one line above it,
with the composer exposing a ref. Raised by the ADR-0062 accessibility gate.

### 69. Two idioms for editing a row in place

`AssignmentRow` saves each field with its own inline button; `DependencyTable` opens a dialog per
row. Both are defensible on their own and they now sit two tabs apart in one editor, so the
inconsistency is visible in a way it was not when each lived in its own pop-out.

**What would close it:** pick one row-edit idiom and state it in `docs/DESIGN_SYSTEM.md` (the
list/manage archetype is the natural home), then move whichever surface loses. Raised by the
ADR-0062 component gate as a suggestion — deliberately not rushed inside the epic that noticed it.

### 70. The API e2e harness cannot reproduce a same-plan write race

The WBS re-parent path takes the plan advisory lock so two mirror re-parents cannot both pass a
still-acyclic ancestor walk (ADR-0038 invariant (a), fixed in the WBS-improvements M0). The natural
regression test — two mirror `PATCH`es fired with `Promise.all`, the shape used by
`resource-hierarchy.e2e-spec.ts` and `dependencies.e2e-spec.ts` — **does not actually race** in this
harness: instrumenting the ancestor walk showed the second request beginning ~15 ms _after_ the
first transaction had already committed, on two separate keep-alive sockets, so it passes
identically with the lock removed. Concurrency itself is fine (two interactive Prisma transactions
were measured interleaving correctly) — the requests are serialised somewhere earlier in the
in-process Supertest path.

The consequence is that the three existing "serialises concurrent mirror X" e2e tests are weaker
than they read: they prove the rejection path, not the serialisation. The lock is gated instead by
unit tests that assert the acquisition and its ordering directly, and fail when it is removed.

**What would close it:** either drive the race below HTTP (two concurrent service calls, or two
hand-rolled transactions racing the read-then-write with a barrier between the read and the write),
or accept the HTTP tests as invariant tests and rename them so they stop implying a concurrency
guarantee. Until then, do not add another "serialises concurrent …" e2e test and treat it as a gate.

### 71. The WBS band's derived bucket is distinguished by colour and label, not shape

`paintWbsBand` draws the derived **Unassigned** bucket as the same rounded rect as a real summary,
in a different fill (`--color-muted-foreground` vs `--color-primary`) with its label on top. Every
pairing clears 4.5:1 in all three themes today, so this is not a contrast failure — but at a zoom
where `truncateToWidth` drops the label entirely, the only remaining difference is colour (WCAG
1.4.1). Its Gantt sibling deliberately does better: `GanttBucketRowView` draws a **bracket**, not a
bar, precisely so the bucket is not a fourth kind of bar on the chart.

**What would close it:** give the derived bar a shape cue — a hairline dash, a squared corner —
matching the Gantt's stated rule. Raised by the ADR-0063 M6 accessibility gate as a recommendation;
also flagged by the UX gate, which noted the `muted-foreground`-as-fill / `primary-foreground`-as-ink
pairing is not one of the design system's validated pairs and has no contrast test pinning it.

### 72. Bulk-selection checkboxes are a 16px target, and hand-rolled

The activities table's new selection column renders a bare `size-4` `<input type="checkbox">` per
row. `ActivityMembersPanel` does better for the same job — the whole row is a clickable `<label>` —
and `CheckboxField` (`components/ui/form.tsx`) exists to stop the chrome being hand-assembled at
all. It is not a regression (`TsldViewControls` and the toolbar registry already hand-roll the same
className for compact inline toggles), but the selection column is the fifth occurrence of a shape
the design system has a primitive for.

**What would close it:** widen `CheckboxField` to support a visually-hidden label and trailing row
content — the two reasons a straight swap is not free today — then move all five call sites, and
make the table row itself the hit target. Raised by the ADR-0063 M6 component and UX gates.

### 73. `Column.srHeader` is dead once `headerCell` is set

`DataTable`'s render ternary takes `headerCell` first, so a column declaring both (the activities
table's Select column does) silently ignores `srHeader`. Harmless today — the checkbox carries its
own `aria-label` — but it is a prop that looks load-bearing and is not.

**What would close it:** either drop the redundant `srHeader` at the call site and say so in the
`Column` docblock, or make the two compose (render the sr-only text _beside_ the control). Raised by
the ADR-0063 M6 component gate.

### 74. The plan advisory lock's contention headroom is unmeasured

Five write paths now serialise on the same per-plan advisory key — activity create/update (parent
branch), the batch membership write, dissolve, and recalculate — and none of the `$transaction`
calls sets an explicit timeout, so they share Prisma's 5 s default. At the ~2,000-activity ceiling,
if recalculate's hold time approaches that default, a batch WBS write queued behind it would fail
with a P2028 timeout rather than waiting cleanly.

**What would close it:** seed a 2,000-activity plan, measure recalculate's hold duration on the key
and a concurrent `PATCH …/activities/parents`'s wait, then set explicit transaction timeouts against
the measured numbers. Raised by the ADR-0063 M6 backend-performance gate as an open risk, not a
confirmed defect — the design (plan-scoped key, skipped on the uncontended path) is otherwise sound.
Related: the parent-chain walk inside that lock has **no depth cap**, unlike the resource tree's
documented ≤ 10 (ADR-0053 §3).

### 75. Is ≤ 4 ms p95 the right draw budget? (measured for the first time, and missed)

ADR-0026 §16 states ≤ 4 ms p95 at 2,000 activities, and #59 records that it had never been measured
on real hardware. It now has been, for the first time — by `apps/web/scripts/measure-link-routing.mjs`,
which paints the real `paintScene` against a real 2D context in Chromium over 120 panning frames at
2,000 activities and ~1,500 long-range dependencies:

| zoom                                 | routing off (p50 / p95) | routing on (p50 / p95) |
| ------------------------------------ | ----------------------- | ---------------------- |
| whole plan (2px/day, nothing culled) | 13.3 / 16.7 ms          | 17.7 / 22.6 ms         |
| week (12px/day, cull working)        | 18.1 / 23.1 ms          | 21.6 / 26.9 ms         |

**The `routing off` column is today's shipped painter**, so the overrun is pre-existing and was not
caused by ADR-0065 — that change adds 3.4–5.9 ms p95 on top of it, and was enabled anyway with the
number in hand.

**The open question is the target, not the painter.** 4 ms was written in ADR-0026 when the canvas
drew bars, links and a grid. It now also draws month bands, a WBS band, float and drift tails,
non-working hatching, flanking dates, arrowheads, lag runs and handles — every one of them an
accepted decision with its own ADR. A budget set before two thirds of the picture existed, never
once measured against it, is more likely to be the wrong number than an indictment of nine
subsequent features. What matters to a planner is that panning and dragging feel smooth, which is a
question about **frame pacing under `requestAnimationFrame`**, not about one function's wall-clock.

Two caveats on the numbers above, stated rather than buried: the browser is a **headless container
Chromium with software rasterisation**, close to a worst case for canvas fill and explicitly _not_
the "mid-tier laptop and iPad-class Safari" envelope #59 names; and the fixture is adversarial by
construction (fifty fully-occupied lanes, every edge spanning seven of them) because a gentler one
would not exercise the code being budgeted.

**What would close it**, in order:

1. **Decide what to measure.** Dropped frames and input-to-paint latency during a pan/drag on a
   representative plan, rather than `paintScene`'s own duration on a synthetic worst case. The
   current script measures the latter because that is what could be measured without a seeded
   database; it is a starting point, not the benchmark.
2. **Decide what "representative" is.** 2,000 activities is ADR-0026's stated ceiling, but nobody
   has checked it against a real programme. The largest plan the product owner actually runs, and
   the largest an imported XER produces, are both facts we can get.
   **Partly answered — ADR-0066 M4.3.** The seed catalogue's scale generator now produces a plan of
   a declared, asserted shape (three-level WBS, 1.6 links per activity, milestones, LOE hammocks, a
   progressed front), and `measure-link-routing.mjs` takes it as a second scene. Both scenes were
   run back to back on **the same container** so only the picture differs.
   The figures were taken before a topology defect was found in the generator — its bands ran in
   series, so the plan was one long chain (ADR-0066 M4). That defect was in the plan's **logic**,
   not in the picture: `scale-scene.ts` lays the bars out itself and never reads the engine, and it
   had already been fixed to run phases concurrently. The numbers therefore still describe the shape
   the generator now produces.

   | scene                    | zoom                 | routing off (p50 / p95) | routing on (p50 / p95) |
   | ------------------------ | -------------------- | ----------------------- | ---------------------- |
   | grid (synthetic lattice) | whole plan (2px/day) | 9.4 / 11.6 ms           | 12.7 / 20.9 ms         |
   | grid                     | week (12px/day)      | 11.3 / 14.2 ms          | 13.4 / 17.7 ms         |
   | scale (realistic)        | whole plan (2px/day) | 14.6 / 18.7 ms          | 16.1 / 23.5 ms         |
   | scale                    | week (12px/day)      | 5.5 / 6.7 ms            | 5.5 / 6.7 ms           |

   Two things fall out, and they point opposite ways. At **whole-plan zoom the realistic plan is
   dearer** — 18.7 vs 11.6 ms baseline — which is what 2,160 bars (the WBS summaries are bars too),
   a dozen bar widths and 3,200 links cost against 2,000 uniform bars and 1,493. At the **working
   zoom it is less than half** — 6.7 vs 14.2 ms, with routing free to two decimal places — because
   real logic is dense inside a band and sparse across bands, so the cull actually works. The
   synthetic lattice, whose every edge spans seven lanes, defeats the cull by construction and had
   been standing in for a programme.
   So the honest summary is that **the scene dominates the number**, which is the reason this entry
   exists. It does not rescue the 4 ms budget: the realistic plan misses it 4.7× at whole-plan zoom.
   It does say the working zoom — where a planner spends their time — sits at 6.7 ms p95, inside one
   60 Hz frame.
   One trap worth recording, because it produced a much prettier and entirely false number first: a
   generated plan laid out nose-to-tail spans **28 years** at 2,000 activities, so the "whole plan"
   zoom culled roughly nine bars in ten and reported 4.6 ms p95. It looked like the budget being met.
   The layout now runs a phase's bands concurrently (`scripts/scale-scene.ts`), which puts the plan
   at about two and a half years and fills the viewport — that is what makes the two scenes
   comparable at all.

3. **Run it on the envelope ADR-0026 names.** Take **500 activities as well as 2,000** — 2,000 is
   the stated ceiling, but two points tell you whether the cost scales with the plan or with the
   viewport, and only the second is a design property worth having. (This clause is the residue of
   the former #59, folded here: both rows waited on the same single run, so closing one would have
   left the other stale — the failure this register keeps having.)
   Two routes exist, and the runbook is
   [`docs/guides/measure-draw-performance.md`](guides/measure-draw-performance.md).
   **Route B** is `pnpm --filter @repo/web measure:draw` — a checkout, one install, one command,
   about a minute, timing the painter alone on a generated 2,000-activity programme. It runs
   **headed** on purpose: headless Chromium can rasterise Canvas 2D in software, so a headless
   figure measures a path no planner runs, and the script prints a loud warning when it is.
   **Route A, added 2026-08-03, needs no install at all** — the operator runs the app as a Docker
   Compose stack and asked for a way to measure it without putting a toolchain on a second machine,
   which was the last thing standing between this row and a number.
   `apps/web/scripts/measure-draw-in-browser.js` is pasted into DevTools on a real plan; it wraps
   `window.requestAnimationFrame`, reads the display's refresh interval from a 2-second idle phase
   and then measures 10 seconds of panning.
   Route A is the **better** answer to step 1 above, not merely the more convenient one: it reports
   frame pacing and dropped frames on the real machine, real plan and real GPU, where the harness
   reports one function's wall-clock on a synthetic scene. It is the _worse_ answer to "what does
   the painter cost", because a frame includes the ruler sync and the interaction layer — so it
   reports the whole frame **and** the heaviest single callback, and neither figure is implied by
   the other.
   **Scope narrowed 2026-08-01 (product-owner decision): laptop only, iPad deliberately not
   covered.** A planner authors on a laptop; the iPad is a review device, where the printed
   programme and the Gantt matter more than canvas draw. If the canvas ever becomes a primary iPad
   surface that gap reopens, and the runbook says so rather than leaving it implied.
   **Awaiting the product owner's run** — Route A, at Fit and at Week zoom, with the machine named.
4. **Then set a number and gate it**, replacing ADR-0026 §16's figure by amendment. If the real
   answer is "smooth at 2,000, and 16 ms is fine because it is one frame at 60 Hz", the budget was
   simply wrong and should say so. If it is not smooth, ADR-0026's own reserved escalations —
   dirty-region repainting, then WebGL — are the route, and they now have a measurement to aim at.

Raised by ADR-0065 T21; the product owner accepted the routing cost and asked for the benchmark
itself to be examined. Related: #59 (the unmeasured envelope, which this supersedes in part).

### 76. Deferred follow-ups from the ADR-0064/0065 enablement review

Five specialist reviews ran over the combined authoring + routing diff. Every **blocking** finding
was fixed with a regression test (see `docs/DECISIONS.md`), as was one non-blocking one — the
`toolbarSplitCaretVariants` docblock, which still said a true split button "would need its own
composite-stop design. Until that lands…" while two had since landed on it. That was corrected in
the same pass rather than deferred, because ADR-0058 makes documentation drift a defect class here
and the fix was a comment. These are the rest, recorded rather than rushed:

- **Two hoists that would shrink the measured routing cost** (performance review). `activityRect` is
  computed three times per visible activity per frame with routing on — once in `cull()`, once in
  `laneIntervalIndex`, once in the `rects` map the bar layer builds later; and `crossedLanes` is
  computed twice per edge (`routeOrthogonal`, then `bundleCorridors`). Both are pure duplicated work
  with an obvious fix (build `rects` before the edge block; carry the crossed-lane list on the
  per-edge descriptor). They are inside an overhead already measured and accepted, so they belong
  with **#75** rather than blocking a release.
- ~~**A fourth hand-rolled "message + optional action" strip.**~~ **Done 2026-08-01** —
  `components/ui/notice-strip.tsx`. `EditConflictBanner`, both faces of `CanvasModeBand` and the
  canvas empty state now compose it. Three of the four had already drifted on radius, padding or
  alignment with no reason behind any difference. `tone` and `emphasis` are separate axes so a fifth
  caller cannot need a `neutralDashed`, and the **role stays the caller's** — a tone→role mapping
  would get the mode band wrong by construction, since it must have no live region at all.
- ~~**The split-button composite is duplicated**~~ **Done 2026-08-01** —
  `components/ui/toolbar/ToolbarSplitButton.tsx`. It now _guarantees_ the two facts each caller had
  been asked to remember: the pair is one roving stop, and `primaryRef` is the only ref a menu can
  restore focus to (the defect that shipped on both).
- ~~**`ArrowUp` does not open either type menu**~~ **Done 2026-08-01** — the shared primitive
  accepts either arrow, with a regression per control.
- ~~**The pen-loss-mid-pick case is untested at every layer**~~ **Done 2026-08-01** —
  `e2e-authoring-flow/authoring-flow.spec.ts`. It releases the pen with a pick open and asserts the
  outcome that matters: **no dependency**. Then it takes the pen back and links properly, so the
  refused attempt is shown to have left no wedged state. Writing it turned up a harness fact worth
  keeping: `mapBars` probes by clicking in `select` mode, so measuring while a tool is armed returns
  an empty map — the test disarms first.
- **Still open — no flag-off regression for the _pointer_ two-click link pick.** The echo plumbing
  (`onLinkPickStep`/`linkPickPredecessorId`/`dropLinkPickSignal`) is wired unconditionally on top of
  the pre-existing ADR-0032 M5 gesture, and nothing proves it is inert with the epic's flag off; the
  only tests touching pointer-driven dependency creation exercise the old edge-drag. Deliberately
  **not** faked in jsdom: a pointer pick needs a hit test against a canvas with real layout, which
  jsdom does not provide (`TsldCanvas.test.tsx` defers the same half for the same reason), so a unit
  test here would assert the client's optimism back at itself. It belongs in a flag-off Playwright
  run, which the repo has no configuration for today — that, not the assertion, is the work.

### 81. CodeQL `js/http-to-file-access` on the seeder's `--out` report

CodeQL flags `writeFileSync(args.out, JSON.stringify(results))` in `apps/seed-cli/src/main.ts` as
"network data written to file" — the negative tier's report contains the API's own response codes
and messages, which are network-sourced, and they land on disk.

**Assessed as a false positive for this call site, and left open rather than silenced.** The rule
guards against a remote payload reaching a file that something later executes or parses unsafely.
Neither half holds here: the **path** is `args.out`, an operator's own CLI argument and not
network-derived, so there is no traversal; and the **content** goes through `JSON.stringify`, so a
hostile response body cannot break out of the JSON it is quoted into. Writing that report is the
entire purpose of the flag — the run exists to record what the API refused.

Deliberately **not** worked around. The available moves were to drop `--out`, to write the report
somewhere the operator did not choose, or to launder the values through a copy so the taint tracker
loses them; the first two make the tool worse and the third changes nothing real while making the
code lie about why it exists. A scanner finding that a reviewer has assessed and disagreed with
should be dismissed in the GitHub UI with that reasoning attached, which is a repo-admin action.

Kept as an entry so the next person to see the alert finds the analysis rather than repeating it.
The sibling alert from the same scan — `js/polynomial-redos` on `client.ts` — **was** real and was
fixed (`stripTrailingSlashes`, with a regression test measured against the old implementation
first). One of two is the ordinary ratio, and it is the reason the pair should be read rather than
batch-dismissed.

**The CodeQL check going green does not mean this alert closed.** PR #204's check reported "2 new
alerts including 1 high severity" and turned green once only the **high** one was fixed — the
`main.ts` line this entry is about was never touched. So the gate fails on high severity and this
medium alert is still open on the branch. Worth knowing before reading a green CodeQL as "no
findings": it means "no findings above the threshold".

**One part of it was real, and is now fixed.** Re-reading the flow for this entry found that the
_size_ of what a server can put in the report was unbounded: the raw-text fallback clamped to 200
characters, but the parsed-envelope branch passed `code`, `message` and `details` through verbatim,
and `--out` writes them to disk. A seeder pointed at a broken or hostile endpoint could therefore
spend the operator's disk one finding at a time. Now clamped (2,000 / 500 / 100 characters, with the
truncation stated rather than trailing off mid-word). This does **not** clear the alert — the taint
flow is unchanged — and it was not done to. It is the one genuine defect the rule's neighbourhood
contained, found by taking the finding seriously rather than by trying to satisfy it.

### 84. Levelling is quadratic in the number of activities contending on ONE resource

**Found by** the backend-performance review of ADR-0071 M2, which measured `level.ts` before and
after the join-lag rework and reported the honest result: the new implementation is marginally
**faster** than the old at every size tested (500 → 16,000 activities), and both are quadratic in
one specific shape — many activities competing for a **single** resource. At 16,000 such activities
a levelling pass takes ~11.6 s.

**It is pre-existing and this diff did not change it.** It is recorded because ADR-0041 §F's
boundedness wording ("`O(k log k)`, never a per-minute scan") is easy to read as ruling this out,
and it does not: §F rules out cost that scales with the **span** being levelled — the defect where
a two-year plan costs a thousand times a two-day one regardless of how much work it holds. It says
nothing about cost that scales with the number of **contenders**, which is what this is. A reader
checking whether levelling is bounded would find §F, find it satisfied, and stop.

**What would fix it**, if a real plan ever hits it: the serial priority-list heuristic re-scans the
resource's committed intervals for each candidate placement. An interval tree, or carrying a
per-resource cursor forward through the priority order, would take it to `O(n log n)`. Neither is
worth doing on a measurement of a synthetic worst case — a real programme spreads demand across many
resources, and the shape that is slow is one crew doing 16,000 activities in sequence. **Measure a
real plan before building either** (ADR-0053 M4's rule: an index is added on a measurement, not an
instinct).

**Also measured, and accepted:** baseline capture went from ~384 ms to ~920 ms at 2,000 activities /
6,000 assignments, all of it inside the plan-locked transaction, because ADR-0071 M3 now freezes the
per-assignment cost decomposition alongside the activity rows (CQ-1 "extend the baseline — exact").
That is the cost of the answer being exact rather than approximated, it is a once-per-baseline
operation a planner initiates deliberately, and 920 ms is well inside what a captured snapshot is
expected to take.

---

### 85. Two `react-hooks/refs` suppressions in the TSLD toolbar-context memo

**Where:** `apps/web/src/features/tsld/toolbar/use-tsld-toolbar-context.tsx` —
`buildDiagramImage`'s `canvasControlRef.current?.getViewport()` and the `goToNextConflict` entry
in the returned context object.

**What happened.** Adding three properties to the context `useMemo` for the Float paths item
(`activityCount`, `floatPathsOpen`, `toggleFloatPaths` — audit F4 M1) made the React Compiler start
reporting `Cannot access refs during render` on **two pre-existing ref reads that did not change**.
Neither reads a ref during render: `buildDiagramImage` runs when an export command is invoked, and
`goToNextConflict` on a Next-conflict click. The trigger is the compiler's analysis of an
already-large hook, not a change in what the code does — removing any one of the three new
properties clears both reports, and they return when it goes back.

**What was done.** Two `eslint-disable-next-line react-hooks/refs` comments, each naming the
callback the read actually happens in and pointing here. Nothing was moved and no behaviour changed.

**What would fix it.** Split `useTsldToolbarContext`'s single ~250-property memo — the export/print
commands are the obvious seam, and they are also the only part that reads the canvas handle. That is
a refactor of a file eight suites render directly, so it is worth doing deliberately rather than
inside an epic about float paths. **Do not remove the disables without doing that first**; they will
simply come back, and the next person will not know they were considered.

The float-paths surface deliberately does **not** add a third ref reader: its select-and-reveal seam
lifts the workspace selection and lets each view reveal it, rather than calling `centerOnDate` —
which is null whenever the Gantt is showing, so half its work would be silently skipped in half the
product anyway.

### 86. A `RESOURCE_DEPENDENT` activity's day factor is read from the wrong calendar

**Found:** 2026-08-03, by the component gate on the derived-duration fix. **Pre-existing** — the fix
inherited it rather than introducing it.

`effectiveHoursPerDay()` (`apps/web/src/lib/effective-hours-per-day.ts`) resolves the factor as the
**activity's own** `calendarId`, falling back to the plan's. That is correct for every activity type
but one. For a **`RESOURCE_DEPENDENT`** activity, ADR-0039 §23 makes the **driving resource's**
calendar authoritative — the service resolves and overrides the activity's own, which
`ActivityCalendarField.tsx` already documents on screen. The web factor never accounts for it.

**What it costs.** Any day-denominated figure the client _renders_ for such an activity is measured
against the wrong day length: the assignment join-lag field (shipped under ADR-0071) and now the
derived-duration preview. Both are display and neither writes a wrong value — the API stores
minutes, and the engine reschedules on the correct calendar regardless — so this is a misleading
read-out, not corrupt data. It bites only where a `RESOURCE_DEPENDENT` activity has a driving
resource on a calendar whose `hoursPerDay` differs from the activity's own.

**Why it is not fixed here.** `AssignmentRow` cannot resolve it without the driving `resource.calendarId`
plus the calendars list plumbed to a component that currently needs neither — real work, and out of
scope for a three-line formatter fix. Doing it badly (guessing, or resolving in two places) is how
the flat-1440 defect this entry sits beside came about.

**The fix when it is taken:** teach `effectiveHoursPerDay()` the `RESOURCE_DEPENDENT` branch — take
the driving assignment's resource calendar when the type is `RESOURCE_DEPENDENT` and a driver
exists, else today's answer — so every caller is corrected at once rather than per-surface. The
engine is not involved and the recalc parity gate is untouched.

---

## Closed numbers

Rows are **deleted** when done (see the rule at the top) — but the number is never reused, and this
ledger is why. Two different items were both numbered **83** because a freed number looked available;
one was open and one was resolved, in the same file. The register disagreed with itself about what a
number meant, which is the failure mode this whole document exists to avoid.

It also keeps inbound references resolvable. ADRs are never rewritten (CLAUDE.md §6) and
`DECISIONS.md` entries are not edited once recorded, so both still cite rows by number long after the
row is gone — ADR-0047 cites #29, ADR-0066 cites #79 and #80. Without this table those read as
dangling.

One line each. The story lives where the link points, not here.

| #   | What it was                                                 | Closed     | Where the record is                                          |
| --- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| 29  | Released images not pulled — "shipped but not live"         | 2026-07-30 | ADR-0047; `docs/DEPLOYMENT.md`. Superseded by #5.            |
| 59  | The device-authoritative draw measurement was never made    | 2026-08-03 | Folded into **#75**, which waits on the same single run.     |
| 77  | The demo Unit 300 file was a lossy rendering of the fixture | 2026-08-01 | ADR-0066; `docs/TEST_PLAYBOOK.md`.                           |
| 78  | Public activity/dependency API was day-denominated          | 2026-08-02 | ADR-0070. `durationMinutes` / `lagMinutes` are on both DTOs. |
| 79  | A window-only calendar was rejected by the API              | 2026-08-01 | ADR-0067. Pinned by `calendars.e2e-spec.ts` "window-only".   |
| 80  | Intraday shift patterns had no write path                   | 2026-08-01 | ADR-0067. `shifts` on the calendar create/update DTOs.       |
| 82  | Shift-editor epic — the non-blocking half of five gates     | 2026-08-01 | ADR-0067 M4; all seven sub-items landed.                     |
| 83¹ | A typed duration overwritten by the calendar factor landing | 2026-08-02 | ADR-0070 M6. `useDurationSeed` reads the field, not a flag.  |

¹ **The collision.** This 83 is _not_ the 83 in the table above, which is open (ADR-0068 §6's missing
usage count). Two pieces of work took the same number. The live row keeps it; this one is recorded
here by title so neither reference is ambiguous.

**Next free number: 87.**
