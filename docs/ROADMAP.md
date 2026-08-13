# Roadmap

> Product direction for **SchedulePoint** (see [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md)
> for the full vision and MoSCoW scope). This tracks milestones at a coarse grain;
> per-feature specs and plans live in [`specs/`](specs/), produced via the delivery
> process ([`PROCESS.md`](PROCESS.md)). Early features split their plan into
> [`plans/`](plans/README.md) — historical, and not where new work goes.

## Purpose

Deliver a browser-native construction scheduler built around a **Time-Scaled Logic
Diagram (TSLD)**, to a consistent production-quality bar, in thin vertical slices that
keep `main` releasable.

## Delivered

- **M0 — Engineering foundation.** Turborepo + pnpm monorepo, strict TypeScript,
  lint/format, CI/CD (quality + API/web e2e + CodeQL + release + GHCR image
  publishing), Docker, docs, ADRs, delivery process, agents. (The reference
  template that seeded the backend standard was retired once real modules
  superseded it — ADR-0057.)
- **Identity & tenancy.** Better Auth, `User`/`Organization`/`OrgMember`, org-scoped
  RBAC (Viewer/Contributor/Planner/Org Admin), members + invitations, onboarding +
  org switcher (ADR-0003/0012/0016).
- **Hierarchy.** Client → Project → Plan CRUD with soft-delete + cascade restore
  (recycle bin), web browse/CRUD.
- **Activities.** Activity model + CRUD, progress reporting (Contributor split), web
  table + progress editor.
- **M4 — Dependency logic.** Four dependency types (FS/SS/FF/SF) with lag, the DAG
  invariant + cycle prevention, web logic panel (ADR-0021).
- **M6 — CPM engine.** Forward/backward pass, total float, critical + near-critical,
  moderate constraint clamping, synchronous recalculate + summary, engine-owned
  batched write, web computed columns + Recalculate action (ADR-0022/0023).
- **M5 — Working-day calendars.** Weekday-mask + dated-exception calendars behind the
  engine port, org library + per-plan default, web calendar library + plan picker
  (ADR-0024).
- **Progress & retained logic (conformance M2).** Explicit remaining duration,
  suspend/resume, and a plan **recalc mode** (Retained Logic / Progress Override /
  Actual Dates) with a data-date floor; web progress-ingestion editor **on by default**
  (ADR-0035 §1–§6).
- **Advanced constraints (conformance M4).** Mandatory **produce-and-flag** (a pin that
  breaks logic is scheduled and flagged, never silently fixed), a **secondary** constraint
  on the backward pass, **as-late-as-possible** placement, and **expected-finish**
  resizing; web _Advanced scheduling_ editor + Conflict badge + plan Expected-finish
  toggle, **on by default** (ADR-0035 §7–§14, §22).
- **Hour/shift-granular calendars (conformance M1) & per-activity calendars (M5).**
  Working-**minute** engine axis with intraday shift patterns and time-window exceptions;
  each activity schedules on its own resolved calendar (activity → plan → 24/7) on an
  absolute-instant frame; web per-activity calendar picker **on by default**
  (ADR-0036/0037).
- **Scheduling modes & a de-overloaded plan start (ADR-0033).** A mandatory project
  **data date** split from an ephemeral **Go-to-date** view control; a plan-level
  **Early / Visual** scheduling mode with a read-only **Late-Start** overlay; Visual
  Planning drags record an advisory `visualStart` that pushes successors and flags
  conflicts rather than auto-correcting. On by default.
- **Engine conformance framework (ADR-0034/0035).** A P6-class torture-test fixture as a
  versioned benchmark + living **capability matrix**; a three-tier harness (engine-free
  structural gate, differential "flip-one-option-must-differ", no-oracle golden
  snapshots) and the negative-case reject/repair/report contract, with SchedulePoint's
  CPM semantics documented as the golden contract.
- **M7 — Baselines.** Named plan-of-record snapshots (snapshot-copy model), one active
  baseline per plan, server-side working-day variance, web baselines panel + variance
  columns (ADR-0025).
- **Date constraints (web).** The activity form now offers only the six constraint types
  the engine honours as-labelled (parked `MANDATORY_*` no longer newly selectable; a
  legacy value is shown honestly, never silently coerced); a set constraint is surfaced
  in the activities table and as a pin on the TSLD canvas, and "parked constraints" is
  explained in the schedule summary. No API/engine change (ADR-0023 §6 already governs
  the semantics; near-critical shading shipped in M6).

- **Project Explorer (web).** A persistent app-shell with a collapsible/resizable
  Client → Project → Plan navigator rail — an accessible, virtualized ARIA tree with
  deep-link reveal — replacing click-through navigation (ADR-0029). **In-tree CRUD is
  now ON by default** (2026-07-12): writers create/rename/soft-delete directly from a
  row context menu (⋯ button, right-click, ContextMenu/Shift+F10 key, touch long-press)
  plus a rail-header "New client", reusing the existing form/confirm dialogs and the
  soft-delete/Recently-Deleted flow via a hand-rolled APG `Menu` primitive and a
  shell-layer CRUD coordinator (no backend change).

- **The seed catalogue (ADR-0066).** A test bed that proves the **application**, not just the engine.
  The ADR-0034 harness feeds `computeSchedule` — a pure function — so all 117 capability keys were
  proven at the engine and none at the application; two defects found on one day were green at the
  engine and wrong in the product. Five tiers of plan created through the **public REST API**:
  the 129-activity fixture, 16 per-capability plans, a 63-case pairwise covering array differentialled
  against the engine on the same inputs, a parameterised scale generator, and the 18 hostile cases.
  `docs/TEST_PLAYBOOK.md` says which plan proves what and what _wrong_ looks like;
  `pnpm check:playbook` gates that its rows resolve in both directions.
  **What it found** is the argument for it: three write-path gaps no existing gate could report
  (TECH_DEBT #78/#79/#80 — the largest being that ADR-0036's intraday shift patterns are authorable
  by nothing), the first honest answer to the draw-performance question (TECH_DEBT #75 — the _scene_
  dominates the number), and a live export defect that downgraded every Level of Effort activity to a
  task on the way out. The CPM engine is not modified and the ADR-0034 parity gate is untouched.

## Delivered — TSLD canvas & editing surface

- **The TSLD graphical canvas** — the flagship primary editing surface (ADR-0026).
  **M1–M4 delivered** (read render; on-canvas create/move/link/relane; live critical
  path + driving-vs-non-driving arrows with a non-colour encoding; lane persistence +
  auto-pack), **on-canvas editing ON by default** (`VITE_TSLD_EDITING`). Time-scaled
  document chrome: an **adaptive date ruler** (year→month→day), **zoom presets** + zoom
  −/+, a **TODAY** marker, **non-working-day shading**, **layer toggles**, and
  **on-canvas activity labels** (`{code} {name} · {n}d`, adaptive placement, culled +
  LOD-gated; perf re-verified at p95 9.4ms draw @ 2,000 activities, inside the ≤16ms
  budget — ADR-0026 D1).
- **Canvas-first workspace, toolbar & authoring (ADR-0030/0031/0032).** The canvas is the
  primary workspace surface (resizable rail + activity panel, responsive single-pane
  toggle); a declarative **toolbar-item registry** feeding one APG `<Toolbar>` with a
  7-group taxonomy and pen-gated authoring; and canvas-first **authoring** (live empty
  canvas, on-canvas activity types, a two-click Link tool, coalesced auto-recalc). All
  on by default.
- **Plan edit-lock** (single-editor hand-off, ADR-0028) — **delivered & enabled**: the
  server lease + 423 write-gate and the web "pen" (`VITE_PLAN_EDIT_LOCK`, on by default).
  Server enforcement (`PLAN_EDIT_LOCK_ENFORCED`) stays the one deliberate ops switch,
  enabled after the pen bundle is live (ADR-0028 §9).
- **Editing enablement hardening** — a flag-on E2E harness (`test:e2e:edit`, in CI), a
  flags-off baseline suite, route-level gating coverage, and an operator runbook
  ([`docs/runbooks/tsld-editing-enablement.md`](runbooks/tsld-editing-enablement.md)).
- **Project Explorer** — see above. **Remaining canvas polish:** the deferred per-activity
  driving summary in the parallel listbox, plus the debt items in `TECH_DEBT.md`.
- **Toolbar quick-wins (web).** Five previously-"Coming soon" TSLD toolbar buttons are now wired to
  already-shipped features and **on by default** (`VITE_TOOLBAR_QUICK_WINS`): **Go to today** (viewport
  jump), **Comments** (reveal the plan notes thread), **Update progress…**, **Add note** (open the
  selected activity's notes), and **Clear visual placement** (drop a hand-placed `visualStart`). The
  canvas selection is lifted into the workspace so the selection-aware items gate on a real target;
  each reuses an existing REST mutation — no API/schema/engine change (spec `docs/specs/toolbar-quick-wins/`).
- **Canvas insight lenses (web).** Three more Look-row placeholders wired to already-shipped data as pure
  client render lenses and **on by default** (`VITE_CANVAS_LENSES`): **Filter/Search** (dim non-matching
  bars), **Colour by** (Criticality / Total-float bucket / WBS group, mode-aware Legend, contrast-safe
  labels), and **Baseline overlay** (ghost bars at the active baseline's captured dates). Theme-reactive,
  culled within the ADR-0026 draw budget; no API/schema/engine change (spec `docs/specs/canvas-lenses/`).
  Driving-resource colouring is a deferred fast-follow (needs `VITE_RESOURCES`). Stage A of the
  toolbar-placeholder burn-down.
- **Canvas navigation & authoring aids (web).** Three more toolbar placeholders wired to already-shipped
  engine output as pure client-side commands and **on by default** (`VITE_CANVAS_NAV`): **Isolate logic
  path** (a split button dimming everything off the selected activity's transitive predecessor+successor
  chain — full, or driving-only — reusing the Stage A dim seam), **Next conflict** (cycles the plan's
  flagged activities — constraint/visual/external/levelling/negative-float — centring, selecting and
  announcing each with a visible "Conflict i of n · reason" chip), and **Snap to grid** (a Visual-mode,
  pen-gated toggle rounding a dropped `visualStart` to the nearest working day). No API/schema/engine
  change (spec `docs/specs/canvas-nav/`). Stage B of the toolbar-placeholder burn-down.
- **Export & print (web).** The `export`/`print` toolbar placeholders wired to four client-side
  deliverables and **on by default** (`VITE_EXPORT_PRINT`): **Schedule CSV** (Excel-safe,
  formula-injection-guarded, UTF-8 BOM; all-rows with a conditional "Matching activities only (N)" item
  under an active lens), **Diagram PNG** and **Diagram PDF** (whole-plan / current-view extents, an
  off-screen `paintScene` in a light print palette; the PDF via lazy `import('jspdf')`, absent from the
  initial bundle), and **Browser Print** (the whole diagram via a print-only container + `@media print`
  stylesheet). No API/schema/engine change (spec `docs/specs/export-print/`). `share` (External Guest
  link) and XER/MSP interchange are deferred to Stage C2. Stage C1 of the toolbar-placeholder burn-down.
- **On-canvas activity types (web).** The canvas Add split-button's Level-of-effort/Hammock "Coming
  soon" placeholders collapse into one live **Level of Effort (hammock)** item and **on by default**
  (`VITE_CANVAS_ACTIVITY_TYPES`): it arms a two-click endpoint-pick tool (a sibling of the Link tool) —
  pick a start driver, then a finish driver — and SchedulePoint composes a `LEVEL_OF_EFFORT` activity
  plus its SS/FF driver edges as one undoable action, then recalcs and redraws. Frontend-only over the
  already-shipped LOE engine (a raw `HAMMOCK` is never created — the LOE **is** the span-derived
  hammock); no API/schema/engine change (spec `docs/specs/canvas-activity-types/`). Stage D of the
  toolbar-placeholder burn-down.
- **Canvas resource view (web).** The `resource-view` toolbar placeholder wired to a
  **canvas-axis-aligned demand strip** and **on by default** (`VITE_CANVAS_RESOURCE_VIEW`): a Canvas 2D
  sibling layer painted by the TsldCanvas rAF loop from the same viewport (bucketed resource-loading bars
  stay under the diagram's day/week/month columns under pan/zoom, ADR-0049), with a DOM strip panel
  (resource picker + bucket-size select + accessible table) reading the shipped histogram read-model. A
  sibling **Flag over-allocated** lens rings over-allocated bars with a shape badge (+ listbox marker +
  count announcement) from the shipped levelling flags. Frontend-only; no API/schema/engine change (spec
  `docs/specs/canvas-resource-view/`). Stage E of the toolbar-placeholder burn-down.
- **Schedule interchange — P6 XER import (full-stack).** Planners import an existing Primavera P6 `.xer`
  into a new plan and **on by default** (`VITE_SCHEDULE_INTERCHANGE`): a pure `@repo/interchange` package
  parses → maps → validates/repairs/reports the foreign schedule (nothing dropped silently, ADR-0035
  contract), and a thin `interchange` API module runs a **dry-run** (honest pre-commit report) then
  **commit** (create the plan + recalculate) behind `interchange:import` + org-scope + a size ceiling. The
  CPM engine is untouched. Import-only, import-first (`.mpp` excluded); M2 adds WBS/constraints/progress/
  resources, M3 adds MS Project MSPDI, M4 (optional) export (spec `docs/specs/schedule-interchange/`,
  ADR-0050). Stage C2 M1 of the toolbar-placeholder burn-down; the External-Guest share link is Stage F.

- **One activity field vocabulary** (ADR-0089). ~20 definition fields were rendered by two
  components sharing no code, and nine features had each added a field to both by hand. The
  divergence set was re-derived from the code rather than trusted — the spec listed nine, the
  characterisation suite found **~26**, six of them defects a planner could hit, including an
  activity that rendered as top level while the save re-sent its real parent.
- **The plan-workspace command surface** (ADR-0090). 46 registered items on a row whose overflow
  calculation could not see its own chrome, so the `⋯` never rendered and the surplus was paid by
  controls falling out of an `overflow-hidden` box — **measured at 1920×1080: Row 1 109 px over, two
  commands painted at 0 px visible**. WCAG 2.5.8, and the existing axe scan structurally could not
  see it (`target-size` is `wcag22aa`; the scan requested `wcag2aa`, and shipped disabled).
- **A mode is not a command** (ADR-0091). The surface had no vocabulary for anything that is not a
  command, so modes, facts and subjects all rendered as buttons in a row. Its most useful output is
  a measurement: the product owner's Surface Pro is **1646 CSS px**, and every prior figure came
  from 1920/1440/1024/768 — both rows were half empty on the one screen the work is judged on.
- **The canvas dock, and the diagram's vertical budget** (ADR-0092). 249 px of chrome above 558 px
  of canvas — 31 % of the plan's vertical space. Every transient strip moved into the Activities row
  the workspace already paid for (**measured: 0 px**), the selection bar stopped floating over the
  diagram, and `Snap to grid` was deleted because it had no effect — the engine rolls every
  placement forward regardless, and the toggle's only contribution was writing a weekend drop back
  to the _previous_ Friday. The identity-line band merge was a hard requirement and is **withdrawn
  on its own measurement**: it buys ~8 % more canvas.

## Delivered — operations & supportability

**A theme this roadmap did not have.** Everything below was built between 2026-08-05 and
2026-08-09, and none of it fitted anywhere on this page — which is itself the finding: the roadmap
tracked what the product does for a planner and had no place for what it takes to _run_ it, so
work that keeps the installation alive was invisible to the one document that decides what gets
built next.

- **Mail failures reach somebody** (staff console M1). ADR-0075 decided a failed send is the
  operator's signal rather than the caller's, and then left the operator a log line nobody reads
  (`docs/TECH_DEBT.md` #100). `MAIL_ALERT_URL` posts the same signal, coalesced, from inside the
  container. Absent, behaviour is byte-identical to before.
- **A dead-man's-switch** (`HEARTBEAT_URL`). The one honest thing an application can do about its
  own liveness, because it cannot report that it is down. Ships built and **dormant** — nothing
  watches it yet, and #100's operator half stays open until something does.
- **A staff identity that cannot reach a customer** (ADR-0086). `StaffPrincipal` copies
  `GuestPrincipal`: no memberships, no `can()`, so staff reaching plan data is a **compile error**
  rather than a check somebody remembers. The cross-organisation 404 invariant is untouched — not
  respected, untouched: no code on that path changed.
- **The staff console** — mail health, CSP violations, installation state, unverified accounts, and
  a record of what staff themselves have done. Every route is audited **including reads**, because
  on this surface the read _is_ the privileged act.
- **CSP violations are collected instead of discarded** (staff console M4). The policy now reports;
  a public, throttled, deduplicated sink stores what arrives, so the decision to enforce can be made
  from evidence rather than from whatever somebody saw in a console during a six-surface walk.

- **The first scheduled work of any kind, and a retention sweep** (ADR-0087). Two tables documented
  a period and nothing enforced either; `csp_reports` is written by an **unauthenticated** endpoint
  at a mintable 1.73 M rows/day per IP. One `setInterval`, `.unref()`'d, no Redis and no queue —
  ADR-0009 narrowed rather than superseded, with the trigger to reopen it named. `audit_events` is
  deliberately **not** swept: it refuses `DELETE` in the database, and ADR-0085 D1 refused to trade
  that guarantee for a period.
- **Feature flags are classified, not scheduled** (ADR-0088, superseding ADR-0084's calendar). The
  load-bearing finding is that a `VITE_` flag **cannot be switched off on a deployed container and
  never could** — Vite inlines the constants at build time and the publish workflow passes none — so
  for the operator there has never been a rollback contract to expire. Two flags select an
  alternative JSX root and retire on epic-touch under a ratcheting cap; ~28 one-line guards formally
  **keep**; the rest wait on their coverage rather than on a date.

**The argument the theme rests on**, and the reason it counts as security work rather than
convenience: before it, every staff operation on this installation happened over `psql` and left
**no record at all**. The append-only audit log is a database guarantee, and a shell is outside it.
This narrows the unaudited surface; it does not close it, and saying otherwise would be false.

### Next in this theme

- **Wire the two receivers.** `MAIL_ALERT_URL` and a dead-man's-switch check are compose edits on
  the host. Until they exist the signals reach nobody, which is the failure `#100` records.
- **Verify CSP delivery end to end** (`docs/TECH_DEBT.md` #117) — closable only by deploying,
  visiting a page and reading the Security panel.
- **A retention sweep — and it belongs first in this list, not last.** Both new tables document a
  period (30 days for CSP reports, 12 months for mail events) and **nothing enforces either**; there
  is no scheduler in this application, so the periods are ceilings and today's true retention is
  forever. The M6 security review moved it up on two facts rather than on tidiness: `csp_reports` is
  written by an **unauthenticated** endpoint that strips only the query string from the two URI
  columns, so a caller who wants unique rows gets them at 20 per request; and `mail_events.recipient`
  retains a real customer address indefinitely, which is exactly what ADR-0085 D3 spent a decision
  keeping erasable. The other two items in this list are compose edits on a host; this one is code.

## Next

### Committed engine milestones (conformance framework)

The remaining clauses of the CPM semantics contract (ADR-0035), each with clear fixture
discriminators. Each becomes a spec/plan before build:

- **M6 — Float & critical (ADR-0035 §17–§20).** **Delivered & enabled** (`VITE_FLOAT_CRITICAL_SETTINGS`
  on by default): a selectable **Longest-Path** critical definition (vs Total-Float ≤ 0), **Total Float
  as start / finish / smallest**, **multiple float paths** (contiguous driving chains), a
  **make-open-ends-critical** option, and the **zero-free-float** refinement that completes the
  as-late-as-possible flag. Engine + plan options + web toggles. The float paths themselves had no
  planner-reachable surface until the engine↔surface audit's finding **F4** shipped the docked
  **Float paths** panel (`VITE_FLOAT_PATHS` on by default, 2026-08-02) — ranked chains into a chosen
  activity with the relative float on each row, and one selected path emphasised in both the canvas
  and the Gantt.
- **M5-epic — Advanced activity types (ADR-0035 §21, §23–§24).** **Level-of-Effort** (§21) and
  **WBS-summary** rollup (§24) are **delivered & enabled** (`VITE_ADVANCED_ACTIVITY_TYPES` on by default —
  engine, API, conformance, and the flagged web type/parent pickers; ADR-0038 for the WBS parent tree).
  **Resource-dependent** scheduling (§23) is **delivered & enabled** too — this entry claimed for months
  that it was "still pending, needs a resource model first", which stopped being true when ADR-0039
  shipped the model: the engine, the driving-resource-calendar resolution and the conformance slice all
  landed in M7.2. What was actually missing was the **web surface** — the type was absent from the
  picker and the engine's `resourceDriverMissing` flag was rendered nowhere — so the feature was
  complete and unreachable. Both are now closed. Canvas
  summary/LOE span-bars + navigator visual nesting are a deferred visualisation follow-on (TECH_DEBT #37).

### Product features (candidate order — governed by the brief's MoSCoW §8)

- **Notes.** **Delivered & enabled (`VITE_NOTES` on by default)** — attributed, time-ordered note
  threads (ADR-0046) on **plans and activities** (client/project reserved for a later slice): a
  polymorphic `notes` table + cascade (M1), the non-pen-gated CRUD + counts API (M2), and the web
  thread/composer/badge in the activity Logic panel and plan workspace (M3). The weekly-progress "why".
- **Undo/redo.** **Delivered & enabled (`VITE_UNDO_REDO` on by default)** — a client-side, per-plan,
  per-pen-session command stack (ADR-0048) that undoes plan **inputs** through the existing mutations
  (engine + parity gate untouched): reposition/relane/update/create/delete/dependency/`visualStart`/
  auto-arrange, with drag coalescing, pen-gated toolbar Undo/Redo + keyboard shortcuts, abort-and-refetch
  conflict handling, and announcements. Chromium Back/Forward suppression is asserted by the flag-on
  Playwright journey; the Firefox/Safari/Edge manual sweep is the operator gate (TECH_DEBT #25).
  Id-stable cascade/WBS delete-undo is a deferred M4.
- **Gantt view** — **shipped** (ADR-0059, `VITE_GANTT_VIEW` default-on 2026-07-28): a
  grid-and-bar projection of the same model behind a TSLD | Gantt switch, with WBS summary rows,
  the baseline variance bar ADR-0025 deferred "until a Gantt exists", and a printed programme.
  Read-only by design — the brief says read-primary, and editing stays in the TSLD. Rendered as
  virtualized DOM rows rather than Canvas 2D, because virtualization removes the premise ADR-0026
  chose canvas for. Dependency arrows and Gantt editing are the deliberate next candidates.
- **WBS improvements** — **shipped** (ADR-0063, `VITE_WBS_IMPROVEMENTS` default-on 2026-07-30):
  making the shipped WBS (ADR-0038) workable rather than merely present. Membership is managed
  from the summary (a Members tab) **and** from the list (table multi-select + bulk assign);
  **Dissolve** removes a grouping without removing the work, which `DELETE`'s subtree cascade could
  not; every activity appears in the WBS views, filed or not, via a derived **Unassigned** bucket;
  and the programme's shape reads at band level on the canvas, in the exported picture and in the
  printed programme. The CPM engine and the recalc parity gate are untouched. Deliberately not
  done: the band is select-only (a summary's dates are an engine rollup, so there is nothing on it
  to drag), and the derived bucket is never persisted.
- **Canvas authoring flow & link routing** — **shipped** (ADR-0064
  `VITE_CANVAS_AUTHORING_FLOW` + ADR-0065 `VITE_CANVAS_LINK_ROUTING`, both default-on 2026-07-31):
  one arm/disarm contract across all four tool modes with a mode statement band above the scene,
  a link confirmation naming the direction, token-based recalculation holds so bars cannot move
  between a planner's two clicks, and keyboard pick parity seeded into the canvas gesture. Then
  orthogonal corridors that step **around** bars, with near-identical runs bundled onto one trunk.
  The routing measurement re-opened the draw budget rather than passing it (TECH_DEBT #75).
- **The seed catalogue** — **shipped** (ADR-0066): 37 documented plans and hostile cases created
  through the **public REST API** in five tiers, keyed to [`TEST_PLAYBOOK.md`](TEST_PLAYBOOK.md)
  and gated by `pnpm check:playbook`. The conformance harness proves the **engine**; this proves
  the **application** — the write paths, DTOs and guards no pure-function gate can reach.
- **Authorable working time** — **shipped** (ADR-0067 `VITE_CALENDAR_SHIFT_EDITOR` default-on
  2026-08-01, with ADR-0068): the calendar shift editor, closing a year-old gap where storage and
  the engine had supported intraday shift patterns since ADR-0036 and **nothing in the product
  could author one**. Plus a per-calendar **hours-per-day** factor, so "5 days" on an eight-hour
  calendar is 2,400 working minutes rather than 7,200 — derived once when shifts are written,
  frozen into baselines, and round-tripped through interchange as P6's `day_hr_cnt`.
- **Sub-day durations, lags and assignment lag** — **shipped** (ADR-0070 `VITE_SUB_DAY_DURATIONS`
  default-on 2026-08-02, ADR-0071 `VITE_ASSIGNMENT_LAG` default-on 2026-08-02): a `d`/`h`/`m`
  text grammar for durations and lags where a bare number still means days, with `hoursPerDay` a
  **required** parameter of the parser so the compiler forbids the silent-wrong-answer default;
  and a per-assignment lag the histogram had accepted since ADR-0044 with nothing able to store
  one. ADR-0069 moved the lane packer to `@repo/layout` so an imported programme opens packed
  rather than one bar per lane.
- **The audit log** — **shipped** (ADR-0072 + ADR-0073, `VITE_AUDIT_FILTERS` /
  `VITE_AUDIT_SELF_SECURITY` default-on 2026-08-04), closing the register's oldest row
  (TECH_DEBT #14). A single `audit_events` table made append-only **in the database** by
  `ENABLE ALWAYS` triggers, an allow-list-per-action redactor, and a route census that fails if a
  route changing who-can-do-what stops being audited. Coverage is derived from two tests —
  **durability** and **blast radius** — not from a list of opinions; content edits are
  **permanently** excluded. A failed sign-in is readable by the account it named and nobody else.
  The CPM engine is not imported, and auditing a recalculation is forbidden by decision.
- **Account recovery, verification enforcement and the web origin's CSP** — **shipped**
  (ADR-0074, `VITE_ACCOUNT_SETTINGS` + `VITE_PASSWORD_RESET` default-on 2026-08-05, with ADR-0075).
  The product had **no password reset at all** — not a missing screen but a server refusal — so the
  only route back into a locked account ran through an operator with database access. Two findings
  outranked every screen in the epic and both were one configuration key: reset tokens would have
  been stored **cleartext**, and a completed reset would have left every session alive. The
  precedent it set is the one later epics keep citing: **a client surface whose gate is a
  server-side condition is branched on runtime evidence, never on a `VITE_` constant.** Its CSP is
  derived from what the code loads, and the report-only window caught a violation from a
  _dependency_ — which no amount of reading `apps/web/src` could have found, so `e2e-csp` now
  serves the real policy over the production build. ADR-0075 answers the mail half as a decision
  **not** to build: sending from application code before Better Auth would create an enumeration
  oracle, and the wrapper would bypass the rate limiter.
- **The public screens' brand surface** — **shipped** (ADR-0077, unflagged, 2026-08-06). The six
  pre-authentication routes are the only part of SchedulePoint a stranger meets, and were the one
  significant surface that had never had a design pass: a 384px card on a page where
  `--background` and `--card` are the same white. Adds a fourth and then a fifth ADR-0055 surface
  scope (`brand`, `auth`), both **theme-invariant by decision** — the login is one identity rather
  than a fixed navy panel joined to a themed card. The computed contrast matrix caught what
  copying a design cannot: two real WCAG 1.4.11 failures in the **old app's own values**. Its M8
  rule is worth carrying forward — _a field's problem belongs to the field; the alert belongs to
  the form._
- **Canvas module boundaries, search that navigates, and the plural selection** — **shipped**
  (ADR-0078 refactor-only; ADR-0079 `VITE_CANVAS_SEARCH_NAV` and ADR-0080
  `VITE_CANVAS_MULTI_SELECT` default-on 2026-08-07/08). Search **filtered and did not find**; Enter
  now walks the matches on the same comparator Next-conflict uses. Every plan-shaping gesture acted
  on exactly one bar, so re-sequencing a twelve-activity phase was twelve gestures; a selection is
  now a set with a primary, and a bulk delete's undo is **one id-stable restore-batch**, because
  re-creating would restore the bars and silently lose the links between them.
- **Shaded rather than hidden, at every tier** — **shipped** (ADR-0082 menus, ADR-0083 form
  fields, unflagged, 2026-08-09). A gated field is **read-only, not disabled**: a field's loss on
  being disabled is not operability but _readability_, so "you may not edit this" was being
  implemented as "you may not read it either". There is no gated fill and that is measured — on
  every light theme the control's outline has 0.36 of headroom over 1.4.11 and the `auth` family
  has none, so the state is carried by a lock glyph and a linked sentence instead.
- **Feature-flag retirement and the privacy position** — **shipped as decisions** (ADR-0084 with
  `pnpm check:flags`, 2026-08-09; ADR-0085 decision-only). 58 flags, every one default-on, each a
  rollback contract nobody had ever ended; they now carry dated tags and a retirement schedule.
  ADR-0085 records why "Privacy operations" is not the ticket the backlog described: erasure meets
  the audit log's `ENABLE ALWAYS` triggers head-on, so it is **anonymisation of the actor**, and
  the build trigger is named rather than left implicit.
- **Export** (PDF/CSV) and **resources** (library + assignments) —
  Must/Should-have per the brief. (Resources have since shipped — M7. Export shipped as the TSLD
  CSV/PNG/PDF menu, the printed programme, and XER/MSPDI via `GET …/export/:format`.)

## Guiding constraints

- Keep `main` releasable; ship thin vertical slices.
- Maintain the quality bar (tests, a11y, security, docs) on every change.
- Follow the delivery process ([`PROCESS.md`](PROCESS.md)) for new features; record
  architecturally significant decisions as ADRs.
