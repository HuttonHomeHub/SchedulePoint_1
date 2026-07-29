# ADR-0060: The tabbed activity editor, per-scope save, the steps edit-lock gate, and the co-located progress model

- **Status:** Proposed
- **Date:** 2026-07-28
- **Deciders:** Technical Lead, Product Owner
- **Note:** the three open questions were answered on 2026-07-28. Two were confirmed as drafted; the
  third (steps gating) was answered with an option neither drafted alternative offered — fix the
  server (§5) — which is why this ADR is no longer describing a purely frontend change.
- **Spec:** [`docs/specs/activity-editor-restructure/`](../specs/activity-editor-restructure/feature-spec.md)

## Context

`ActivityFormDialog` asks for **22 fields** behind **one** Save button. That is not a matter of
taste: the next-largest dialog in the app has 8 fields, the median across nineteen is 3, and
thirteen have four or fewer. **One** dialog has a size problem. It got there honestly — one field
per accepted decision over a year (ADR-0037 calendar, ADR-0038 WBS parent, ADR-0040 duration type,
ADR-0041 levelling priority, ADR-0042 EV inputs, ADR-0043 external dates, ADR-0044 accrual) — and
there is no reason to think the growth stops.

Three things about it are wrong in ways that can be pointed at rather than argued about:

1. **Ten of 22 fields are in no group at all** — an eight-field ungrouped preamble, `Description`
   trailing after the last fieldset.
2. **The primary constraint is orphaned from the secondary.** `Constraint` / `Constraint date` sit
   between the Cost fieldset's close and the Advanced fieldset's open, while `Secondary constraint`
   sits inside `Advanced scheduling`. Two halves of one concept in two different grouping states.
3. **The progress model is spread over four dialogs and one of its controls is inert.**
   `ActivityProgressDialog` holds the schedule % that moves dates; `ActivityFormDialog` holds the
   `% complete type` selector and the manual physical %; `ActivityStepsDialog` holds the weighted
   steps; `ActivityResourcesDialog` holds the units. `rollupPhysicalPercent`
   (`schedule/engine/earned-value.ts:56`) makes steps **win** over the manual field whenever total
   weight > 0 — and the manual field stays enabled, editable and unexplained when they do. Same
   defect class as the Gantt zoom preset (ADR-0059 M6) and the `RESOURCE_DEPENDENT` calendar picker:
   a lit control with no effect. The **selector** for a three-way choice sits on a screen with none
   of the three things it selects between.

A fourth item stood here in the first draft — "all three `<legend>`s are `sr-only`, so a sighted
user gets hairline rules" — and it was **wrong**, in a way worth leaving on the record. Each
`sr-only` `<legend>` is immediately followed by a **visible** `<p aria-hidden="true">` carrying the
same text (`ActivityFormDialog.tsx:532-536, 652-656, 711-715`), which is the standard workaround for
`<legend>` being near-impossible to lay out inside a flex column. Sighted users do see the headings;
the two audiences get equivalent information; it survived review because it is fine. The draft's own
sentence — "the usual accessibility failure is the other way round, which is presumably how it
survived review" — was a story invented to explain a defect that did not exist, in an ADR that cites
ADR-0058's "verify the claim; do not trust the document" three paragraphs later. Both the dialog
audit and this ADR read the `sr-only` and stopped. **No WCAG benefit is claimed for this work.**

What remains of it is a consistency point, and it is worth doing on that basis alone: two sibling
dialogs (`CalendarFormDialog`, `AddCrossPlanLinkDialog`) use a real visible `<legend>`, and the
workaround duplicates each heading across two nodes that can drift. The requirement below is
therefore "one source of truth per section heading", not "remove the `sr-only`".

One constraint dominates the design. Progress writes are deliberately **not** pen-gated (ADR-0028)
so a Contributor can report from site without taking the plan edit-lock; definition writes are.
Merging progress into the definition form behind one Save would fuse a non-pen-gated Contributor
write with a pen-gated Planner one, and the Contributor would lose a capability the pen model was
built to preserve. That is the reason this ADR exists at all: the interesting decision is not
"tabs", it is **where the Save button goes**.

Two further facts were verified in the code rather than assumed, and both shape the outcome:

- `UpdateActivityDto` states "Every field is optional; send only what changes", and partial PATCHes
  are already in production (`useSetActivityVisualStart` and `useRepositionLane` send two or three
  keys). Per-scope saves need **no API change**.
- The steps `PUT` is **not** pen-gated server-side: `activity-steps.service.ts` asserts
  `activity:update` and never calls `assertHoldsPen`. Meanwhile **every web path to that write has
  always required the pen** — `plan-dialogs.tsx:156` gates it on `model.canEditSchedule`, and
  `ActivitiesTable`'s prop, though named `canWrite`, is fed `model.canEditSchedule` at both of its
  call sites (`plan-detail.tsx:351`, `activity-bottom-panel.tsx:84`). The first draft of this ADR
  said "the two hosts disagree with each other"; they do not. The divergence is
  **client-versus-server**, which is the more serious of the two and is what §5 fixes.

## Decision

**1. We will introduce a hand-rolled APG `Tabs` primitive at `components/ui/tabs.tsx`**, in the
lineage of `menu.tsx`, `combobox.tsx` and `segmented-control.tsx` — no new dependency; adding a
component library remains an ADR-level decision. The primitive owns **both halves** of the wiring
(`role="tablist"` / `role="tab"` with `aria-selected`, `aria-controls` and roving `tabindex`, and
the single `role="tabpanel"` with `aria-labelledby`), with ids from `useId()`, so a consumer cannot
mis-relate a tab to its panel because it never writes those attributes. Activation is **automatic**
(selection follows arrow focus), matching `SegmentedControl` and appropriate because every panel's
state already lives in a hook — arrowing past a tab costs nothing and loses nothing.

The panel carries `tabIndex={0}` even though it contains focusable children, which the APG
discourages. The panel is a **scroll container**, and an unreachable scroll region fails WCAG 2.1.1.
The scrollable-region rule wins; the reason is recorded here and in the file, not left as a puzzle.

**It has exactly one consumer.** Nineteen dialogs were counted; one has the problem tabs solve.
This is stated plainly rather than dressed as the start of a rollout, because a primitive justified
by imagined consumers grows options nobody needs — the `renderControl` escape hatch removed from
`form.tsx` the day it shipped is the local precedent.

**2. `ActivityFormDialog` becomes `ActivityEditorDialog`, with four tabs**: **General**
(identity, duration, WBS parent, description), **Scheduling** (calendar, **both** constraints
together, ALAP + expected finish, external dates, levelling priority), **Progress**, **Cost**
(budgeted/actual expense, accrual). All 22 fields are placed; none is ungrouped; every section
heading is visible and rendered **from one string** (a real `<legend>` where the layout allows,
otherwise the existing pairing driven from a single constant — a de-duplication rule, not an
accessibility fix); the orphaned primary constraint rejoins the secondary; `Description` stops
trailing;
`% complete type` moves out of "Cost & earned value" and onto Progress, beside what it selects
between. A tab whose every field is hidden by flags is not rendered — an empty tab is a dead end.

**3. Save follows the write scope, not the tab.** Each scope has its own form, its own validation
and its own mutation, and sends **only its own keys plus `version`**:

| Scope                            | Endpoint                          | Permission                 | Pen?      |
| -------------------------------- | --------------------------------- | -------------------------- | --------- |
| General / Scheduling / Cost      | `PATCH …/activities/:id`          | `activity:update`          | yes (423) |
| Progress → Reported progress     | `PATCH …/activities/:id/progress` | `activity:update_progress` | **no**    |
| Progress → How value is measured | `PATCH …/activities/:id`          | `activity:update`          | yes       |
| Progress → Weighted steps        | `PUT …/activities/:id/steps`      | `activity:update`          | yes — §5  |

On three tabs that is exactly one Save. **The Progress tab carries three**, and the reasons are
structural rather than aesthetic:

- **Permission.** Fusing reported progress with the value measure puts a Contributor write behind a
  pen-gated Planner one. That is the regression the whole design exists to avoid.
- **Atomicity.** `PUT …/steps` and `PATCH …/:id` both bump the same activity `version`. One button
  firing both is a two-phase write whose second call needs the first's returned version, and whose
  partial failure leaves half a panel saved with no honest way to say so.
- **Honesty.** Two buttons that save different things should not look like one button.

So the rule is **one Save per write scope; a tab holds one scope unless the system genuinely has
more.** Only Progress does.

**4. Per-scope save also removes a whole class of bug.** Today every save re-sends all 22 fields,
including ones hidden by a flag and seeded from the row purely so they survive the round trip — a
pattern the dialog repeats in nine separate comments. A scope that shows five fields now sends five
fields, so it cannot overwrite something it never displayed.

**5. The weighted-steps write is pen-gated at the API, not in the UI** — and that fix **ships first,
on its own, unflagged**, as Milestone M0.

The question put to the product owner was "pen-gate the Steps panel in the editor, or leave it
role-only to match the API?" Both options were rejected, and rightly: each accepts a client and a
server that disagree about who may write. The client has required the pen for steps since the
surface existed; the server has never checked. So `assertHoldsPen` is added to
`activity-steps.service.ts`, after the existing 403/404 checks and before the business rules,
following the resource-assignment precedent verbatim (`resource-assignment.service.ts:111-115`,
TECH_DEBT #39). The route declares its 423 (`@ApiLockedResponse`), and a Supertest case joins the
existing ones in `plan-lock-write-gate.e2e-spec.ts`.

The justification is the same one that brought resource assignments under the gate, and it is
stronger here: **a steps `PUT` bumps the parent activity's `version`**. A write that increments an
activity's optimistic-lock version is an activity write by any reading, and every other activity
write asserts the pen.

**It is deliberately not behind `VITE_ACTIVITY_EDITOR_TABS`.** A `VITE_` flag is a client
build-time constant; it cannot gate a server check, and pretending otherwise would recreate the
divergence being removed. The gate rides `PLAN_EDIT_LOCK_ENFORCED` — the switch every other pen
assertion rides, and which still defaults to `false` (`config/env.validation.ts:51-54`), so the
assertion is inert until an operator turns enforcement on.

**It is also sequenced first and shipped separately**, because it is a defect fix on its own terms
rather than a consequence of this epic: if the tabbed editor were cancelled tomorrow, this should
still land. Nothing in M1–M6 depends on it, and it depends on nothing.

This is a deliberate departure from an otherwise frontend-only epic, and the departure is the
point — the alternative was to have the UI police a boundary the trust boundary itself does not
enforce.

**6. A scope a user cannot write is shaded with a stated reason, never hidden.** A leading reason
banner (before the fields in DOM order, so a screen-reader user meets the reason before the
controls), disabled fields, and a disabled Save carrying the same reason. The reasons are specific —
"Start editing to take the plan's edit lock", "Reporting progress doesn't include changing an
activity's definition", "Cost is visible to Planners and Org Admins", "Steps are driving this — the
rolled-up value (62%) is used." This is the RD-1 / ADR-0059 M6 precedent: a disabled control with no
reason reads as a bug, and a control whose effect lives elsewhere has to say so. It is also, in the
fourth case, the direct fix for the inert manual physical %.

**7. Steps do not drive the schedule**, and this decision does not change that. The
schedule/physical split is P6-faithful and Accepted (ADR-0042 §1, ADR-0044 §33); making steps move
dates would be a deliberate semantic departure needing its own ADR, ADR-0035 conformance scenarios
and a recalc-parity argument. The co-location makes the model _legible_, not different.

**8. Behind `VITE_ACTIVITY_EDITOR_TABS`, default off**, with flag-off parity suites pinning the
three superseded dialogs and every touched host screen. Those suites are the rollback contract and
are kept, not weakened, when they become inconvenient (ADR-0053 M6). The superseded dialogs are not
deleted at the flip; their retirement is a separate `TECH_DEBT.md` item with a stated condition.

**9. Everything except §5 is frontend-only.** No new endpoint, no DTO shape change, no migration, no
new permission, no engine change. The only contract movement in the whole epic is the 423 §5 adds to
the steps route. The CPM engine is not imported; no scheduling input is added or altered; the same
values go to the same endpoints in smaller bodies. **The ADR-0034 recalc parity gate is structurally
untouched** — there is nothing to compare because there is nothing new for `computeSchedule` to
receive.

**10. One editor, one intent, one gating function.** The three hosts (`ActivitiesTable`, the canvas
`SelectionActionsBar` via `activity-crud-dialogs.tsx`, the plan toolbar) collapse their three ids
into one `ActivityEditorIntent { activityId, tab, focus? }`, built by one helper and consumed by one
component; per-scope writability comes from one pure `deriveActivityEditorGating`, in the shape of
the existing `derivePlanGating`. Behaviour cannot drift between hosts because there is nothing left
to drift — which matters, because it already had.

## Alternatives considered

- **One merged form with an accordion.** Cheaper, no primitive. Rejected: an accordion with one
  submit re-creates the fused-gate problem exactly, and the fields-per-screen win disappears the
  moment two sections are open.
- **One Save for the whole tabbed dialog.** The literal reading of "just add tabs". Rejected on the
  Contributor regression, and on the two-phase-write hazard between the steps `PUT` and the activity
  `PATCH`.
- **Gate the steps write in the UI only** — either pen-gate the editor's Steps panel (matching what
  every web surface already does) or leave it role-only (matching the API). **Both rejected** in
  favour of §5. The first leaves the client policing a boundary the trust boundary does not enforce;
  the second would have the new editor offer a write the rest of the app has always withheld. Fixing
  the server is smaller than either and fixes the actual defect.
- **Feature-flag the steps pen-gate** behind `VITE_ACTIVITY_EDITOR_TABS`, so it arrives with the
  editor. Rejected as incoherent: a `VITE_` constant is compiled into the client and cannot gate a
  server-side check, so this would recreate the client/server divergence it exists to remove.
- **A wizard.** Fits create, not edit. Nobody wants five steps to change a duration.
- **A docked right-hand properties panel** instead of a modal, P6/MSP style. Genuinely attractive,
  and probably where this ends up. Rejected _for now_ as an ADR-0030 workspace-layout change: it
  touches the panel budget, the pen banner, the responsive single-pane rules and the canvas
  selection model. Out of proportion to fixing a dialog, and it would be built on the same scope
  split this ADR establishes, so nothing here is wasted.
- **Restructure all nineteen dialogs to one pattern.** Rejected on the counted evidence: the median
  dialog has three fields, where tabs add navigation cost for no benefit. `ActivityResourcesDialog`
  is 994 lines for a different reason — it is a list-manager plus an inline form with three
  mutations, a master/detail problem tabs do not touch — and gets its own spec.
- **No feature flag.** Rejected: this replaces the primary authoring surface for the app's central
  entity, and every comparable epic (0051–0056, 0059) shipped behind a flag with a parity suite as
  its rollback contract.
- **Adopt a component library for Tabs.** Rejected on the standing rule (CLAUDE.md §5): the UI
  primitives are hand-rolled on semantic HTML + the APG, and a dependency for one tablist is a
  liability with a long tail.

## Consequences

**Easier**

- Changing one thing about an activity means reading one section, not twenty-two fields.
- The progress model is legible in one place, labelled by what each measure _does_ — and the field
  that was silently ignored now says why.
- A save's blast radius equals what the user can see. Hidden-field round-tripping stops being a
  correctness concern.
- The two permission boundaries (progress vs. definition, role vs. pen) become visible in the
  interface instead of implicit in which dialog you happened to open.
- Adding the next ADR's field is "which tab?", not "where in the scroll?".
- The edit-lock has one fewer hole: when an operator enables `PLAN_EDIT_LOCK_ENFORCED`, the steps
  write is covered like every sibling write instead of being the exception nobody had noticed.

**Harder / costs**

- Three Save buttons on the Progress tab. Justified above, and mitigated by captioned panels, but it
  is more chrome than one button.
- **§5 is a user-visible contract change**: a steps `PUT` from a Planner who does not hold the pen
  now returns **423** where it used to succeed. It ships with a changeset (minor, pre-1.0). Two
  qualifications, both verified: the assertion is **inert while `PLAN_EDIT_LOCK_ENFORCED` is
  `false`**, which is the default, so a default deployment sees no change today; and no user loses a
  visible affordance, because every web path to that write already required the pen. The people this
  can bite are direct API consumers and any future non-web client.
- The epic can no longer describe itself as "no `apps/api` diff", which was a useful review
  heuristic. It is replaced by a sharper one: **only M0 touches the API, and its diff is API-only.**
- Two scopes now PATCH the same row from one open dialog, so **`version` must be read from the live
  row at submit time**. A scope that captured it at open would 409 on every second save. Likewise
  the seed effect must stay keyed on `open` + `activity.id`: widening it to react to the activity
  object would wipe another panel's unsaved edits on every save. Both traps carry dedicated
  regression tests.
- The dialog now stays open after a save (today two of the three close). A deliberate change —
  closing would strand the other tabs — but it is a change to muscle memory.
- Per-scope saves produce **one undo command per scope save** (ADR-0048) where the merged form
  produced one per dialog. A more honest history, and each inverse still rides the unchanged
  pen/RBAC/optimistic gates, but the granularity differs.
- `canReadCost` is derived client-side from role, because the DTO returns `null` for both "unset"
  and "not permitted". Sound today — `cost:read` and `activity:update` are granted to exactly the
  same roles — and recorded in `TECH_DEBT.md` in case they ever diverge.
- Three superseded dialogs stay in the tree until the flag is retired. That is the price of the
  rollback contract, not an oversight.

**Neutral / follow-ups**

- `ActivityResourcesDialog` keeps its own dialog and needs its own spec (master/detail).
- A `TECH_DEBT.md` entry with a stated condition for retiring the superseded dialogs.
- A `TECH_DEBT.md` entry for a gap found while checking §5's precedent: the resource-assignment
  routes **assert** the pen but do not **declare** `@ApiLockedResponse`, so their 423 is
  undocumented. Not fixed here — noticed here.
- The `ActivitiesTable` prop named `canWrite` is fed `canEditSchedule` by both call sites. The name
  is a trap that has now misled two documents; rename it during M5's convergence.
- The `Tabs` primitive has one consumer; if a second appears, extend it here rather than fork it.

## References

- Spec: [`docs/specs/activity-editor-restructure/`](../specs/activity-editor-restructure/feature-spec.md)
- ADR-0028 (the pen and the progress carve-out), ADR-0012/0016 (RBAC + tenancy),
  ADR-0042 (%-complete types & Earned Value), ADR-0044 §33 (weighted steps),
  ADR-0034 (recalc parity gate), ADR-0048 (undo command stack), ADR-0053 M6 / ADR-0059 M6
  (flag-off parity suites; shade-with-reason), ADR-0055 (surface scopes; no colour literals),
  ADR-0057 (match the standard, not a template), ADR-0058 (verify the claim, do not trust the
  document).
- Code read for this decision: `apps/web/src/features/activities/components/ActivityFormDialog.tsx`,
  `ActivityProgressDialog.tsx`, `ActivityStepsDialog.tsx`, `ActivitiesTable.tsx`;
  `apps/web/src/components/ui/{form,dialog,menu,combobox,segmented-control}.tsx`;
  `apps/web/src/components/layout/workspace/{activity-crud-dialogs,plan-dialogs,use-plan-workspace-model}.tsx`;
  `apps/web/src/features/plan-lock/lib/plan-gating.ts`;
  `apps/web/src/features/tsld/toolbar/selection-actions.tsx`;
  `apps/api/src/modules/activities/{activities.controller.ts,activities.service.ts,activity-steps.controller.ts,activity-steps.service.ts,dto/update-activity.dto.ts}`;
  `apps/api/src/modules/schedule/engine/earned-value.ts`;
  `apps/api/src/common/auth/org-permissions.ts`.
- Precedent for §5: `apps/api/src/modules/resources/resource-assignment.service.ts:111-115, 240-245,
350-353` (the same gate, same reasoning, TECH_DEBT #39);
  `apps/api/test/plan-lock-write-gate.e2e-spec.ts` (where its case goes — beside
  "gates resource-assignment create / update / delete on the pen" and
  "never gates the Contributor progress path, even without the pen");
  `apps/api/src/config/env.validation.ts:51-54` (`PLAN_EDIT_LOCK_ENFORCED` defaults to `false`);
  `apps/api/src/common/decorators/api-locked-response.decorator.ts`.
- Corrections folded in on 2026-07-28, both instances of the same failure mode (reading a name or an
  attribute and inferring behaviour): the `sr-only` legend "defect" that is not one, and the "two
  hosts disagree" claim contradicted by `plan-detail.tsx:351` and `activity-bottom-panel.tsx:84`.
