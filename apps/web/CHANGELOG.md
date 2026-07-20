# @repo/web

## 0.35.0

### Minor Changes

- [#112](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/112) [`96ab413`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/96ab413580809c83e343345478b2afa79718f814) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas navigation & authoring aids on by default (VITE_CANVAS_NAV)

  Turn three shaded TSLD-toolbar placeholders into real client-side commands over
  already-shipped engine output — no API/schema/`@repo/types`/CPM-engine change (the
  recalc parity gate is untouched):

  - **Isolate logic path** — a split button that dims every activity NOT on the
    selected activity's transitive predecessor+successor chain (full, or a
    driving-only sub-chain), reusing the canvas-lenses dim seam and marking the a11y
    listbox; the chevron picks Full / Driving / Stop, the main button toggles.
  - **Next conflict** — cycles the plan's flagged activities (constraint violation,
    visual conflict, external-driven, levelling-window exceeded, negative total
    float), centring, selecting and announcing each, with a visible "Conflict i of n
    · reason" chip.
  - **Snap to grid** — a Visual-mode, pen-gated session toggle that rounds a dropped
    `visualStart` to the nearest working day before the existing PATCH.

  Set `VITE_CANVAS_NAV=false` to restore the toolbar, canvas paint and a11y tree
  byte-for-byte (rollback / opt-out).

## 0.34.0

### Minor Changes

- [#104](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/104) [`c27a6e9`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c27a6e9fcdf8c08c597a308a60285e3627b8d149) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD canvas insight lenses (Stage A of the toolbar-placeholder burn-down) — three previously-"Coming
  soon" Look-row controls are now wired to already-shipped data as pure client render lenses, **on by
  default** (`VITE_CANVAS_LENSES`, set it to `false` to restore the placeholders). Frontend-only: no API,
  schema, `@repo/types`, or CPM-engine change; the recalc parity gate is untouched.

  - **Filter / Search** — a live search field + a Filter menu (Critical / Has constraint / Has conflict)
    that **dim** non-matching bars (shade-don't-remove; geometry, lanes and logic lines stay put), mirror
    the parallel a11y listbox, and announce the match count.
  - **Colour by…** — recolour bars by Criticality (default, byte-for-byte today's fills) / Total-float
    bucket / WBS group, with a mode-aware Legend, contrast-safe inside-bar labels, and the critical outline
    retained in every mode (never colour-only). Driving-resource colouring is a deferred fast-follow.
  - **Baseline overlay** — ghost outline bars behind the live bars at the active baseline's captured dates
    (reusing the shipped variance read; culled with the bar layer), with a Legend key; disabled-with-reason
    when there's no active baseline.

  All three are theme-reactive (a shared `useThemeVersion` hook re-resolves the palette on a light/dark
  switch). WCAG 2.2 AA; covered by unit tests. `VITE_CANVAS_LENSES=false` restores the toolbar and the
  canvas paint byte-for-byte (rollback).

## 0.33.0

### Minor Changes

- [#102](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/102) [`1dcd074`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1dcd0749516198ebe432d09488f15bf988971d15) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD toolbar quick-wins — five previously-"Coming soon" toolbar buttons are now wired to already-shipped
  features, **on by default** (`VITE_TOOLBAR_QUICK_WINS`, set it to `false` to restore the placeholders).
  Frontend-only: no API, schema, `@repo/types`, or CPM-engine change; the recalc parity gate is untouched.

  - **Go to today** — pans the canvas to today's date line (the `goToDate` left-inset view jump); view-only,
    available to every role.
  - **Comments** — reveals and focuses the plan-level notes thread (behind `VITE_NOTES`).
  - **Update progress…** — opens the activity progress editor for the selected activity (Contributor+).
  - **Add note** — opens the selected activity's Logic panel at its Notes section (behind `VITE_NOTES`).
  - **Clear visual placement** — drops the selected bar's hand-placed `visualStart` back to the computed
    date (Visual mode, pen-gated); announces success and surfaces a stale-version conflict non-destructively.

  The canvas selection is lifted into the workspace so the toolbar's selection-aware items enable only when
  an activity is selected (each with its own role / pen / mode gate and an exposed disabled reason). Every
  action reuses an existing REST mutation, so the server stays the sole trust boundary. WCAG 2.2 AA; covered
  by unit tests. `VITE_TOOLBAR_QUICK_WINS=false` ships the five ids as their prior "Coming soon" placeholders,
  byte-for-byte.

## 0.32.0

### Minor Changes

- [#100](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/100) [`25e6090`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/25e6090a1fd50daf87b43161e184db151d25e6db) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Undo / redo for plan authoring (ADR-0048) — a client-side, per-plan, per-pen-session command stack,
  **on by default** (`VITE_UNDO_REDO`, set it to `false` to ship it inert). Undo replays plan **inputs**
  through the existing mutation hooks and the normal auto-recalc redraws, so
  the CPM engine and the recalc parity gate are structurally untouched; every inverse rides the unchanged
  pen (423) + RBAC + org-scope + optimistic (409) gates.

  - **Coverage**: reposition, relane, activity update, create, leaf delete (re-create), dependency
    add/remove, `visualStart`, and auto-arrange (one reversible step). A pointer drag / nudge burst
    coalesces to a single undo step; a WBS-summary cascade delete truncates history rather than offering a
    broken partial undo (id-stable cascade restore is a deferred follow-on).
  - **Surface**: pen-gated Undo/Redo in the TSLD toolbar (disabled with a reason when there's nothing to
    undo/redo, entity-named labels), keyboard `Cmd/Ctrl+Z` · `Cmd/Ctrl+Shift+Z` · `Ctrl+Y` (scoped to the
    workspace, inert in fields and while a modal is open, suppressing browser Back/Forward), the shortcuts
    sheet, and live-region announcements.
  - **Conflict-safe**: a 409/404 aborts non-destructively, refetches server truth and clears redo; a 423
    clears the stack and hands off to the shared edit-lock banner. Linear history, depth 50, cleared on
    plan switch / pen release / reload.

  WCAG 2.2 AA; covered by unit tests and a flag-on Playwright journey (`playwright.undo.config.ts`, wired
  into CI). Set `VITE_UNDO_REDO=true` to enable the surface in an environment.

## 0.31.0

### Minor Changes

- [#98](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/98) [`c0e7cc2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c0e7cc2864535bb85b621da481bcb76d092845fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Notes M3 — the web surface (the Notes feature, ADR-0046) — **on by default** (`VITE_NOTES`, set it to
  `false` to hide the web surface in an environment). It puts the live note-thread API (M2) in front of a
  planner: attributed, time-ordered note threads on plans and activities — the weekly-progress "why", not
  just the "what".

  - **Thread + composer**: a newest-first `NoteThread` (cursor "Load more", loading/empty/error states)
    with a RHF + Zod `NoteComposer` (trimmed body, 1–5000, live character cue). Each `NoteItem` shows the
    author, timestamp and an "edited" marker; **Edit and Delete are offered only to the note's own author**
    — a non-author sees no affordance. Inline edit sends the optimistic `version` and handles the **409**
    ("updated elsewhere — review and edit again") and **403** ("you can no longer edit this note") paths by
    refetching the thread and announcing via `role="status"`.
  - **Surfacing**: an activity **Notes** section in the Logic panel (beside Predecessors/Successors/
    Cross-plan links) plus a route-composed **note-count badge** on the activities-table row (fed by one
    batch counts query, not per-row); a plan **Notes** section on the plan detail route and both canvas
    workspaces (context-aware heading level, no outline skip).
  - **Write-gating**: the composer/edit/delete render only for `note`-writers (Contributor → Org Admin);
    a Viewer sees a read-only thread. Notes are **not** plan-edit-lock gated.

  Reuses design-system primitives (`TextareaField`, `Button`, `Badge`, `ConfirmDialog`, the announcer);
  no one-off styling. WCAG 2.2 AA (labelled controls, keyboard, focus management on inline-edit/delete,
  `role="status"` async notices, distinguishing per-note action labels). Covered by component tests and a
  flag-on Playwright journey (`playwright.notes.config.ts`, wired into CI). Setting `VITE_NOTES=false`
  restores the prior behaviour (no sections mount, the counts query never fires, the badge is suppressed).

### Patch Changes

- Updated dependencies [[`c0e7cc2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c0e7cc2864535bb85b621da481bcb76d092845fe)]:
  - @repo/types@0.16.0

## 0.30.0

### Minor Changes

- [#96](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/96) [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Live cross-plan / programme scheduling web surface (inter-project M2, ADR-0045 §4/§5/§6, F8) — behind
  a **new default-OFF flag `VITE_PROGRAMME_SCHEDULING`**, so it changes nothing until an operator opts in.
  It puts the already-live cross-plan link CRUD, programme-recalc orchestration and staleness read (F3–F6)
  in front of a planner:

  - **Cross-plan links** — a new section in the activity Logic panel (the **successor** activity's home,
    CQ-2) to draw a **live** inter-project link from an upstream activity in **another plan** of the org.
    An org-scoped endpoint picker (client → project → plan → activity — the successor's own plan is
    excluded, so N31 can't be chosen) plus FS/SS/FF/SF type + signed lag + lag-calendar inputs (mirroring
    the intra-plan dependency editor), a both-direction link list ("Driven by" / "Drives") with delete,
    and the shared `CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES` copy for the same-plan / cycle / duplicate
    rejections. RHF + Zod.
  - **Recalculate programme** — an action (Planner/Org Admin) beside the existing Recalculate that runs
    the synchronous `…/schedule/recalculate-programme` solve, with a result panel (per-plan summaries
    upstream-first + the summed missing-upstream **N32** warning), the **423 `PROGRAMME_PLANS_LOCKED`**
    blocked-plans path (a link per blocked plan to request/override its pen), and the **422
    `PROGRAMME_TOO_LARGE`** path.
  - **Stale banner** — a `role="status"` notice shown when the plan summary carries `scheduleStale` (an
    upstream plan was recalculated more recently), prompting a programme recalculate.

  The whole surface is unobtrusive: it renders only for a plan that actually has cross-plan links (the
  summary's `scheduleStale` field is present only then), so an ordinary plan is unaffected even with the
  flag on. Reuses design-system primitives (Dialog, Select, Badge, DataTable, Button, form fields); no
  one-off styling. WCAG 2.2 AA (labelled controls, keyboard, focus management, `role="status"` async
  notices). Covered by component tests (links section, add-link cascade + validation + conflict copy,
  programme control success/423/422/staleness) and a flag-on Playwright journey
  (`playwright.programme.config.ts`, wired into CI). Flag default OFF ⇒ existing behaviour byte-identical.

### Patch Changes

- Updated dependencies [[`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22), [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22), [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22)]:
  - @repo/types@0.15.0

## 0.29.0

### Minor Changes

- [#94](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/94) [`4e78ff1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4e78ff11f9468ed8511f2e780dc2072abacc7050) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn on the remaining eight off-by-default web surfaces (Resources, Duration types, Resource
  levelling, Earned Value, Cost accrual, Activity steps, Resource curves, Inter-project external dates)
  by flipping their `VITE_*` flags from default-off to default-on — after clearing every documented
  pre-flip blocker. The engine/API behind each surface was already live; this exposes it in the UI by
  default.

  Pre-flip remediation (TECH_DEBT [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/38)/[#39](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/39)/[#40](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/40)/[#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)/[#44](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/44)):

  - **API (`@repo/api`)** — **Pen-gate resource-assignment writes** ([#39](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/39)): assign / edit / unassign now
    call `PlanEditLockService.assertHoldsPen` like the activity write path (a units/rate edit persists the
    owning activity's derived duration, a scheduling mutation), returning **423** to a non-holder when
    `PLAN_EDIT_LOCK_ENFORCED` is on; 423 e2e added. **Money overflow guards** (#40a): every integer
    minor-unit money field (`budgetedExpense`/`actualExpense`/`budgetedCost`/`actualCost`) gains
    `@Max(MONEY_MINOR_UNITS_MAX)` and every `Decimal(18,4)` field
    (`costPerUnit`/`maxUnitsPerHour`/`budgetedUnits`/`unitsPerHour`/`actualUnits`) `@Max(DECIMAL_18_4_MAX)`,
    so an over-range value is a clean **422** rather than a precision-loss / column-overflow 500; boundary
    specs added. **Engine-owned `external_driven`** ([#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)): a new per-activity boolean column mirroring
    `constraint_violated` (metadata-only migration), written by the recalc batched `unnest` UPDATE and
    aggregated in the read-summary so `externalDrivenCount` is truthful on a plain summary read.
  - **Types (`@repo/types`)** — `ActivitySummary` gains `externalDriven: boolean`; new
    `MONEY_MINOR_UNITS_MAX` / `DECIMAL_18_4_MAX` bounds.
  - **Web (`@repo/web`)** — **Row-actions `Menu`** ([#38](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/38)): the activities table's per-row actions move from
    a spread of ghost buttons to a single overflow `⋯` trigger opening the APG `Menu`
    (Logic/Progress/Resources/Steps/Edit/Delete, role-gated) — meeting the "dense row actions use a Menu,
    never hover-only" standard. **External badge** ([#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)): an "External" row badge in the Name cell mirrors
    the "Conflict" badge, driven by the engine's per-activity `externalDriven`. **Context gating** ([#44](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/44)):
    the Steps row action is coupled to Earned Value (its only consumer), and the resource loading-curve
    picker is hidden for zero-span milestones. Then all eight `flagDefaultOff` flags become `flagDefaultOn`.

  Parity: `compute.ts` and `level.ts` are untouched; `external_driven` is engine-owned output written on
  every recalc (false when not external-driven), so absent-data byte-parity holds and existing engine / EV
  goldens do not move. Not addressed here (documented follow-ups): #40b Contributor cost-progress wiring,
  [#42](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/42) shared `SelectField`, [#43](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/43) histogram bucket in URL.

### Patch Changes

- Updated dependencies [[`4e78ff1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4e78ff11f9468ed8511f2e780dc2072abacc7050)]:
  - @repo/types@0.14.0

## 0.28.0

### Minor Changes

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Cost accrual (M7 rung 5, ADR-0044 F1 / ADR-0035 §32). Each activity gains a settable `accrualType`
  (`START` / `UNIFORM` (default) / `END`) that governs **when** its cost lump-sum is recognised in the
  Earned-Value read's Planned-Value time-phasing — `START` at the activity start, `END` at its finish,
  `UNIFORM` linearly — reshaping the cost / cash-flow S-curve. It **never changes a CPM date**, feeds the
  scheduler nothing, and is a pure read-model extension of `earned-value.ts`: `UNIFORM` (or absent) is
  byte-identical to the pre-ADR-0044 phasing (the parity gate), so the existing Earned-Value goldens stay
  green. The engine (`compute.ts`) and the levelling pass (`level.ts`) are untouched.

  - **API (`@repo/api`)** — the create/update activity DTOs, the activity response DTO, and the EV read
    path (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`) all carry `accrualType`
    (reuses `activity:update`; the EV read stays `cost:read`-gated). `AccrualType` / `ACCRUAL_TYPES`
    round-trip through `@repo/types`.
  - **Types (`@repo/types`)** — `ActivitySummary` gains `accrualType: AccrualType`.
  - **Conformance** — the EV adapter reads the fixture's `expenses.accrual_type` and collapses per-expense
    → one activity value (ADR-0044 §Q4); new first-principles goldens assert the phased PV to the minor
    unit for **E001** (£45,000 crane mobilisation, `START` — full PV at the start), **E002** (£68,000,
    `UNIFORM` — 50% at mid-window) and **E004** (£3,500 retention, `END` — nothing until the finish), plus
    a `UNIFORM`→`START` flip differential. The `accrual_start` / `accrual_uniform` / `accrual_end`
    capability tags flip ✅ (32 ✅ / 1 ⚪); ADR-0035 gains an **Accepted §32**.
  - **Web (`@repo/web`)** — a **Cost accrual** select (Start / Uniform / End) in the activity form's
    "Cost & earned value" fieldset, behind the new **off-by-default** `VITE_COST_ACCRUAL` flag; wired
    through the create/update mutation and seeded from the row so a stored value round-trips when hidden.

  Deferred (later ADR-0044 slices, not in this change): the period-trend cost **S-curve** chart series
  (read-model + web), weighted **activity steps** (F2), and **resource loading curves** (F3).

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`b60f2c7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/b60f2c74dfbd297d64083d35f9b1d52e30e3f27e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Duration types & the resource-units rate on the web, behind `VITE_DURATION_TYPES` (default off, M7
  rung 4, ADR-0040). The activity form gains a **Duration type** picker (Fixed Duration & Units/Time
  (default) / Fixed Duration & Units / Fixed Units / Fixed Units/Time), shown for types that carry an
  entered duration. The per-activity resource assignment editor gains, on the **driving** assignment, a
  **units/time (rate)** field with its own save and a live "Duration becomes N days" preview for a
  units-driven type — a pure client-side mirror of the server's `resolveTriad` (the server stays
  authoritative; the preview also mirrors the N20 zero-rate block). A units/rate edit on a rated driving
  assignment names its `editedField` so the server recomputes the triad and — for `FIXED_UNITS` /
  `FIXED_UNITS_TIME` — derives the activity's duration, refetched into the table. Everything behind it (the
  `durationType` / `unitsPerHour` fields, the recompute, the conformance proof) was already live; this only
  exposes it in the UI. Set `VITE_DURATION_TYPES=true` to enable it in an environment.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`9e5a4d9`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9e5a4d9dc000b9aa7b1115822f165f1680ee3dfe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Enable the two remaining dark web surfaces by default. **Float & critical plan settings**
  (`VITE_FLOAT_CRITICAL_SETTINGS`, ADR-0035 §17/§18/§20) and **advanced activity types**
  (`VITE_ADVANCED_ACTIVITY_TYPES`, ADR-0035 §21/§24 — Level of Effort + WBS summary/parent pickers) now
  default **on**, having cleared their component/ux/a11y reviews. The engine, API, and conformance behind
  both were already live; this flips the web pickers on so a planner can use them without an env override.
  Set either flag to `false` to roll back to the prior surface, byte-for-byte. (The server-side
  `PLAN_EDIT_LOCK_ENFORCED` stays the one deliberate ops switch, enabled after the pen bundle is live per
  ADR-0028 §9 — unchanged.)

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Cost & Earned Value on the web, behind `VITE_EARNED_VALUE` (default off, EV4b / ADR-0042). The plan
  scheduling settings gain an **EAC method** picker (CPI (default) / Remaining-at-budget / CPI × SPI) and a
  plan **Currency** (ISO-4217) field. The resource form gains a **Cost per unit** rate; the activity form
  gains a **% complete type** picker (Duration (default) / Units / Physical), a **Physical % complete**
  field (shown for the Physical measure), and **Budgeted / Actual expense** money fields — hidden for types
  with no cost meaning (milestone, LOE, WBS summary); the resource-assignment editor gains **Budgeted cost**
  (an optional override), **Actual cost**, and **Actual units**. The headline is a new **Earned Value**
  analysis surface — KPI tiles for the plan total (SPI, CPI, EAC, plus BAC/EV/AC/VAC) and a per-activity +
  WBS table (BAC, PV, EV, AC, SV, CV, SPI, CPI, EAC) — reading `GET …/schedule/earned-value`; a behind-
  schedule / over-budget index is flagged with a word + icon, never colour alone (WCAG 2.2 AA), and a
  **403** (a non-Planner without `cost:read`) renders a friendly "restricted" state rather than a generic
  error. Money is entered in **major units** (e.g. dollars) and stored/rendered as integer **minor units**
  in the plan currency (`lib/format-money`, `narrowSymbol`, a 2-decimal-currency assumption). Every cost
  input seeds from the row even when hidden, so with the flag off the surface is byte-identical to today and
  an edit never clobbers a stored value. Everything behind it (the settable cost DTOs and the earned-value
  read endpoint) was already live; this only exposes it in the UI. Set `VITE_EARNED_VALUE=true` to enable
  it in an environment.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Flagged web surface for external / inter-project dates (ADR-0043 / ADR-0035 §30, M1), behind
  `VITE_INTER_PROJECT_DATES` (default off). The activity form gains an **External dates** section with
  optional **External early start** / **External late finish** calendar-day fields (imported commitments
  gating the activity from another project), including a client-side check that the late finish is not
  before the early start (the N26 rule, also enforced server-side as a 422). Plan settings gain an **Ignore
  external relationships** toggle that drops all external bounds so the plan can be viewed on its own logic.
  The schedule summary strip shows an **Externally driven** count when a recalculation reports one. Everything
  is default-off and additive; a stored external date still round-trips through the form when the flag is off.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Resource levelling on the web, behind `VITE_RESOURCE_LEVELLING` (default off, ADR-0041). The plan
  scheduling settings gain a **Level resources** toggle (the opt-in switch for the second levelling pass)
  and, when it is on, a **Level within float only** toggle (delay only within total float, never extending
  the schedule). The resource form gains a **Max units/hour** capacity field (the availability ceiling the
  levelling pass respects; blank = uncapped), and the activity form gains a **Levelling priority** field
  (lower wins the resource when two activities contend), hidden for types levelling never moves (milestone,
  LOE, WBS summary). Once a plan has levelled, the schedule summary shows a **levelled overlay** — the
  levelled project finish and the levelled / window-exceeded / over-capacity counts — alongside the
  unchanged pure-network critical path and floats. Everything behind it (the plan `levelResources` /
  `levelWithinFloatOnly` options, resource `maxUnitsPerHour`, activity `levelingPriority`, the opt-in second
  engine pass and its levelled overlay + summary counts) was already live; this only exposes it in the UI.
  Set `VITE_RESOURCE_LEVELLING=true` to enable it in an environment.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`d366218`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d366218f2e793d06859b1cbb0cdabb64d63f308e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Activity form can create **Level-of-Effort** activities (M5-epic F4, ADR-0035 §21), behind
  `VITE_ADVANCED_ACTIVITY_TYPES` (default off). When on, the Type picker offers "Level of effort"; picking
  it hides the Duration and Expected-finish inputs (an LOE's duration is derived from its SS-predecessor →
  FF-successor span) and explains that the span comes from its links. The picker otherwise offers only the
  three fully-supported types (Task, Start/Finish milestone) — Hammock and the not-yet-built WBS-summary
  are no longer offered — while a legacy/seeded value stays visible and selected when editing (the
  honest-selector pattern). The engine, API and conformance proof for LOE are already live (F1–F3).

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Resource loading curves (M7 rung 5, ADR-0044 F3 / ADR-0035 §31) — **the final capability-matrix slice**.
  Each resource assignment gains a settable `curveType` (`UNIFORM` (default) / `BELL` / `FRONT_LOADED` /
  `BACK_LOADED` / `DOUBLE_PEAK`) — a named P6 loading curve — plus a new pure read-model
  (`resource-histogram.ts`) that distributes each assignment's `budgetedUnits` across its effective span
  (`start + assignment-lag → finish`, on the activity's own calendar, ADR-0037) per the named 21-point
  profile and aggregates a **units-over-time histogram per resource**, **conserving units** exactly
  (`Σ buckets === Σ budgetedUnits`). It moves **no CPM date**, owns **no engine column**, and does **NOT**
  feed the levelling pass this rung (Q2). `UNIFORM`/absent is a **flat** load — byte-identical to a
  flat-rate distribution — so the parity gate is trivial. `compute.ts` and `level.ts` are untouched.

  - **API (`@repo/api`)** — the create/update assignment DTOs, the assignment response DTO, and the
    assignment repository/service all carry `curveType` (reuses the existing `resource:assign` permission;
    a plain enum, not cost-gated). New `GET …/schedule/resource-histogram` endpoint (`schedule:read` — the
    units histogram is **schedule data, not cost**, Q5) with a `granularity` param (`DAY`/`WEEK`/`MONTH`)
    and offset paging over the per-resource series; the `meta` carries the shared bucket axis, series total,
    and `curveNormalisedCount` (N29). The new pure `computeResourceHistogram` read-model is a dependency-free
    sibling of `float-paths.ts` / `earned-value.ts`.
  - **Types (`@repo/types`)** — `ResourceCurveType` / `RESOURCE_CURVE_TYPES`, the histogram response types
    (`ResourceHistogram*`, `HistogramGranularity`), and `curveType` on `ResourceAssignmentSummary`.
  - **Conformance** — a new `resource-histogram-adapter.ts` reads the fixture's `resource_curves` +
    `assignments.curve`; the built-in profile constants are asserted **byte-equal to the fixture's
    profiles** (self-baselined, no external oracle, ADR-0034). Goldens prove **AS0026** (FRONT_LOADED,
    2400 u), **AS0042** (BACK_LOADED, 640 u), **AS0015** (BELL, 1200 u) and **AS0043** (DOUBLE_PEAK, 560 u)
    distribute to the exact profile shape and sum to `budgetedUnits`, plus a UNIFORM-vs-FRONT_LOADED
    differential (`resultsDiffer`), the assignment-lag case (**AS0027**), and **N29** (a profile not summing
    to 100 ⇒ normalise to the budget, units conserved, counted). The `res_curve_bell` /
    `res_curve_front_loaded` / `res_curve_back_loaded` / `res_curve_double_peak` capability tags flip ✅ —
    **closing the matrix (34 ✅ / 0 ⚪)**; ADR-0035 gains an **Accepted §31** + N29.
  - **Web (`@repo/web`)** — a **loading-curve picker** (Uniform / Bell / Front-loaded / Back-loaded /
    Double-peak) on the resource-assignment dialog and a **Resource histogram** read view (a bar chart with
    a keyboard-navigable data-table equivalent for WCAG 2.2 AA), behind the new **off-by-default**
    `VITE_RESOURCE_CURVES` flag; the picker round-trips through the assignment create/update mutation.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`f3bec8d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f3bec8d81e0227b40010c91077a02eec42a9a225) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Flagged web surface for **WBS summaries** (M5-epic F8, ADR-0038 / ADR-0035 §24). Behind
  `VITE_ADVANCED_ACTIVITY_TYPES` (off by default), the activity form's Type picker now offers **WBS
  summary** alongside Level of Effort: choosing it hides the Duration/Expected-finish inputs (a summary's
  dates roll up from its branch) and explains the roll-up. A new flag-gated **WBS parent** picker nests any
  activity under one of the plan's existing summaries — round-tripping `parentId` through create and update,
  excluding the activity itself, and keeping a seeded parent visible under an honest label if it isn't in
  the list (the honest-selector pattern). The picker distinguishes loading, an honest load error, and a
  resolved-empty plan (which guides the planner to create a summary first) as separate states, and the
  WBS-summary explainer describes the real nesting flow (open each activity in the branch and set its WBS
  summary to this one). The engine/API/conformance for WBS rollup are already live (F5–F7); this only lets a
  planner pick the type and set the parent. Canvas summary-bar rendering and navigator-tree visual nesting
  remain deferred (TECH_DEBT [#37](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/37)).

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`cc7b02f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cc7b02fcaa36ff130ace19501c245029b377637c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the **resource management** web surface (M7-F6, ADR-0039), behind a new **default-off** flag
  `VITE_RESOURCES` so it ships dark. An org-level **Resources library** screen
  (`/orgs/:orgSlug/resources`) lists, creates, edits and deletes resources — each with a name, optional
  code/description, a kind (Labour / Equipment / Material) and an optional own calendar — and a per-activity
  **Resources** dialog (from the activities row) assigns a resource with budgeted units and an optional
  **driving-resource** flag, plus edit/unassign. A Material resource can never be the driving resource: the
  driving toggle is disabled with an explanatory hint (the API's `MATERIAL_CANNOT_DRIVE` is the backstop),
  and setting a driver moves the flag off the previous one (announced). Reads are open to any member; create/
  edit/delete/assign are Planner + Org Admin. With `VITE_RESOURCES` off the app is byte-identical to before —
  no nav link, no route, no row action. The activities row-actions crowding this adds a fifth item to is
  recorded as tech debt (migrate the cell to the `Menu` primitive before the flag is flipped on).

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Weighted activity steps (M7 rung 5, ADR-0044 F2 / ADR-0035 §33). An activity gains a **weighted progress
  step checklist** (`activity_steps` child table — `seq` / `name` / `weight` / `percentComplete`) whose
  weight-weighted mean `Σ(w·p)/Σw` becomes the activity's **PHYSICAL** %-complete and **wins** over the
  manual `physicalPercentComplete` when steps are present. Steps feed the ADR-0042 `PHYSICAL` Earned-Value
  measure only — they **never change a CPM date**; with no steps the manual field stands exactly (the
  byte-identical parity path, so the existing EV goldens stay green). The engine (`compute.ts`) and the
  levelling pass (`level.ts`) are untouched; the pure resolver already in `earned-value.ts`
  (`rollupPhysicalPercent`) is unchanged — this change only adds layers around it.

  - **API (`@repo/api`)** — a steps sub-resource following the reference-template layering
    (controller → service → repository, deny-by-default, org-scoped): `GET …/activities/:activityId/steps`
    (list active, seq-ordered) and `PUT …/activities/:activityId/steps` (`{ version, steps: [...] }`
    bulk-replace, Q3) — retained rows updated in place, new ones appended, removed ones soft-deleted, the
    server assigns `seq`, and the parent **activity's** `version` is optimistic-locked (stale ⇒ 409). Reuses
    `activity:update` (a step is activity-write) — no new permission. **N28** (a step `percentComplete`
    outside 0–100 ⇒ 422 `STEP_PERCENT_OUT_OF_RANGE`) and a negative `weight` are DTO-boundary rejects,
    backstopped by DB CHECKs. The EV read (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`)
    loads each activity's active steps into the `PHYSICAL` rollup and reports a plan-level
    **`stepWeightZeroCount`** (N27 — all-zero-weight ⇒ manual fallback, never a divide-by-zero), mirroring
    `costWarningCount`. The soft-delete cascade is wired into `HierarchyLifecycleService` (steps sweep and
    restore with their activity under the same `delete_batch_id`, both directions).
  - **Types (`@repo/types`)** — new `ActivityStep`, `ActivityStepInput`, `ReplaceActivityStepsRequest`;
    `PlanEarnedValue` gains `stepWeightZeroCount`.
  - **Conformance** — the EV adapter reads the fixture's `steps` and attaches them to A4200 / A7100; new
    goldens assert the weighted-mean rollup **A4200 → 35.0005%** (the fixture's own
    `prog_rd_vs_pct_divergence` — steps-physical ≠ its 40% duration-%) and **A7100 → 0%**, a
    steps-present-vs-manual differential (`resultsDiffer`), and the N27 fallback + count. **N28** is
    DTO-tested. The `code_steps` capability tag flips ✅ (33 ✅ / 1 ⚪ — only resource curves remain);
    ADR-0035 gains an **Accepted §33** + N27/N28.
  - **Web (`@repo/web`)** — an `ActivityStepsEditor` (editable name / weight / %-complete rows with
    add/remove/reorder) opened from the activities table row menu behind the new **off-by-default**
    `VITE_ACTIVITY_STEPS` flag, showing the rolled-up physical % and a "steps override the manual %" note,
    wired to the bulk-PUT mutation (TanStack Query).

  Deferred (the last ADR-0044 slice, not in this change): **resource loading curves** (F3), the one
  remaining ⚪ capability row.

### Patch Changes

- Updated dependencies [[`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`272eb42`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/272eb420313809d0867ef81753ae4c705f631005), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`21818b7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/21818b7af12c16f481d7547d6f9c1d0464a05a2c), [`a763a54`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a763a5488370935dfaa44b6dc68198f2706270a4), [`7b29ccb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7b29ccb64208a29aed92836dc46bc35cb691a05b), [`7952f5e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7952f5e1c60119ff7ffb31f34908e401dfc2731e), [`816d0a0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/816d0a09f262a1076f1a0aa1cd38b9590d2eec9b), [`62d7a97`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/62d7a974d752249fefa31ee7fea7e45e92a3e179), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`afd4690`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/afd4690ed6832ff43b4e551e530346bbaaaaec68), [`7074b77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7074b7703ff1b9bf784676a87c5a692a49741bc6), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1)]:
  - @repo/types@0.13.0

## 0.27.0

### Minor Changes

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Plan float & critical scheduling settings (M6-F7), behind `VITE_FLOAT_CRITICAL_SETTINGS` (default off).
  A new `PlanScheduleSettings` block on the plan detail screen adds three controls — **Critical-path
  definition** (Total float / Longest path), **Total-float measure** (Finish / Start / Smallest), and a
  **Make open ends critical** toggle — mirroring the existing recalc-mode / expected-finish pickers
  (optimistic select, live-region announce, read-only summary for non-editors). Each persists as a
  targeted plan PATCH; a later Recalculate applies it to the computed critical path. The engine/API
  behind these options is already live (M6-F2/F3/F4); this exposes them in the UI.

### Patch Changes

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD canvas: flag a **same-lane time overlap** (TECH_DEBT #24c). Auto-arrange never packs two
  time-overlapping bars into one lane, but a manual lane drop (drag or `Alt+↑/↓`) could — with no cue.
  A pure `laneOverlapIds` pass now marks both overlapping bars at the mapping seam; the painter draws a
  stacked-squares badge above each (a shape cue, never colour-only — WCAG 1.4.1 — named in the legend),
  and the accessible listbox line speaks "overlaps another activity in its lane". No API/engine change.
- Updated dependencies [[`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a)]:
  - @repo/types@0.12.0

## 0.26.0

### Minor Changes

- [#87](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/87) [`047b08e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/047b08e4bd04a568a7f8bab754386fdfa661740d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Enable the **advanced schedule constraints** (`VITE_ADVANCED_CONSTRAINTS`, ADR-0035 §7–§11, M4) and
  **per-activity calendar picker** (`VITE_ACTIVITY_CALENDAR`, ADR-0037, M5) by default. The activity
  form's Advanced-scheduling group (secondary constraint, as-late-as-possible, expected-finish), the
  plan-level Expected-finish toggle, the activities-table Conflict badge, and the per-activity Calendar
  select now ship on. Both surfaces' quality gates are cleared (the advanced-constraints editor's
  accessibility/component/UX reviews are green; the activity-calendar picker reuses the reviewed
  plan-calendar picker's primitive and states). No API or engine change — those were already live
  regardless of the flags. Set `VITE_ADVANCED_CONSTRAINTS=false` or `VITE_ACTIVITY_CALENDAR=false` to
  roll either back.

## 0.25.0

### Minor Changes

- [#82](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/82) [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Web activity calendar picker (M5, ADR-0037), behind `VITE_ACTIVITY_CALENDAR` (off by default). The
  activity form gains a **Calendar** `Select` — "Plan default (inherit)" or a specific org calendar —
  writing the activity's `calendarId`; the activities table shows an activity's own calendar when it
  isn't inheriting the plan's. The picker ships dark until its component/accessibility/UX gates are
  cleared; the underlying field, engine, and API are already live, so the flag only governs whether a
  planner can pick a per-activity calendar in the UI. The dialog always seeds `calendarId` from the
  row, so editing with the picker hidden round-trips the stored value unchanged.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Mandatory constraints now **produce-and-flag** instead of being silently parked (M4-F2, ADR-0035 §7).
  `MANDATORY_START`/`MANDATORY_FINISH` still pin their date with the same MSO/MFO arithmetic, but when a
  pin drives an activity earlier than its logic allows the engine now **produces the (impossible)
  schedule as pinned and flags it** — a new engine-owned `constraintViolated` boolean on each activity —
  surfacing the broken relationship as negative float on the predecessor, and never repairing it. A pin
  the network can satisfy is not flagged.

  The schedule summary's dishonest `parkedConstraintCount` is **replaced** by two honest counts:
  `constraintViolationCount` (mandatory pins that broke logic) and `constraintWarningCount` (the N15 case
  — a Start-No-Earlier-Than dated before the data date, honoured but unable to pull work back). The
  recalc response, read summary, and structured recalc log all carry the new counts; the summary strip
  shows "Constraint conflicts" / "Constraint warnings" figures with accessible explanations in place of
  the old "Parked constraints" figure. Plans with no mandatory constraints are byte-identical (the
  golden suite is unchanged) and report both counts as zero.

- [#85](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/85) [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Enable progress ingestion by default (`VITE_PROGRESS_INGESTION`, ADR-0035 M2).
  The progress editor's remaining-duration + suspend/resume inputs and the
  plan-level recalc-mode picker now ship on; set `VITE_PROGRESS_INGESTION=false` to
  roll back to the percent-plus-actual-dates editor. No API or engine change — those
  were already live regardless of the flag.

- [#84](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/84) [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Progress ingestion web controls (M2, ADR-0035), behind `VITE_PROGRESS_INGESTION`
  (off by default). When enabled:

  - The progress editor gains a **remaining duration** input (blank derives it from
    percent complete) plus **suspend / resume** dates for a paused activity — with
    client-side validation mirroring the API (resume ≥ suspend).
  - Plan settings gain a **recalc mode** picker — Retained Logic / Progress Override
    / Actual Dates — persisted with a targeted PATCH and applied on the next
    recalculation.

  The activity read model now exposes `remainingDurationDays`, `suspendDate`, and
  `resumeDate` (`@repo/types` + the activity response DTO), so the editor seeds and
  round-trips a stored value even with the inputs hidden. The engine, the settable
  API fields, and the plan recalc-mode column were already live; this slice only
  adds the flag-gated authoring UI.

- [#85](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/85) [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Surface progress-repair warnings and clarify the progress editor (M2 follow-up,
  ADR-0035 §6).

  - The progress endpoint (`PATCH …/activities/:id/progress`) now returns
    `meta.warnings` (a `ProgressWarning[]`) when it repairs a complete activity —
    `COMPLETE_WITHOUT_FINISH` (finish set to the data date) or
    `REMAINING_ON_COMPLETE` (remaining forced to zero). The write still succeeds and
    `data` reflects the corrected value; an ordinary report omits `meta`. Adds a
    reusable single-resource `ResourceEnvelope` for `{ data, meta }` responses.
  - The web progress editor announces those repairs on save, and a note makes clear
    the remaining/suspend/resume fields reschedule the remaining work rather than
    change the derived status.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Web advanced-constraints editor (M4, ADR-0035 §7–§11), behind `VITE_ADVANCED_CONSTRAINTS` (off by
  default). The activity form gains an **Advanced scheduling** group — a **secondary constraint**
  (paired type + date, driving the backward pass), an **As-late-as-possible** toggle, and an
  **expected-finish** date — and the plan settings gain an **Expected-finish scheduling** on/off
  toggle (`useExpectedFinishDates`). An engine-flagged `constraintViolated` activity (a mandatory pin
  produced-and-flagged against its logic) surfaces a **Conflict** badge in the activities table's
  Constraint column. The editor ships dark until its component/accessibility/UX gates are cleared; the
  underlying fields, engine passes, and API are already live, so the flag only governs whether a
  planner can edit and see them in the UI. The dialog always seeds the advanced fields from the row,
  so editing with them hidden round-trips a stored value unchanged.

- [#82](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/82) [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Per-activity working-time calendars (M5, ADR-0037). Each activity can now carry its own
  `calendarId` (create/update/response API + shared `ActivitySummary`) — `null` inherits the plan
  default. The CPM engine moved to an **absolute working-instant** axis so each activity's duration,
  float, and dates are measured on **its own** calendar: a 24/7 commissioning activity inside a 5-day
  plan works across weekends, and a relationship's `PREDECESSOR`/`SUCCESSOR` lag now resolves to the
  endpoint activity's calendar (completing M3's forward-wiring). A plan where every activity inherits
  the plan calendar recalculates **byte-identically** (the golden suite is the parity gate). The
  activity calendar is validated in-org under the calendar advisory lock (like the plan picker), and
  the recalculation resolves each distinct calendar once (O(distinct calendars), not O(activities)).

### Patch Changes

- Updated dependencies [[`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd), [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd), [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8), [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec)]:
  - @repo/types@0.11.0

## 0.24.0

### Minor Changes

- [#80](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/80) [`1cdc8b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1cdc8b1d5ef80ddf6caa94fe90fff6b4c307893e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Per-relationship lag calendars (M3, ADR-0036 §6). Dependencies gain a `lagCalendar`
  field (`PREDECESSOR` / `SUCCESSOR` / `TWENTY_FOUR_HOUR` / `PROJECT_DEFAULT`, default
  `PROJECT_DEFAULT`) exposed on the create/update/response API, with a lag-calendar selector
  on the dependency editor (and a lag-calendar label in the Logic panel's link lists). The CPM
  engine now measures each edge's lag on that calendar: `TWENTY_FOUR_HOUR` schedules the lag as
  **elapsed** time (e.g. concrete cure's `168h` = 7 elapsed days, not 7 working days), while the
  other three coincide with the plan calendar today (Predecessor/Successor become distinct once
  per-activity calendars land in M5). The default path is unchanged — a plan with no 24-Hour
  lag recalculates byte-identically.

### Patch Changes

- Updated dependencies [[`1cdc8b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1cdc8b1d5ef80ddf6caa94fe90fff6b4c307893e)]:
  - @repo/types@0.10.0

## 0.23.1

### Patch Changes

- [#72](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/72) [`ba3ca38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ba3ca389a107c5accd60d0d43826f4b2fb13bebb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Two small plan-toolbar fixes: the Auto-arrange lanes control now stays on the bar and greys out in
  View mode (shade-don't-hide), instead of disappearing and reappearing when switching between View and
  Edit — consistent with the other authoring icons. The search / filter field also gets a little more
  spacing from the divider on its left.

## 0.23.0

### Minor Changes

- [#70](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/70) [`ff5ec8d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ff5ec8d214611ef9244732815a5dd29b1fe045d3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Consolidate the plan toolbar and move the diagram legend onto the canvas (ADR-0031 amendment). The
  Link tool becomes a split-button that mirrors Add — one menu-button that picks the FS/SS/FF kind and
  arms link-mode in a single gesture. Plan details and Edit plan fold into the Row-1 Summary popover
  (status, data date and mode now sit above the schedule strip, with an Edit-plan shortcut), plus a
  quick edit-pencil beside the status pill. Keyboard shortcuts move beside Legend on Row 1 and the
  global `?` key opens them.

  The legend now lives on the canvas: the Legend control toggles a floating, draggable key panel
  overlaid on the diagram that can be positioned anywhere and pinned (its open state and position
  persist), so the key stays visible while reading the plan. Plus polish — the finish chip no longer
  wraps, "Coming soon" tooltips name their button, the zoom controls are more compact, and the search
  field gets a little breathing room.

## 0.22.0

### Minor Changes

- [#68](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/68) [`bb11b7f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bb11b7f3b67bf641e954378934d0f85d425013b5) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Redesign the plan toolbar as two rows split by "look vs change" (ADR-0031 two-row amendment). Row 1
  (Look) carries always-live view/navigate controls — Go-to-date, the zoom cluster, View, the
  Early | Visual scheduling-mode selector, a search/filter field with the find & analyse lenses, and
  right-aligned Finish / Summary / Legend. Row 2 (Do) carries a pen-gated authoring cluster (Add, Link,
  Auto-arrange, notes, Recalculate, Undo/Redo) that shades as one block when you're not editing, beside
  always-live plan & deliverable actions (Baselines, Calendar, Plan details, Edit plan, Export, and
  more). The toolbar no longer changes shape between viewing and editing — controls shade rather than
  disappear — and on a desktop the full labelled command set is visible with no `⋯` overflow.

  Also: the persisted data date leaves the toolbar (set at plan creation, changed via Edit plan;
  Go-to-date stays for navigation); the header collapses to one line (breadcrumb → plan name + status
  pill + pen status) and the redundant read-only banner is removed; the Add menu previews Hammock and
  Level-of-effort under "Span between activities"; and the Gantt/Resource view-mode switch is kept
  reserved (hidden) until a second view exists.

## 0.21.0

### Minor Changes

- [#66](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/66) [`ebb4ff5`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ebb4ff59114578224d2988b392edcd7a9b2d99f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): consolidate the plan toolbar — one zoom dropdown, a stable shape, and future-feature placeholders (ADR-0031 amendment)

  Refines the TSLD plan toolbar so it stops "changing what's visible" as plan/mode state shifts:

  - **One zoom control.** The five scale buttons (Day/Week/Month/Quarter/Year) collapse into a single
    `Zoom: <level> ▾` dropdown. This removes the Frame-group overload that made the width-based
    overflow silently demote Year/Quarter into the `⋯` at common widths.
  - **Shade, don't hide.** Zoom/Fit (and View/Legend/Shortcuts) now stay on the bar from the empty
    canvas onward — the zoom cluster is _disabled with a reason_ until a diagram is computed, rather
    than vanishing. The toolbar's silhouette no longer shifts between planning states.
  - **Future-feature placeholders.** Reserved slots now render as disabled "Coming soon" controls so
    the toolbar reads as fully designed: Undo/Redo inline; and — in the `⋯` overflow — Recenter-on-today,
    Search, Filter, Isolate-logic-path, Next-conflict, Colour-by, Baseline-overlay, Snap-to-grid,
    Resource-view, Add-note, Clear-visual-placement, Export, Print, Share, Comments and Update-progress.
    Full catalogue + how-to-enable in `docs/TOOLBAR_ROADMAP.md`.

  Frontend only, within the existing `VITE_CANVAS_TOOLBAR` surface; the flag-off `TsldViewControls`
  fallback is unchanged. No API/DB/type change.

## 0.20.0

### Minor Changes

- [#65](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/65) [`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling modes — mandatory project start + Visual planning (ADR-0033)

  Delivers ADR-0033's scheduling model. The **mandatory project start (M1)** is a live product
  change; the **Visual-planning surface (M2–M4)** ships behind the default-off `VITE_SCHEDULING_MODES`
  flag until enablement.

  **M1 — Mandatory project start (live):**

  - A plan can no longer exist without a start date. A backfill+NOT-NULL migration sets
    `plans.planned_start` for existing plans (CQ-6 chain: earliest active constraint date → actual
    start → creation day) and makes the column NOT NULL. `CreatePlanDto.plannedStart` is required (422
    without); `UpdatePlanDto` rejects an explicit `null` (the data date can be moved, never cleared).
    The web plan form requires it, and the ADR-0032 "first draw anchors to today" hack is gone.

  **M2–M4 — Visual planning (behind `VITE_SCHEDULING_MODES`):**

  - A plan-level `schedulingMode` (**Early** = computed-earliest CPM, **Visual** = hand-placed) with a
    toolbar mode selector, and a Planner-owned `Activity.visualStart` placement input fed through the
    engine's second, forward-only effective-Visual pass (placements pin the bar and push unplaced
    successors; the pure-network pass still owns early/late/float).
  - A Visual-mode canvas drag hand-places `visualStart` (no implicit SNET constraint); Early mode keeps
    the SNET path. Engine-owned conflict flags surface as an on-canvas warning triangle (shape, not
    colour-only) with a spoken read-out — placements are flagged, never auto-moved.
  - Navigation/data split: a "Go to date" view jump distinct from the persisted "Project start" anchor.
  - A read-only **Late-start overlay** renders bars from the late dates for float analysis (editing
    suppressed while on).

  Flag-off, the TSLD renders exactly as before.

### Patch Changes

- [#62](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/62) [`84ef690`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/84ef69089e06fecd78739a7099dba5da7f741169) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): anchor TSLD dependency lines to the correct edges per relationship type

  Dependency lines on the canvas were always drawn predecessor-finish → successor-start (FS geometry),
  ignoring the tie's actual type. They now attach to the edges the relationship constrains: **FS**
  finish→start, **SS** start→start, **FF** finish→finish, **SF** start→finish. The orthogonal elbow for
  cross-lane links is routed clear of the anchored edges (outside a finish edge, outside a start edge,
  or split for SF) so the line no longer cuts back across a bar. Pure render-model change; the engine
  already scheduled every type correctly — only the drawn line was wrong.

- [#64](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/64) [`c073c75`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c073c750d7c329286bd3106cb3f5e6dc3501ceb0) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling-modes M0 dark foundations (ADR-0033)

  Additive, behind-the-flag foundations for the scheduling-modes feature — **no user-visible change**
  (nothing sets `visual_start` yet and no UI reads the flag; existing plans recalc identically):

  - **Schema (additive, reversible):** a `SchedulingMode` enum + `Plan.schedulingMode` (default `EARLY`),
    the Planner-owned `Activity.visualStart` placement input, and four engine-owned outputs
    (`visualEffectiveStart/Finish`, `visualConflict`, `visualDriftDays`) modelled like the CPM columns.
  - **Engine:** a second, forward-only _effective-Visual_ CPM pass — honours each `visualStart` exactly,
    pushes successors from the feasible finish, and emits the conflict/drift outputs. The pure
    forward/backward pass is untouched, so `early*`/`late*`/float stay a pure function of the network
    (proven by a golden-parity test).
  - **Recalc wiring:** `visual_start` feeds the engine and the four outputs are persisted by the same
    batched `unnest` UPDATE — still out of the optimistic-lock `version`/`updated_at` path.
  - **Flag:** `SCHEDULING_MODES_ENABLED` (`VITE_SCHEDULING_MODES`, default-off), gated on the canvas host.

  The mandatory-`plannedStart` migration and the UI (mode selector, Visual drag, Late overlay, Go-to-date)
  land in later milestones.

- [#65](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/65) [`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling-modes M2 — navigation vs data-edit split (ADR-0033)

  Behind the default-off `VITE_SCHEDULING_MODES` flag — **no user-visible change** until it is enabled.
  De-overloads the single inline TSLD timeline date picker into two clearly-separated controls so that
  "looking at a date" no longer silently re-anchors the schedule (ADR-0033, Sub-feature 1):

  - **Go to date** — a labelled navigation popover that pans the canvas so the chosen date sits at the
    left edge. Pure view state: it issues no request, persists nothing (CQ-1), and is offered to every
    role, read-only viewers included. Backed by a new imperative `goToDate(iso)` on the canvas control
    handle and the pure `panToDate` viewport helper.
  - **Project start** — the persisted schedule anchor (`plannedStart`), now explicitly labelled and kept
    as the pen-gated data control; read-only viewers see it as a static read-out.

  Flag-off, the single "Timeline start" picker renders exactly as before.

- Updated dependencies [[`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c)]:
  - @repo/types@0.9.0

## 0.19.0

### Minor Changes

- [#61](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/61) [`1395359`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1395359c11c160936fe5e931250b38ab8811b78f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): mount the floating TSLD selection-actions bar (ADR-0031)

  Selecting an activity on the TSLD canvas now shows a small **floating toolbar** just above it with
  its object actions — **Open logic**, **Edit activity**, **Delete activity** — so the common actions
  are where the planner's attention already is, while the main toolbar stays stable (ADR-0031, Fork-2;
  resolves TECH_DEBT #31a — the bar was built + unit-tested but not previously mounted).

  - The bar follows the canvas **imperatively**: the canvas writes the selected activity's live
    viewport anchor to a ref each frame (ADR-0026 D3 — no per-frame React state) and the bar reads it
    on its own `requestAnimationFrame` to reposition, so pan/zoom track without re-rendering the
    toolbar. It flips below the selection when there's no room above, and hides when the selected bar
    scrolls off-screen or the pane is hidden.
  - Mutating actions (Edit / Delete) are **pen-gated as a set** (disabled with a reason) exactly like
    the main toolbar; **Open logic** stays available read-only. Edit/Delete open host-owned dialogs via
    a new shared `ActivityCrudDialogs`, keeping the tsld feature dependency-free (ADR-0026 D8).
  - The redundant **"Set constraint"** action was dropped (it duplicated Edit; there is no dedicated
    quick-constraint editor).

  No other capability changes — Open logic / Edit / Delete remain reachable from the parallel listbox
  and the activities table.

### Patch Changes

- [#59](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/59) [`65da1be`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/65da1be7c8aa9978227434000ec02b897c9a06ff) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - perf(web): pause the TSLD render loop when the canvas is off-screen; a11y + dedup cleanups

  Fast-follow debt paydown on the canvas-first plan workspace (TECH_DEBT [#30](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/30)/[#31](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/31)):

  - **Perf (#30d):** the TSLD canvas now pauses its `requestAnimationFrame` paint/measure work when
    it's off-screen (the below-`md` Activities pane showing, so the diagram pane is `display:none`),
    via an `IntersectionObserver`, and re-arms a repaint the moment it returns — no more painting an
    unseen canvas every frame on mobile.
  - **A11y (#30h):** the docked activities panel's landmark is renamed "Activities panel" so it no
    longer collides with the inner table's "Activities" scroll region (axe `landmark-unique`).
  - **Dedup (#31b/#30b):** the Plan details / Baselines / Calendar dialogs are extracted into one
    shared `PlanChromeDialogs` used by both plan layouts (so their copy can't drift), and the plan
    header's overflow menu adopts the shared `useMenuTrigger` hook.

  No behaviour change beyond the two polish items above.

## 0.18.0

### Minor Changes

- [#58](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/58) [`3e12e97`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3e12e9757f21eb754ec876fec3a81016b1979334) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan authoring on by default (ADR-0032)

  `VITE_CANVAS_AUTHORING` now defaults **on** (M1–M5 shipped with green a11y/ux/perf/e2e gates). A
  planner builds a plan directly on the TSLD canvas: a blank draw-ready canvas on a new plan, an inline
  timeline start-date, unified auto-recalculation after any structural edit, on-canvas activity types
  (Task + Start/Finish milestone via the Add split-button), and a two-click Link tool in place of
  edge-drag. It requires the toolbar + workspace flags (both default-on); turning either off disables
  authoring too. Set `VITE_CANVAS_AUTHORING=false` to roll back to table-first authoring + edge-drag
  linking, byte-for-byte.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — blank draw-ready canvas (ADR-0032, M0–M1)

  Behind the new `VITE_CANVAS_AUTHORING` flag (default-off; layered on `VITE_CANVAS_TOOLBAR`):

  - **M0:** the flag + ADR-0032 + the flag-on Playwright scaffold (`test:e2e:authoring`).
  - **M1:** a brand-new plan opens on an interactive, **blank draw-ready canvas** — the `TsldPanel`
    render gate is relaxed so the canvas mounts whenever there's a timeline anchor
    (`dataDate = plannedStart ?? today`), not only after a recalculation; uncalculated bars simply
    don't paint. Drawing the first activity on a start-less plan silently pins `plannedStart` to
    today (the canvas anchor) before the create, so the schedule dates stay coherent.

  Flag-off keeps today's table-first behaviour byte-for-byte. Frontend only; no API/DB change.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — inline timeline start-date control (ADR-0032, M2)

  Behind `VITE_CANVAS_AUTHORING`: an inline start-date control in the toolbar's Frame group reads and
  (pen-gated) writes the plan's `plannedStart` — the canvas day-zero origin — so a planner sets/adjusts
  the timeline start next to the canvas instead of opening the Edit-plan dialog. A writer edits it via a
  native date input; a read-only viewer sees the date as a focusable static read-out. Changing it
  re-anchors the timeline. Uses the `useSetPlanStart` targeted PATCH.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — unified auto-recalculate (ADR-0032, M3)

  Behind `VITE_CANVAS_AUTHORING`: after any structural edit — from the canvas **or** the activities
  table — the CPM schedule recalculates automatically, so the canvas plots new/changed rows without a
  manual Recalculate (the original pain of adding via the table). A plan-scoped `usePlanAutoRecalc`
  coalescer (trailing ~500 ms debounce + single-flight) drives it: the workspace model watches the
  activity/dependency count for creates/deletes (any surface) and the canvas edit callbacks `notify()`
  for repositions; the manual Recalculate button becomes a `flush()`. Guarded on role + pen + a start
  date. The recalculate endpoint and ADR-0022's engine-owned batched write are unchanged — only the
  client cadence. Flag-off keeps the per-edit inline recalc byte-for-byte.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — Add split-button + on-canvas milestones (ADR-0032, M4)

  Behind `VITE_CANVAS_AUTHORING` (default-off): the plain "Add activity" toggle becomes an APG
  menu-button **Add split-button** that arms the draw kind — **Task**, **Start milestone**, or
  **Finish milestone** — so planners create milestones directly on the canvas. A milestone draw
  collapses to a zero-duration point at the click; the workspace maps the chosen kind to a
  zero-duration create. While adding, the button reads "Adding {kind}" and offers "Stop adding".

  Flag-off the toolbar keeps the plain Add toggle byte-for-byte. Frontend only; no API/DB change.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — two-click Link tool replacing edge-drag (ADR-0032, M5)

  Behind `VITE_CANVAS_AUTHORING` (default-off): a new `'link'` edit mode is the canvas-first way to
  draw dependencies — click a predecessor, then a successor — with the dependency kind (**FS / SS /
  FF**) chosen from a toolbar selector instead of a keyboard chord. The picked predecessor rings on
  the interaction layer while the tool waits for the second click; Escape drops the pick, a second
  Escape leaves the tool. The flag suppresses the edge-handle rubber-band affordance so edge-drag is
  replaced, not duplicated.

  Flag-off the edge-drag linking path (Shift = SS, Alt = FF) is unchanged byte-for-byte. Frontend
  only; no API/DB change.

## 0.17.0

### Minor Changes

- [#54](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/54) [`38d6934`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/38d6934e1478f792398519571863895c1518518d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-maximal toolbar-hosted plan workspace (ADR-0031)

  Build the future-proof Toolbar architecture and the canvas-maximal chrome reclaim behind the
  `VITE_CANVAS_TOOLBAR` flag (default-off; layered on `VITE_CANVAS_WORKSPACE`):

  - A generic APG `<Toolbar>` primitive + declarative item registry (7-group taxonomy, three
    prominence tiers, responsive overflow, pen-gated authoring group, and non-interactive
    presentational read-outs kept out of the roving-tabindex order).
  - The TSLD command registry — every current canvas control (scale/zoom/fit, view toggles, add
    activity, auto-arrange, recalculate, baselines/calendar/plan-details, legend, summary + a pinned
    Project-finish chip) expressed as registry items over a `ToolbarContext`.
  - A compact pen-status control (replacing the big edit-lock banner card) and a floating
    selection-actions bar, both reusing the ADR-0028 hand-off internals via one shared hook.
  - The toolbar-hosted layout: a slim header + one command toolbar over a full-height **chromeless**
    canvas with the activities panel **collapsed by default**, and a below-`md` Diagram/Activities
    pane switch. Flag-off keeps the ADR-0030 workspace byte-for-byte (`TsldPanel` gains an optional
    controlled `canvasUi` + `chromeless` prop).

  Includes the flag-on Playwright journey and the specialist-review remediation: a shared
  recalculate command (loading + no-start hint restored), memoised toolbar context/UI-state so an
  unrelated re-render no longer churns the toolbar's `ResizeObserver`, one CVA for every toolbar
  control surface, and the accessibility fixes (presentational finish chip, disabled-overflow focus
  ring, popover close-on-blur).

  Frontend only. **ON by default** (`VITE_CANVAS_TOOLBAR`); set it to `false` to fall back to the
  ADR-0030 workspace byte-for-byte (emergency rollback / opt-out). Remaining fast-follows: TECH_DEBT [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/31).

## 0.16.0

### Minor Changes

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): make the canvas-first plan workspace the default plan surface (ADR-0030)

  Flip `VITE_CANVAS_WORKSPACE` **on by default** now that the M5 quality gates are green
  (a11y/ux/perf review findings folded in, the flag-on Playwright journey wired into CI, 538
  unit tests passing). Opening a plan now renders the TSLD canvas as the primary workspace
  surface with the activity table as a draggable, collapsible bottom panel, replacing the legacy
  long stacked plan-detail page. The old page remains as the flag-off fallback — set
  `VITE_CANVAS_WORKSPACE=false` for an emergency rollback. The flag-off Playwright suites are
  pinned to `VITE_CANVAS_WORKSPACE=false` so the legacy fallback stays covered too.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan workspace — M1 scaffold behind `VITE_CANVAS_WORKSPACE` (ADR-0030)

  Introduces the layout skeleton for opening a plan directly in the app-shell workspace with
  the TSLD canvas as the primary surface (ADR-0030, spec `docs/specs/canvas-first-plan-workspace.md`).
  **Off by default** behind the new `VITE_CANVAS_WORKSPACE` flag — flag-off keeps today's stacked
  plan-detail page byte-for-byte, so this ships dark.

  With the flag on, the plan surface becomes a `PlanWorkspace`: a slim header (plan identity,
  Recalculate, the edit-lock pen banner and schedule summary, with baselines + calendar behind a
  disclosure), the TSLD canvas filling the workspace height (`TsldPanel` gains a `fill` mode), and
  the activity table docked as a bottom panel (static height in M1; a draggable, collapsible
  resizer lands in M2). The route-composed orchestration (queries, gating, TSLD edit callbacks) is
  extracted into a shared `usePlanWorkspaceModel` hook so both the legacy page and the workspace
  render identical behaviour — the flag only chooses the layout.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan workspace — M2 resizable/collapsible activity panel (ADR-0030)

  With `VITE_CANVAS_WORKSPACE` on, the bottom activity panel can now be **dragged up/down to
  resize** and **collapsed to a handle** (pointer + keyboard), with its height and collapsed state
  persisted. The panel's height is clamped against the live workspace height so the canvas always
  keeps a minimum, and the canvas no longer **jumps/re-fits** while the panel is dragged (the TSLD
  canvas preserves its viewport across a surface resize; explicit Fit and a data-date change still
  re-frame).

  Per the product-owner steer, this extracts a single **orientation-aware resizable-panel
  primitive** — `PanelResizer` (a WAI-ARIA window splitter) + `useResizablePanelPrefs` (clamp +
  persist + reset-on-corrupt) — and **refactors the Project Explorer rail onto it**, so the rail
  (vertical splitter → width) and the activity panel (horizontal splitter → height) share one
  implementation. No behaviour change to the rail. Frontend only; still off by default.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan workspace — M3 header overflow menu (ADR-0030)

  Consolidate the plan workspace header's lower-frequency chrome — **Edit plan, Baselines,
  Calendar** — into a single "⋯" **overflow menu** (the shared WAI-ARIA APG `Menu` primitive),
  replacing M1's interim `<details>` disclosure. Baselines and Calendar now open in the shared
  modal `Dialog`; Edit plan is shown to writers only. The header stays slim and canvas-first:
  plan identity + Recalculate + the pen banner + the schedule summary. Still off by default
  behind `VITE_CANVAS_WORKSPACE`; frontend only.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan workspace — M4 responsive single-pane (ADR-0030)

  Make the canvas-first workspace usable on narrow viewports. At/above `md` it keeps the vertical
  split (canvas + drag-resizable activity panel); **below `md` it switches to a Diagram / Activities
  segmented view toggle** showing one pane at a time — the canvas can't usefully share a phone's
  height with a table. Both panes stay mounted and are toggled with `hidden`, so switching preserves
  the canvas viewport and the table scroll. Adds a small reusable `useMediaQuery` hook (structure-
  changing queries only; pure styling stays on Tailwind `md:`/`lg:`). Still off by default behind
  `VITE_CANVAS_WORKSPACE`; frontend only.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): canvas-first plan workspace — M5 review fixes (a11y/perf/ux) (ADR-0030)

  Fold in the blocking findings from the accessibility, UX and performance reviews of the canvas-
  first workspace (still off by default behind `VITE_CANVAS_WORKSPACE`; frontend only):

  - **a11y** — the mobile Diagram/Activities view toggle is now a proper `radiogroup` of two
    `radio`s with roving `tabIndex`, arrow/Home/End keys and a 44px target; on collapse/expand the
    panel moves focus onto the reciprocal control instead of dropping to `<body>`; menu items get a
    visible `focus:` ring (WCAG 1.4.11); a single consolidated pen read-only note replaces the two
    duplicated notes.
  - **perf** — `formatCalendarDate`/`formatTimestamp` reuse module-scope `Intl.DateTimeFormat`
    singletons instead of constructing a formatter per call; the activity listbox descriptions are
    memoized; the panel resizer coalesces pointer moves onto a single `requestAnimationFrame`.
  - **ux** — a "Plan details…" read surface (available to every role) exposes the status/planned-
    start/description the slim header omits; the loading state renders a workspace-shaped skeleton so
    the load→loaded transition doesn't jump; header breadcrumbs restored.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): on-canvas activity labels for the TSLD

  The Time-Scaled Logic Diagram now draws each activity's label
  (`{code} {name} · {n}d`) directly on the canvas, so a planner can read which
  activity each bar is without selecting it — realising the on-canvas text
  ADR-0026 D1 budgeted for. Labels place adaptively (inside a wide-enough bar,
  truncated + ellipsised; beside a short bar or milestone when the lane leaves
  room; suppressed when zoomed too far out), are culled to the visible viewport,
  and are drawn in the Canvas 2D painter (no DOM overlay). A sixth "Labels" view
  toggle (default on) hides them for a denser diagram.

  The visible label and the accessible name build on one shared identity builder
  so they can't disagree (WCAG 2.5.3); inside text uses each fill's paired
  `*-foreground` token for contrast in both themes. Re-verified within the
  ADR-0026 draw budget (p95 3.9ms at 2,000 activities). No backend change.

## 0.15.0

### Minor Changes

- [#47](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/47) [`8cc3a68`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8cc3a68d18d2458231089de8f5abf46d6dc817af) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): turn Project Explorer in-tree CRUD on by default

  `VITE_NAV_TREE_CRUD` now defaults **on** — the row context menu (create/rename/
  soft-delete via the ⋯ button, right-click, ContextMenu/Shift+F10 key, and touch
  long-press) and the rail-header "New client" control are live for writers
  (Planner/Org Admin); Contributors/Viewers keep a read-only tree. Adds the flag-on
  Playwright journeys (create client→project→plan from the rail, rename, and
  cascade-delete → Recently Deleted) with an accessibility pass. Set
  `VITE_NAV_TREE_CRUD=false` to fall back to the navigation-only tree.

- [#47](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/47) [`8cc3a68`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8cc3a68d18d2458231089de8f5abf46d6dc817af) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): in-tree CRUD for the Project Explorer (ADR-0029 Phase 2)

  Planners and Org Admins can create, rename, and soft-delete clients, projects,
  and plans directly from the Project Explorer rail — via a per-row "⋯" button,
  right-click, or the ContextMenu/Shift+F10 key — plus a "New client" control in
  the rail header for the empty-org case. It reuses the existing form dialogs,
  `ConfirmDialog` (with kind-appropriate cascade copy), mutation hooks, optimistic
  locking, and the soft-delete/Recently-Deleted flow; there is no backend change.

  Introduces a hand-rolled, tokenised `Menu`/`MenuItem` design-system primitive
  (WAI-ARIA APG Menu Button — no new dependency) and a shell-layer `NavigatorCrud`
  coordinator that owns the dialogs, so the shared tree emits CRUD intents without a
  `feature → feature` import (an extension within ADR-0029; recorded in
  `docs/DECISIONS.md`). Selection stays a pure projection of the URL, so a new plan
  navigates + reveals while new folders are revealed by expansion.

  Ships behind `VITE_NAV_TREE_CRUD` (off by default) and additionally gated by write
  RBAC, so Contributors/Viewers keep a read-only tree.

### Patch Changes

- [#47](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/47) [`8cc3a68`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8cc3a68d18d2458231089de8f5abf46d6dc817af) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): give the public accept-invite page a single `main` landmark

  Promote the invitation-accept card's centered layout into a shared
  `InviteShell` (mirroring `AuthShell`) and route the no-token empty state
  through it, so every branch of the accept-invite flow renders exactly one
  `main` landmark instead of the route and the card each defining their own
  (WCAG 2.2 — 1.3.1 Info and Relationships).

## 0.14.1

### Patch Changes

- [#45](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/45) [`6587054`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/65870545a9a6c2b37d544f4a6ef952d016ea067b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Virtualize the Project Explorer tree (ADR-0029, C2). The flattened visible rows are
  now windowed with `@tanstack/react-virtual`, so the rail stays cheap at org scale
  (hundreds of plans). ARIA `setsize`/`posinset` come from the full model and the
  focused/selected node is always kept rendered, so roving-tabindex keyboard navigation
  and deep-link selection still reach any node even when it is scrolled out of view. No
  visible behaviour change for small trees.

- [#45](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/45) [`6587054`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/65870545a9a6c2b37d544f4a6ef952d016ea067b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Compose the shell's workspace region as a single `<main>` (ADR-0029, M3). The routed
  screens (clients, projects, plans, the plan workspace, members, calendars, baselines,
  recently-deleted, onboarding, and the welcome landing) now render their content into
  the shell's one main region instead of each owning a `<main>` of its own — removing
  per-page landmark duplication so the top bar + rail are truly composed once. Purely
  structural: each view's content and layout are unchanged.

## 0.14.0

### Minor Changes

- [#43](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/43) [`85eb923`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/85eb9238f33c3ac9ddd64af34d76eaaddc9a1e52) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Introduce the persistent **app-shell** foundation (ADR-0029), behind `VITE_NAV_TREE`
  (off by default). The authenticated layout becomes a mounted-once shell — top bar +
  a **Project Explorer** rail + a single workspace region — so navigating between plans
  swaps only the main region and the rail keeps its state. On `lg`+ the rail is pinned,
  **collapsible and resizable** (a keyboard-operable splitter; width/collapsed state
  persisted); below `lg` it is an off-canvas **drawer** opened from the header. With no
  plan selected the workspace shows a neutral **welcome empty-state** ("Select a plan
  from the Project Explorer", plus a getting-started hint for a brand-new org).

  This is the M1 slice: the rail body is a placeholder — the accessible Client → Project
  → Plan tree lands in M2. Flag-off is byte-for-byte today's layout. Adds a reusable
  `Sheet` (off-canvas drawer) primitive on the native `<dialog>`. No API or database
  change.

- [#43](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/43) [`85eb923`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/85eb9238f33c3ac9ddd64af34d76eaaddc9a1e52) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Ship the **Project Explorer** navigator and turn the persistent app-shell **on by
  default** (ADR-0029). The rail now hosts an accessible Client → Project → Plan tree:

  - **Lazy drill-down** — expanding a client loads its projects, a project its plans,
    one query per expanded node (reusing the existing hierarchy reads, so page CRUD
    refreshes the tree for free). Nothing is fetched until you open it.
  - **URL-projected selection + deep-linking** — the open plan is highlighted; landing
    on a plan/project URL auto-reveals and scrolls its ancestor path into view.
  - **Keyboard-first** — a WAI-ARIA `tree` with roving focus and the full APG keymap
    (↑/↓, ←/→ to expand/collapse/move, Home/End, Enter/Space). Per the product
    decision, **client/project rows only expand**; only a **plan** opens on the canvas.
  - The shell (top bar + collapsible/resizable rail, drawer below `lg`, welcome
    landing) is now the default navigation surface; set `VITE_NAV_TREE=false` for the
    previous header-only layout (emergency rollback). No API or database change.

## 0.13.0

### Minor Changes

- [#41](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/41) [`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Close the "date constraints" loop in the UI. The activity form's constraint
  selector now offers only the **six** kinds the CPM engine honours exactly as
  labelled (`SNET`/`SNLT`/`FNET`/`FNLT`/`MSO`/`MFO`); the two `MANDATORY_*` kinds —
  which the engine silently parks as their moderate equivalents (ADR-0023 §6) — are
  no longer newly selectable, so a planner can't set a constraint that behaves
  differently than it reads. An activity that already carries a parked value keeps it
  as an honest, spelled-out option ("Mandatory start — applied as Must start on") and
  is **never silently changed** on open.

  A set constraint is now visible without opening each row: a text **Constraint**
  column in the activities table (`"SNET · 01 May 2026"`, with the full label as its
  accessible name), a small **pin** on the constrained edge of a bar on the TSLD
  canvas (a shape cue, not colour — with a legend entry and a spoken equivalent in the
  diagram's accessible listbox), and an explanation of the "Parked constraints" figure
  in the schedule summary.

  `@repo/types` gains `SELECTABLE_CONSTRAINT_TYPES` / `PARKED_CONSTRAINT_TYPES` /
  `isParkedConstraintType` (the honoured-as-labelled set, mirroring the engine). No
  API, database, or engine change — the constraint write path, optimistic locking, and
  pen gating are untouched.

- [#41](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/41) [`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make the TSLD canvas read like a time-scaled document. The diagram now has a sticky,
  **adaptive date ruler** across the top (year → month → day bands that re-scale as you
  zoom), **zoom presets** (Day / Week / Month / Quarter / Year) with zoom −/+ alongside
  Fit, a **TODAY** marker, **non-working-day shading** (weekends _and_ the plan
  calendar's holiday exceptions), and five **layer toggles** (day / month / year grid,
  today, non-working) to declutter. All view controls are available whether or not
  you're editing, and every control is a real, labelled, keyboard-operable button or
  checkbox.

  Entirely client-side and within the existing canvas architecture (ADR-0026): the
  ruler is a DOM overlay updated imperatively from the render loop so the viewport
  stays ref-authoritative (no per-frame React state), the new paint layers are culled
  and batched to hold the draw budget, and the accessible parallel listbox is
  unchanged. No API, database, or schedule-engine change.

### Patch Changes

- Updated dependencies [[`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b)]:
  - @repo/types@0.8.0

## 0.12.0

### Minor Changes

- [#39](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/39) [`8b3e08d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8b3e08de1d9ea6e60c77d893762672cafe098a24) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Enable the TSLD on-canvas editing surface and the plan edit-lock "pen" by
  default. The two web flags — `VITE_TSLD_EDITING` (create/move/link/relane on the
  logic diagram) and `VITE_PLAN_EDIT_LOCK` (the single-editor "pen": a Planner takes
  an exclusive lock via **Start editing** before the schedule-editing affordances go
  live, peers see who holds it and can request/take over control) — now **default
  ON**, with `=false` as the rollback/opt-out. This lands now that every
  pre-enablement gate is green: the flag-on Playwright harness, the accessibility
  sign-off, and the manual cross-browser `Alt+←/→` history-suppression sweep
  (Firefox/Safari/Edge).

  The API write-gate `PLAN_EDIT_LOCK_ENFORCED` is unchanged (still **default-off**)
  and remains the single deliberate rollout switch: enable it only once a bundle with
  the pen on is deployed (ADR-0028 §9 ordering) — enabling it ahead of the web bundle
  would 423 the activities-table / dependency / recalculate flows. Until then the pen
  coordinates editors in the UI while the server still accepts writes.

  Read-only consumers are unaffected: the Contributor progress path is never
  pen-gated, and setting `VITE_TSLD_EDITING=false` restores the read-only diagram
  byte-for-byte.

## 0.11.0

### Minor Changes

- [#35](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/35) [`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the plan edit-lock **web "pen" layer** (edit-lock M2, ADR-0028), behind a new
  `VITE_PLAN_EDIT_LOCK` flag (default **off** — ships inert). When enabled, the plan
  screen shows a single **"who holds the pen"** banner: a Planner clicks **Start
  editing** to take an exclusive edit-lock (a background heartbeat keeps it alive,
  released on Stop / navigation / tab-close), and the on-canvas schedule editing
  affordances — the TSLD canvas, activity create/edit/delete, the positions batch,
  the dependency editor, and Recalculate — become live only while holding it.
  Everyone else sees who's editing (and, per their role, can **request control**,
  **take over** once the holder goes idle / a grace window elapses, or — as an Org
  Admin — take over immediately via a confirm); the Contributor progress path and
  plan-metadata edits are never pen-gated. A **423 `LOCKED`** response drops the
  surface to read-only with distinct copy, separate from the 409 "changed elsewhere"
  conflict. With the flag off, nothing polls or changes — current behaviour
  byte-for-byte. Enable `VITE_PLAN_EDIT_LOCK` **before** the backend's
  `PLAN_EDIT_LOCK_ENFORCED` (ADR-0028 §9 rollout ordering).

### Patch Changes

- [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/38) [`bd3b2d1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd3b2d117521090618fa76a4d7163849de661318) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix stale driving-arrow styling on the TSLD canvas after a recalculate. The CPM
  recalculate rewrites each dependency's engine-owned `isDriving` flag, but
  `useRecalculate` only invalidated the schedule summary, activities and baseline
  variance — not the dependency query where `isDriving` lives. So after a
  reposition-in-time or create-activity edit (which recalc but don't otherwise touch
  the dependency cache), the driving-vs-non-driving arrows could render stale until a
  manual refresh. `useRecalculate` now also invalidates the plan's dependency query,
  closing the last gap in TSLD M3 (live critical path + driving arrows).

- [#37](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/37) [`ce59178`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ce591786a5e3db36db2b5e061eb2fb4941e05a6c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the (flag-gated) TSLD on-canvas editing surface toward enablement — no
  user-visible change, both editing flags remain off by default.

  - **fix(web):** the coalesced keyboard-nudge now flushes a delta queued _behind_ an
    in-flight write on unmount (previously a `!busyRef` guard could silently drop it).
  - **perf(api):** the edit-lock heartbeat resolves the caller's own holder profile
    from the session instead of a `users` query — the common beat issues zero extra
    DB reads.
  - **test:** a flag-on Playwright harness (`test:e2e:edit`, wired into CI) that serves
    the app with the editing flags on and the API enforcing the lock, with pen-gating,
    single-actor pen-lifecycle, and keyboard-edit journeys (the latter automating the
    `Alt+←/→` history-suppression check on Chromium); plus a route-level `plan-detail`
    gating/reposition-seam test. Operators: see
    `docs/runbooks/tsld-editing-enablement.md` for the enablement procedure.

- [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/38) [`bd3b2d1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd3b2d117521090618fa76a4d7163849de661318) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add a client-side link-legality pre-check to the TSLD dependency-draw (flag-gated
  editing, `VITE_TSLD_EDITING`). While drawing a dependency, the hovered target now
  rings by legality — a legal drop rings solid; a self-link, duplicate, or cycle rings
  dashed in the critical colour (colour and dash, not colour alone) — and an illegal
  drop the loaded graph already proves invalid is refused locally with an explanation
  (no round-trip to the server, which stays authoritative). Closes the ADR-0026 D5
  "live legality feedback" follow-up.
- Updated dependencies [[`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263)]:
  - @repo/types@0.7.0

## 0.10.0

### Minor Changes

- [#33](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/33) [`be36f12`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be36f12f653489bad900406ab1b5270bbc9652fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Complete the Time-Scaled Logic Diagram's keyboard **edit** model (M8 M5, slice 5.2; behind
  `VITE_TSLD_EDITING`). Keyboard users can now reposition an activity **in time** — `Alt+← / Alt+→`
  nudges its start one day earlier / later (an SNET constraint that recalculates) — alongside the
  existing `Alt+↑ / ↓` lane move, and press **`n`** to create an activity pre-filled at the focused
  lane and start. A **held** Alt+arrow is now coalesced into a single net write per burst (with an
  optimistic preview) and writes are serialized, so holding a key smoothly moves several lanes/days
  and issues one PATCH at the current version instead of racing several — which also removes the
  self-inflicted "changed elsewhere" conflicts a fast key-repeat used to cause. An `Alt+↑` at the top
  lane now says "Already in the top lane." rather than silently doing nothing. The in-app keyboard
  shortcuts help lists the new edit keys.

- [#33](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/33) [`be36f12`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be36f12f653489bad900406ab1b5270bbc9652fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the Time-Scaled Logic Diagram's keyboard accessibility (M8 M5, slice 5.1 — read; ships with
  editing off). The activity list now supports **driving-first chain navigation** (`[` / `]` jump to
  the predecessor / successor that drives the schedule, so a keyboard user can trace the driving path)
  and an on-demand **logic summary** (`Space` announces how many ties an activity has and which are
  driving) — delivering the driving/critical context without bloating the per-keystroke announcement,
  which additionally now states **total float**. **Focus-follows-viewport** pans the diagram the
  minimum distance to keep the selected bar's focus ring on-screen (WCAG 2.4.7 / 2.4.11), and if the
  selected activity is deleted elsewhere, selection reconciles to the nearest survivor. A **`?`
  keyboard-shortcuts help** sheet (also reachable by button) documents the full keymap in-app.

## 0.9.0

### Minor Changes

- [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/31) [`fd8de38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fd8de385fe7f84c11359871345470e07f8bbc3f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **Auto-arrange lanes** to the Time-Scaled Logic Diagram (M8 M4 4.3, ADR-0026, behind
  `VITE_TSLD_EDITING`). A toolbar action repacks the diagram's activities into the **fewest lanes
  with no time-overlap** using a pure, deterministic greedy first-fit packer, and persists the
  result in one all-or-nothing batch write (no schedule recalculation — it changes only vertical
  layout). Because a bulk reorder can move many bars and isn't undoable yet, it's guarded by a
  confirm dialog; only the activities whose lane actually changes are written (the minimal diff),
  an already-tidy diagram reports "nothing to move", and a concurrent edit is surfaced
  non-destructively (the whole pack is refused, nothing moves).

- [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/31) [`fd8de38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fd8de385fe7f84c11359871345470e07f8bbc3f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make on-canvas bar dragging **two-dimensional** in the Time-Scaled Logic Diagram (M8 M4,
  ADR-0026, behind `VITE_TSLD_EDITING`). A body drag now moves an activity **freely in both axes
  at once**: horizontally to a new start day (an SNET constraint that recalculates the schedule —
  the existing M2 move) **and** vertically to a new lane (`laneIndex`, layout only — no recalc).
  Per-axis snapping gives a half-cell dead-zone, so a mostly-horizontal drag won't accidentally
  change lanes (and vice-versa). A drop commits only the axes that actually changed as one
  optimistically-locked write: a lane-only move is the cheap `{ laneIndex, version }` PATCH (no
  recalc); a time move (with or without a lane change) is one PATCH carrying the SNET constraint
  (and the lane) followed by a recalc. Keyboard users get the same reach: **`Alt+↑ / Alt+↓`** on
  the focused activity in the parallel listbox nudges it one lane (WCAG 2.1.1). A stale-version
  conflict is surfaced non-destructively and never re-sent.

## 0.8.0

### Minor Changes

- [#29](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/29) [`5c3fbf4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5c3fbf47d3e900c3e73f9724713e8e677bcbc7c9) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **live driving arrows** to the Time-Scaled Logic Diagram (M8 M3, ADR-0026).

  The CPM engine now computes, on every recalculate, whether each dependency is **driving** — the
  binding logic tie that sets its successor's early start (CPM/GPM "driver") — and persists it as the
  engine-owned `dependencies.is_driving` (ADR-0022 batched write; never touches `version`/`updated_at`,
  so a recalc stays invisible to optimistic locking). It's exposed as `DependencySummary.isDriving` on
  the dependency API. The flag is derived purely from the forward-pass timing, so computed dates are
  unchanged and the golden CPM suite still holds; an edge with slack, or one whose successor is clamped
  by a constraint above every incoming bound, is non-driving.

  On the TSLD canvas, driving links are now drawn **emphasised** — a heavier solid line — versus a thin
  dashed line for non-driving links, so "which relationships are actually driving the schedule" reads at
  a glance. The weight-plus-dash encoding never relies on colour (WCAG 1.4.1), matching the bar
  criticality cue, and the diagram legend gains **Driving link** / **Non-driving link** entries.

## 0.7.0

### Minor Changes

- [#26](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/26) [`04fc100`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/04fc1003f87d08ad6e617dd8458051f5d3d6fd13) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add on-canvas **create-by-drag** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind
  the OFF-by-default `VITE_TSLD_EDITING` flag. When enabled for a writer (Planner/Org Admin),
  the diagram gains an **Add activity** tool: drag on the timeline to draw a task (a click or
  sub-day drag makes a 1-day task), then name it in an inline popover — `Enter` creates it,
  `Esc` cancels with nothing persisted. The new activity is placed at the dropped day via an
  SNET constraint and the schedule recalculates authoritatively (no client-side CPM); the drag
  shows an instant ghost on a dedicated interaction layer so feedback never waits on the network.

  Every gesture keeps a keyboard-operable equivalent (the create dialog/table), so nothing is
  pointer-only. With the flag off — the default build — the diagram is byte-for-byte the M1
  read-only surface.

- [#26](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/26) [`04fc100`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/04fc1003f87d08ad6e617dd8458051f5d3d6fd13) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **dependency-draw** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind the
  OFF-by-default `VITE_TSLD_EDITING` flag. In Select mode a writer drags from an activity bar's
  start/finish **edge handle** to another bar to create a logic link: a rubber-band follows the
  pointer, the valid drop target is highlighted, and modifiers pick the type — plain drag is
  **FS**, **Shift** is **SS**, **Alt** is **FF** (the rarer **SF** stays in the dependency
  dialog). On drop the link is created via the existing `POST /dependencies` and the schedule
  recalculates authoritatively. A cycle or duplicate (ADR-0021) is surfaced as a non-destructive
  conflict banner with the engine's reason — nothing is created and the draw is never retried. The
  capability is keyboard-reachable too: pressing **Enter** on a focused activity in the diagram's
  listbox opens its logic editor, so link-draw adds no pointer-only capability (WCAG 2.1.1).
  Editing remains off in the default build.

- [#26](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/26) [`04fc100`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/04fc1003f87d08ad6e617dd8458051f5d3d6fd13) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **reposition-in-time** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind the
  OFF-by-default `VITE_TSLD_EDITING` flag. In Select mode a writer drags an activity bar's body
  sideways to move it in time: the drag shows an instant ghost of the moved bar, and on drop the
  new start is imposed as an **SNET constraint** via the existing activity update (carrying the
  live `version` for optimistic locking) and the schedule recalculates authoritatively — the
  engine still owns the working-day placement (a bar may settle a day or two off the ghost on a
  non-working day). A press without moving simply selects the bar. If someone else changed the
  plan first, the stale-`version` 409 surfaces as a non-destructive conflict banner and the move
  is not re-sent. Editing remains off in the default build.

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
