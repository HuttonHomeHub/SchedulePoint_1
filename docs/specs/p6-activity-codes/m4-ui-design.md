# M4 UI design: swimlanes by a code

- **Spec:** [`./spec.md`](./spec.md) §2 (US-3, US-5, edge cases), §4.3, §4.5, §4.8 · **Plan:**
  [`./plan.md`](./plan.md) M4 (M4-T1..T3, the journey) · **Before it:** [`./m3-ui-design.md`](./m3-ui-design.md),
  [`./m2-record.md`](./m2-record.md) §4 (the baseline fallback that shipped) · **Schema:** owned by
  `database-design.md` and the separate `m4-database-review.md`; nothing here designs a table or a column.
- **Status:** Draft, 2026-10-30. Not a spec header (the `check:spec-status` gate reads only `spec.md`).
- **Author:** ui-architect (Claude Code), 2026-10-30, for James Ewbank (product owner)
- **Owner decisions taken as given (not reopened):** spec Q1–Q11 (Q1 as the shipped fallback: a baseline
  freezes the swimlane type's value and code lane only, `m2-record.md:90-97`); swimlane name = the value's
  description, else its short code; "No Area" last (spec `:140-141`, `:228`); the drag stops at the
  swimlane edge (Q7); guests see code swimlanes by name (Q6); deleting the source type is refused (Q3);
  M3's answers (values load on demand; Gantt code cells read-only).

Every `file:line` below was read on the working tree on 2026-10-30. CLAUDE.md §19.11 applies: the spec and
plan were written before M3 shipped, and §1 lists where they no longer match the code.

---

## 1. What the code says that the spec and plan do not

Each of these changes the design. None is an owner question.

- **F1. `projectSwimlanes` and `deriveDiagramSource` are in the web, not `@repo/layout`.** The brief and
  plan M4-T2 place them in the package. They are `apps/web/src/features/tsld/render/project-swimlanes.ts:81`
  and `apps/web/src/features/tsld/model/derive-diagram-source.ts` (ADR-0206 B2, B3). `@repo/layout` holds
  `deriveSwimlaneLanes` and the WBS walk `wbsBasisOf` (`packages/layout/src/index.ts:25-32`). What M4 adds
  to the package is the part the **API also needs** (§3.1): the guest read and the "values in use" count
  must agree with the web, so that rule is shared there.
- **F2. Every lane write under a code source would answer 500 today.** The server derives a lane's basis
  in `deriveLaneBasis`, and its `ACTIVITY_CODE` branch throws a plain `Error`
  (`apps/api/src/modules/activities/swimlane-lanes.ts:118-124`). The positions batch carries every
  in-swimlane lane the web writes: an in-swimlane drag, a keyboard nudge, auto-resolve
  (`use-plan-workspace-model.ts:720-731`), Tidy and Re-layout inside swimlanes (ADR-0206 A5), and the
  canvas create's follow-up lane write (`use-plan-workspace-model.ts:923-924`). So M4-T1 must route a
  positions-batch lane under `ACTIVITY_CODE` to `code_swimlane_lanes`, basis (source type, the activity's
  value). **No web lane writer changes**, which is the point: the basis stays server-derived (ADR-0206 A3).
- **F3. The web already holds every activity's codes; it does not hold their code lanes.** The workspace
  loads every activity (`use-activities.ts:224-234`) and the list carries `codes` for every type, live
  values only (`code-assignment.repository.ts:35-44`, the `deleted_at IS NULL` joins at `:39-40`). Code
  lanes are in no response: `ActivitySummary` carries `swimlaneLanes` (`packages/types/src/index.ts:704`),
  which is `activity_swimlane_lanes` only. So membership needs **no** new read on the member web, and
  lanes need one. §3.3 puts the lanes on the list and drops the plan's public membership route.
- **F4. The plan does not expose its source type.** `PlanSummary` has `swimlaneWbsLevel`
  (`packages/types/src/index.ts:465`) and no `swimlaneCodeTypeId`; neither does the plan response
  (`plan-response.dto.ts:123`, `:189`). The swimlane source write sends `swimlaneSource` and the WBS level
  only (`use-swimlane-mutations.ts:134-144`). M4-T1 adds the field to both.
- **F5. Under a code source the Swimlanes… command opens the manage dialog, and that dialog would offer the
  hand-made list for editing.** `setUp` is "source is `NONE` or the hand-made count is 0"
  (`use-swimlane-management.ts:155`); `count` exists only for `MANUAL` (`use-swimlane-scene.ts:121`), so a
  code source reads as set up. The manage dialog hides the hand-made list only when `followsWbs`
  (`SwimlaneManageDialog.tsx:110`, `:214`), and the gutter shades its rows only for WBS
  (`use-swimlane-management.ts:171-183`). Both become "not hand-made" checks (§4.4).
- **F6. The removed-work ghost path places nothing outside `MANUAL`.** `removedLane` returns `undefined`
  unless the scene is hand-made (`swimlane-ghosts.ts:75`), and the server attaches frozen facts only for a
  `FULL` swimlane snapshot (`schedule.service.ts:2341-2349`), with no code fields on the ghost
  (`packages/types/src/index.ts:3800-3822`). The baseline columns exist (`schema.prisma:2693-2708`) but
  reach no client (§7).
- **F7. Guests see swimlanes only from a hand-made source.** `liveSwimlanes` returns `[]` for anything but
  `MANUAL` (`share-guest.service.ts:179-189`), and ADR-0205 D3 says so for WBS. The web side is already
  source-neutral (`features/share/guest-api.ts:219-235`), so a code branch is a server change only (§8).
- **F8. The spec's naming rule has a length clause the shipped name rule does not.** Spec §2 says
  "description if `isSwimlaneName` accepts it (≤ 80), else the short code" (spec `:322`). M3 shipped
  `codeValueName` = description, else short code, with no length clause, "so a value reads the same in a
  cell, a history line and, from M4, a swimlane" (`features/codes/model/code-names.ts:5-12`). Under a live
  source a swimlane name is **never stored**, and the gutter wraps real text (ADR-0206 B5), so the length
  clause has no subject. This design uses `codeValueName` alone. (The clause belonged to the rejected
  "make hand-made swimlanes at import" option, spec §4.12 A.)
- **F9. "Apply" is not a button the dialogs have.** The setup dialog's submit is **Set up swimlanes**
  (`SwimlaneSetupDialog.tsx:228-232`) and the manage dialog's is **Use WBS groups** / **Make by hand**
  (`SwimlaneManageDialog.tsx:210`). Plan M4's entry point "▸ type ▸ Apply" maps to those (§4.3).
- **F10. The Gantt's Swimlane cell is editable under a hand-made source.** `swimlaneCellGate` shuts it only
  for WBS (`features/gantt/model/swimlane-cell.ts:23-32`). M3's default is "Gantt code cells read-only in
  v1". §6.2 keeps the Swimlane cell read-only under a code source, so the Gantt never writes a code.

---

## 2. The problem, restated

A plan can already be drawn in swimlanes made by hand or from its WBS (ADR-0206). M3 made codes visible
and editable. M4 adds the third source: **one swimlane per value of one code type in use, in value
order, then "No Area"**, live (a value change moves the bar), lossless to switch between types, with the
drag held at the swimlane edge, and seen by guests by name only. It must reuse the swimlane machinery
whole (projection, placement, gutter, listbox, minimap, export) and the M3 code write whole
(`useSetActivityCodes`, `planCodeAssignment`, the undo command), and hold at 1024 × 600.

---

## 3. Data: what the web reads, and the one shared rule

### 3.1 The shared rule in `@repo/layout` (new `packages/layout/src/code-swimlanes.ts`)

Three pure functions, used by the web scene **and** the API (the plan-update count of M4-T1, and the guest
read of §8), so the two can never disagree about which values are swimlanes:

- `codeBasisOf(codes, typeId, liveValueIds)` → the activity's value of that type if it is live, else
  `null` ("No Area"). The code twin of `wbsBasisOf`.
- `codeSwimlaneValues(values, members)` → the **values in use**, in the order given (the values list is
  `ORDER BY position, id`, `m3-ui-design.md` §3.2). A value is in use when at least one live activity
  that is **not a WBS summary** carries it. Summaries are excluded because they are never members of a code
  swimlane (spec edge cases, `spec.md:287`); counting them would offer a swimlane with nothing in it, and
  shade a type that would draw 100.
- `codeSwimlaneName(value)` → description, else short code. `codeValueName`
  (`features/codes/model/code-names.ts:10-12`) re-exports it, so there remains one rule (F8).

**The API's 1–100 "values in use" check (M4-T1) must count by the same rule**, summaries excluded. The
database design's count query does not exclude them (`database-design.md:743-748`); that is a note for
api-reviewer, not a schema change. An API e2e pins it: a value carried only by a summary does not count.

### 3.2 Membership: derived from the list the web already has

`codeSwimlaneInput(activities, type, values)` in `features/swimlanes/model/code-membership.ts`, beside
`manual-membership.ts` and in its shape (`manual-membership.ts:36-71`), including the one-slot identity
cache that makes the scene, Move to swimlane… and auto-resolve share one build (`:6-16`):

- `swimlanes` = `codeSwimlaneValues(...)` mapped to `{ id: value.id, name: codeSwimlaneName(value) }`.
- `membership` = `codeBasisOf(a.codes, type.id, live)` per activity. A WBS summary maps to `null`
  whatever it carries (spec `:287`): when the WBS band lifts it, it takes no lane at all
  (`project-swimlanes.ts:88-92`, `:99`); otherwise it is drawn in "No Area".
- `storedLanes` = the activity's code-lane row for `(type, membership)`, the `NULL`-value row for "No Area"
  (§3.3).
- `source: 'ACTIVITY_CODE'`, `codeTypeId`, and `noneName: 'No Area'` (§3.4).

`SwimlaneInput.source` widens from `'MANUAL' | 'WBS'` (`project-swimlanes.ts:42`) to include
`'ACTIVITY_CODE'`. The names come from the type's values query (`codeKeys.values`, one request of at most
1,000 rows, `m3-ui-design.md` §6.1), which the scene enables whenever the plan's source is a code,
**independent of whether swimlanes are shown**, as the hand-made list is (`use-swimlane-scene.ts:83-86`,
`:104-106`). It is the same query a shown code column or an opened picker uses, so it is often cached.

### 3.3 Code lanes travel with the activity list (a change to plan M4-T1)

**Recommended:** each activity in the list gains `codeSwimlaneLanes?: { codeTypeId, codeValueId | null,
laneIndex, updatedAt }[]`, **every row the activity holds, for every type**, and absent when the plan has
no live code type (SC-2, the rule `codes` already follows, `activities.service.ts:405-424`). This mirrors
`swimlaneLanes`, which carries every basis verbatim (`packages/types/src/index.ts:700-704`).

- **Why every type and not only the source type:** switching Area → Trade → Area then needs **no** fetch
  and paints no intermediate frame, exactly as MANUAL ↔ WBS does today (both read `swimlaneLanes` from the
  list). With source-type-only rows, a switch would have to refetch the whole activity list and the
  diagram would draw derived lanes, then jump. Rows exist only for types that have been a source and
  values the activity was placed in: "typically one to three per activity" (`database-design.md:425-426`).
  **M4-T1 measures** the list payload at 5,000 activities with three placed types and records it.
- **And no public membership route.** Plan M4-T1's `GET …/code-types/:id/membership` has no web reader
  under this design (membership is §3.2, from `codes`). The §9.2 membership query
  (`database-design.md:731-737`) is still built, as a **repository method** the guest read (§8) and the
  plan-update count call. A route with no reader is a contract, a cache key and an invalidation rule
  kept for nobody. api-reviewer confirms in M4-T1.

### 3.4 "No Area": one name, carried by the input

Today "No swimlane" is spelled once (`NO_SWIMLANE_LABEL`, `project-swimlanes.ts:45-50`) and read in nine
places: the gutter (`swimlane-gutter.ts:227`), the minimap (`minimap.ts:262`), the listbox groups
(`group-listbox.ts:52`, `:76`), the lane sentences (`swimlane-lanes.ts:130`, `:660`, `:695`), the Move
choices (`use-swimlane-assignment.ts:67`, `:113`), the editor field (`WbsSwimlaneField.tsx:33`) and the
auto-resolve sentence (`use-auto-resolve-overlaps.ts:279`).

- `SwimlaneInput` gains `noneName?: string`; `projectSwimlanes` writes it into the "none" extent's `name`
  (today always `null`, `project-swimlanes.ts:122`). Every `extent.name ?? NO_SWIMLANE_LABEL` site is then
  right with no edit. The three sites that spell the constant directly (`group-listbox.ts:52`,
  `swimlane-lanes.ts:660`, `:695`) read `input.noneName ?? NO_SWIMLANE_LABEL`.
- **The "none" extent is told apart by `id === null` only, never by `name === null`.** The minimap does the
  latter (`minimap.ts:262`) to lower-case the word mid-sentence; it moves to the id test and keeps the
  constant's lower-casing for `MANUAL`/`WBS` ("no swimlane") and the type's own name for codes ("No Area",
  a proper noun is not lower-cased).
- MANUAL and WBS pass no `noneName`, so their pictures are byte-identical (the parity suites hold).
- It sits **last**, and only when something is in it, which is the projection's existing rule
  (`project-swimlanes.ts:122`). The type's name comes from `codeKeys.types`, so a type rename relabels it
  with no write.

---

## 4. The source choice: Swimlanes… setup and manage

### 4.1 A third card in `SwimlaneSourceFields`

`SwimlaneSourceFields` (`SwimlaneSourceFields.tsx:31-100`) is the one set of fields both dialogs render,
so it is the one place to add the choice. `ChosenSource` stops excluding `ACTIVITY_CODE` (`:16`).

- **The card:** title "One per code value" while no type is chosen, then **"One per value of Area"** (the
  WBS card's pattern of naming the choice, `:67-70`). Description: "One for each value activities carry,
  named after it, in the order set in Codes…, then “No Area”. They follow the codes: setting an activity's
  Area moves it." Order of cards: By hand, WBS, code (the newest last; the default stays By hand,
  `SwimlaneSetupDialog.tsx:68`).
- **Shaded card** (`RadioCardGroup` `disabled` + `disabledReason`, `radio-card-group.tsx:33-35`; an
  `aria-disabled` radio the arrows still reach, ADR-0082, ADR-0204), with exactly one reason:
  - activities still loading: "The plan’s activities have not loaded yet." (the WBS card's own sentence,
    `SwimlaneSourceFields.tsx:76-77`);
  - the plan has no live code type: "This plan has no codes yet. Add them with Codes… in the Activities
    panel." (M3's sentence, `CodeAssignControl.tsx:27`, extended with where Codes… is);
  - types exist but **no type** is eligible: "No code has values in use that swimlanes can show. Set a code
    on some activities first, or see each code's reason below." The picker below still renders, so each
    type's own reason stays readable (a shaded card that hides the reasons would be a dead end, ADR-0204).
- **The type picker sits beside the group, not inside the card** (a control nested in a radio is not
  reachable as one, `SwimlaneSourceFields.tsx:27-29`), shown when the code card is chosen, as the WBS level
  select is (`:82-97`).

### 4.2 The type picker is the `Combobox`

Label **"Code"**. One option per **live** type in type order. A deleted type is never listed: it is not in
`useCodeTypes` (`values=none` list, live only by default, `m3-ui-design.md` §3.1), and the source type
cannot be deleted (Q3), so "a deleted type" reaches this picker only as a stale cache between a delete and
its refetch; the server's refusal (422) is then shown through `swimlaneErrorText`.

- **Why `Combobox`, not `SelectField`:** up to 100 types (`CODE_TYPE_LIMIT`), and some are **shaded with a
  reason**. A native `<option disabled>` drops out of the keyboard and carries no reason; the `Combobox`
  keeps a shaded option focusable, exposes `disabledReason` as its description and speaks it on Enter
  (`combobox.tsx:33-38`, `:66-75`, `:361-368`). Its in-flow, non-portalled listbox is built for a native
  `<dialog>` (`:39-41`). This is the first screen to use the disabled-option behaviour the owner chose to
  ship first (HANDOFF "Decided", 2026-10-16). No prop changes.
- **Each option:** `label` = the type name; `badge` = "4 values in use" (part of the accessible name,
  `combobox.tsx:58-63`), counted from the activity cache by §3.1's rule with no request.
- **Shaded, each with one reason:**
  - **no value in use:** "No activity carries an Area value yet. Set Area on some activities first."
  - **over 100 in use:** "Area has 140 values in use. Swimlanes can show up to 100." 100 is
    `SWIMLANE_LIMIT` (`apps/api/src/modules/swimlanes/dto/reorder-swimlanes.dto.ts:15`, spec `:152-153`);
    the web reads it from `@repo/types` (moved there with the M4-T1 check), not a second literal.
  - The per-type cap of **1,000 values** (`CODE_VALUE_LIMIT`) is never a reason here: only values **in use**
    count.
- **Preselection:** the first eligible type, so a planner who picks the card can press the button at once;
  none when nothing is eligible.
- **Prefetch on choose:** choosing a type enables that type's `codeKeys.values` query. By the time the
  source write lands, the names are cached and the diagram regroups in one frame (ADR-0202's "no
  swimlane-free frame", `use-swimlane-scene.ts:60-66`).
- **Hint under the picker:** "Activities with no Area, and WBS summaries, are in “No Area”." Summaries are
  named because a P6 file may give them codes (spec `:287`) and a planner would otherwise look for them in
  their value's swimlane.

### 4.3 What the buttons do

- **Setup dialog** (`SwimlaneSetupDialog.tsx:85-144`): a third branch beside the WBS one (`:88-105`), one
  write, `actions.switchSource(plan, { source: 'ACTIVITY_CODE', level: null, codeTypeId })`, then announce
  "Swimlanes set up: one per value of Area." and close. The submit label stays **Set up swimlanes**.
- **Manage dialog** (`SwimlaneManageDialog.tsx:119-132`): a third branch; the button reads **"Use Area"**
  (`:210`'s pattern: "Use WBS groups", "Make by hand"); the announcement is "Swimlanes now follow Area."
  `unchanged` (`:116`) also compares the type, so choosing the current type reads "Swimlanes already come
  from this." and shades the button with it (`:190-194`).
- **The write:** `useSetPlanSwimlaneSource` (`use-swimlane-mutations.ts:131-151`) sends
  `swimlaneCodeTypeId` with source `ACTIVITY_CODE` (F4). It still writes only the plan record and puts the
  answer in the plan cache (`:145-147`): **no lane is written and no activity is refetched**, because the
  lanes for every type are already on the list (§3.3). That is SC-4.
- **One undo step.** `SwimlaneBasisChoice` (`swimlane-commands.ts:223`) gains `codeTypeId`; the check reads
  `plan.swimlaneCodeTypeId` beside the source and level (`:266`); `choiceWords` (`:235-240`) gains "one per
  value of Area", with the type name captured when the step is recorded.
- **Switching away and back keeps each layout.** Lanes are per (type, value) (`database-design.md:415-419`)
  and the hand-made and WBS lanes are untouched by any code write, so Area → Trade → by hand → Area returns
  every picture as left, with no write.
- **The plan's own errors:** the server's 422 for an ineligible or deleted type and its 409 on a stale plan
  version go through `swimlaneErrorText` (`SwimlaneSetupDialog.tsx:100`) with the sentences above.

### 4.4 Manage dialog and gutter while a code leads

- **The hand-made list is hidden, not editable**, as under WBS (`SwimlaneManageDialog.tsx:214-220`, and the
  dialog's docblock reason at `:41-44`: editing a list nobody can see would change a picture that returns
  later). The paragraph reads: "Swimlanes follow Area: one for each value in use, in the order set in
  Codes…. Set an activity's Area to move it. The swimlanes you made by hand (3) are kept, and come back if
  you switch back."
- **The gutter's rename, move and delete are shaded** with `CODE_GUTTER_REASON`: "Swimlanes follow Area in
  this plan. Rename or reorder its values in Codes…, or choose Swimlanes… to make them another way." It
  lives in a new `code-swimlane-copy.ts` beside `wbs-swimlane-copy.ts:19-20`, and the gutter's corner
  Swimlanes… command is never shaded by it (that file's rule, `:13-18`).
- `followsWbs` (`use-swimlane-management.ts:171`) becomes `notHandMade = source !== 'MANUAL'`, and the
  lens's "set up" test (`use-tsld-toolbar-context.tsx:733-735`) lists `ACTIVITY_CODE` beside `WBS`.
  `swimlanesShown` (`use-tsld-canvas-ui-state.ts:211-213`) names `MANUAL`, `WBS` and `ACTIVITY_CODE`
  explicitly, as HANDOFF asks.

---

## 5. Writes under a code source

### 5.1 The drag stops at the swimlane edge (Q7)

- `laneRangeOf` opens the range only for `MANUAL` (today: everything but `WBS`, `swimlane-lanes.ts:249`).
  The backstop in `dropInSwimlane` (`:303-308`) refuses a cross-swimlane drop for any source but `MANUAL`.
- **The edge note is per source.** `WBS_EDGE_NOTE` (`swimlane-lanes.ts:260-261`) is announced by the panel
  (`TsldPanel.tsx:2827`, `:3025`). It becomes `edgeNoteFor(input)`; for a code: "This swimlane is made
  from Area, so the bar stays in it. Use Move to swimlane… or Set code… to change its Area. Press Alt+Down
  to add a lane in the swimlane." The type name comes from the input (`codeTypeName`, §3.2).
- **Within a swimlane** a drag, a nudge, auto-resolve, Tidy and Re-layout write lanes exactly as today,
  through the positions batch; the server stores them as code lanes (F2).

### 5.2 Move to swimlane… writes the code, one request, one undo step

- **A code-sourced `SwimlaneAssignment`** (`features/tsld/model/swimlane-assignment.ts:28-47`) from a new
  `useCodeSwimlaneAssignment` in `features/swimlanes/model/`, beside `useSwimlaneAssignment`
  (`use-swimlane-assignment.ts:35-141`). The selection bars, the table's bulk bar and the Swimlane column
  receive it through the existing slots, so **`MoveToSwimlaneControl` and its button are unchanged**
  (`MoveToSwimlaneControl.tsx:41-200`).
- **`choices` = the drawn swimlanes, then "No Area"**: the values in use, not all 1,000 live values. Move to
  swimlane… moves work between the bands on screen, which is what its name says; a value nobody uses yet
  is reached with **Set code…**, whose `CodeValuePicker` is a searchable `Combobox` over every value
  (`m3-ui-design.md` §7.1). This keeps the `SelectField` within its "up to 100 swimlanes" basis
  (`MoveToSwimlaneControl.tsx:28-30`). Owner question 2 is whether that split is right.
- **`assign(ids, target)`** plans exactly as the hand-made path does, against the projection the diagram
  draws (`use-swimlane-assignment.ts:86-104`): `assignToSwimlane(ctx, ids, target)` gives the movers'
  target lanes and the materialised neighbours (ADR-0206 A4). It then writes **one**
  `PATCH …/activities/codes` carrying (a) the source type's new value for each mover, built by
  `planCodeAssignment` (`code-assignment-plan.ts`, the M3 note at `m3-ui-design.md:425-426`), and (b) the
  lane of every placement, movers and neighbours alike. It goes through `useSetActivityCodes`
  (`use-set-activity-codes.ts:28-56`), so the undo step is the M3 `activityCodesCommand` and is one step.
  Label: "Move “Piling” to Level 2" / "Move 3 activities to Level 2" (the hand-made labels,
  `use-swimlane-assignment.ts:120-122`).
- **What M4-T1 must accept** (for api-reviewer and the database review, not designed here): lanes on the
  codes write, as a top-level list of `{ id, version, laneIndex }`, because a materialised neighbour changes
  no code and the row DTO requires at least one code (`update-activity-codes.dto.ts:61-66`). The basis of
  each lane is derived on the server from the plan's source and the activity's value **after** the write
  (ADR-0206 A3). One transaction, all or nothing.
- **Why not reuse `CodeAssignControl` as the Move control** (HANDOFF "Suggested next" suggested reuse):
  under a code source its type select has one right answer and its value picker offers values that are
  not swimlanes. The reuse is at the hook level, `useSetActivityCodes` and `planCodeAssignment`, which is
  where the write, the label and the undo step are assembled once.

### 5.3 Set code…, the table's Set <type> and the editor's Save codes, when the type is the source

These three already write through `useSetActivityCodes` (`use-set-activity-codes.ts:18-22`). When the type
they set is the plan's source type, the diagram must not move anything but the subjects, so **they send
lanes too**, planned the same way as §5.2.

- **The seam:** `features/codes` declares a `CodeSwimlaneLanePlanner` interface and a context
  (`model/code-swimlane-lanes.ts`): `(plan: CodeAssignmentPlan) => lanes | null`. `useSetActivityCodes`
  reads it and adds lanes when the planner returns some. The workspace host provides it, built by
  `features/swimlanes` from the same projection. So `features/codes` imports neither `features/swimlanes`
  nor `features/tsld`, and `features/tsld` gains no import (`docs/TECH_DEBT.md` #548 does not grow). A
  context rather than a prop because the editor section, the table bar and the two diagram bars are four
  call sites at different depths, and all four must get the same answer.
- **A type that is not the source** gets `null` and sends no lanes, exactly as M3 does.
- **The 2,000-row cap** (`CODE_ASSIGNMENT_LIMIT`, the route's `maxItems`) counts lane-only neighbour rows
  too; over it, the button is shaded with M3's sentence (`CodeAssignControl.tsx:28`).
- **Undo and redo** re-plan lanes at replay through the planner captured with the step, when the touched
  type is still the plan's source; otherwise they send codes only and the stored row for the old value
  (kept, `database-design.md:425-426`) puts the bar back. A unit test pins both.
- **The editor's Swimlane section becomes read-only under a code source**: "In Level 2. Swimlanes follow
  Area in this plan: change it under Codes above." (a `CodeSwimlaneField` in the
  `WbsSwimlaneField` shape, composed by the host at `activity-crud-dialogs.tsx:183-197`). Two controls on
  one tab writing the same fact, one saving at once and one holding unsaved working state, would leave the
  Codes section's version stale and its Save refused.

### 5.4 A bar drawn inside a code swimlane takes that value

Today a bar created in a hand-made swimlane carries its `swimlaneId`, and in a WBS swimlane its
`parentId` (`use-plan-workspace-model.ts:900-907`). Under a code source the create carries
`codes: [{ codeTypeId, codeValueId }]` for the swimlane it was drawn in, and nothing for "No Area". **This
needs the create DTO to accept `codes`** (M4-T1); the alternative, a create then a codes write, is two
requests and leaves a frame where the new bar sits in "No Area". The undo step stays the create's
(`:916-922`).

---

## 6. The grids

### 6.1 Activities table

The Swimlane column (`ActivitiesTable.tsx:946-971`) is display-only and reads the assignment's
`currentOf` and `choices`. `SwimlaneColumnSource` (`swimlane-assignment.ts:69-70`) gains
`{ source: 'ACTIVITY_CODE'; assignment }`, so the cell shows the value's name (`codeSwimlaneName`), or "—"
for "No Area", with no new code in the table. The bulk bar's Move to swimlane… uses the same assignment
(§5.2). No note above the table is needed (the WBS one, `:1266-1271`, explains a column that does not name
a swimlane; this one does).

### 6.2 Gantt

The Swimlane cell shows the value's name and is **read-only**, with the reason "Swimlanes follow Area in
this plan. Change it with Set code… or the editor's Codes." `swimlaneCellGate` and `swimlaneCellLabel`
(`swimlane-cell.ts:23-40`) gain the code branch beside WBS. Reason: M3 made every Gantt code cell
read-only (`m3-ui-design.md:9-12`), and the Swimlane cell under a code source **is** a code cell (F10).

---

## 7. Comparison ghosts of removed work (ADR-0126, ADR-0127)

What shipped is the fallback (`m2-record.md:90-97`): a baseline with `code_snapshot_level =
'SWIMLANE_TYPE'` froze, per captured activity, its value and code lane **for the type its swimlanes were
then made from** (`schema.prisma:2693-2708`).

- **Server (M4-T1):** a removed ghost from such a baseline gains `frozenCodeTypeId`, `frozenCodeValueId`
  (null: no value) and `frozenCodeLane` (`{ laneIndex }` or null: never placed), beside the existing
  `frozenSwimlaneId`/`frozenLanes` (`packages/types/src/index.ts:3800-3822`), loaded only when geometry is
  asked for, as today (`schedule.service.ts:2336-2349`).
- **Web:** `GhostLaneScene.source` (`swimlane-ghosts.ts:21`) gains `'ACTIVITY_CODE'` and the scene's type
  id. `removedLane` (`:74-87`) **draws** a removed ghost only when all of these hold: today's source is a
  code; its type is the frozen type; the frozen value (or "No Area") is a drawn swimlane today, by id; a
  lane was frozen; and that lane is inside the swimlane's rows today. Otherwise it is **counted**, by the
  existing count and sentence (`placeCompareGhosts`, `:54-72`). Never derived among today's members (`:47-50`).
- **So these are counted:** every baseline taken before M4 (`NONE`); a baseline frozen under by hand or the
  WBS, viewed under a code; a baseline frozen under Area, viewed under Trade (the cost `m2-record.md:95-97`
  names); work whose frozen value is deleted or no longer in use today.
- **Ghosts of live activities** are unchanged: they sit on the activity's display lane (`:44`).
- The first baseline of a code-sourced plan must succeed (plan M4 journey; the CHECK of
  `database-design.md` §6.1).

---

## 8. Guests (ADR-0205, spec Q6)

- **Server only** (F7): `guestSwimlaneList` and `guestSwimlanePlacement`
  (`apps/api/src/modules/share/guest-swimlanes.ts:33-64`) gain an `ACTIVITY_CODE` branch built on §3.1's
  shared functions and the §3.3 repository read: the list is the values in use as `{ id, name }`, in
  value order; each activity's `memberOfSwimlaneId` is its value's id if drawn, else `null`; its
  `swimlaneLaneIndex` is its code lane for that basis. The DTO shapes are unchanged (`guest-plan.dto.ts:118-196`,
  `guest-activity.dto.ts:109-122`).
- **Never sent:** the type id, a value's short code and description as fields, `codes`, the code lane rows
  or their timestamps, `swimlaneCodeTypeId`. A guest learns the band names and who is in each, which is
  ADR-0205's stated residual (`:77-78`). `guest-dto.spec.ts` gains the absence assertions.
- **"No Area" for guests:** the plan view gains one optional `noSwimlaneName` string, set only under a code
  source; the web passes it as `noneName` (`guest-api.ts:219-235`). The type's name is a band label like
  the values' names, and without it a guest's picture reads "No swimlane" where the planner's printed one
  reads "No Area". **security-reviewer decides** in M4-T3; the fallback is "No swimlane" for guests.
- **The guest web needs no other change**: membership is server-derived and the input is already
  source-neutral (`guest-api.ts:213-235`). Version skew is safe the ADR-0205 way: an absent field reads as
  today.
- **WBS stays as ADR-0205 D3 says** (a follow-on by the owner's choice, ADR-0205 `:80-85`); M4 does not
  change it.

---

## 9. When the source type's values change elsewhere

Every case below is a refetch of a query M3 already invalidates (`m3-ui-design.md` §6.2). None writes a lane.

- **A value is renamed** (here or by a colleague): `codeKeys.values` is invalidated (`m3-ui-design.md:344`);
  the gutter, listbox, minimap and Swimlane column follow with no write (US-3, `spec.md:231`).
- **Values are reordered:** the values list comes back in the new order and the swimlanes restack. Each
  activity keeps its in-swimlane lane (lanes are per value, not per position).
- **A value is added:** no swimlane until an activity carries it (`spec.md:232`).
- **A value is deleted** (allowed while in use, `database-design.md:665-668`): `activityKeys.listByPlan` is
  invalidated (`m3-ui-design.md:346`); its carriers read "no value" (the list omits deleted values,
  `code-assignment.repository.ts:39`) and move to "No Area", on their stored `NULL`-value row if they have
  one, else a derived lane, which the next write into "No Area" materialises (ADR-0206 A4). The swimlane
  leaves the stack. **Restoring the value** brings them back to their old lanes (rows kept,
  `database-design.md:425-426`).
- **The source type is renamed:** "No Area", the card title, the button and every sentence follow, from
  `codeKeys.types`.
- **Deleting the source type is refused** (Q3). In **Codes…**, its **Delete…** (`CodeTypePane.tsx:314-316`)
  is shaded up front with the owner's sentence, "The swimlanes are made from Area. Choose another swimlane
  source first." (spec Q3), as `aria-disabled` with that reason (ADR-0204), rather than letting the
  server refuse. The dialog learns the source type id from the plan cache through its host. The server's
  409 still maps to the same sentence for a stale client (`code-errors.ts:36`).
- **Values in use go past 100 after the source was chosen** (a Set code… on many rows, a restore): owner
  question 1. The design default is that the diagram **keeps drawing every value in use**; the limit
  governs choosing a source, as the spec words it (`spec.md:152-154`, `database-design.md:964-965`).
- **Values in use fall to none:** the diagram shows one swimlane, "No Area". The source is not switched
  for the planner.
- **A colleague switches the source:** the plan detail refetches, the scene rebuilds, and any open
  Move to swimlane… control rebuilds its choices from the new assignment.

---

## 10. States (ADR-0202)

- **First paint of a code-sourced plan:** the scene is `pending` until the type's values arrive, so the
  diagram holds its loading state once, as for the hand-made list (`use-swimlane-scene.ts:60-67`,
  `:119`). Membership needs nothing (§3.2).
- **The values fail to load:** `failed` (`:69`); the lens words it and the diagram draws swimlane-free, as
  today. The Swimlane column reads "Unavailable" with M3's one sentence (`m3-ui-design.md` §10).
- **The type picker while types load:** the `Combobox` `loading` row; the card is shaded only once the
  answer is known (no reason is claimed before it is true; the HANDOFF lesson of a false "no activities"
  count while loading, `HANDOFF.md:753-754`).
- **Errors on the source write:** the dialog's existing `role="alert"` paragraph
  (`SwimlaneSetupDialog.tsx:210-214`).

---

## 11. Accessibility, keyboard, the floor, and the suites

### 11.1 Primitives and ADR-0111

**No shared primitive's keyboard contract changes.** `RadioCardGroup` gains an option; `Combobox` gains a
consumer of its existing disabled-option behaviour; `Dialog`, `SelectField`, `MoveToSwimlaneControl` and
the gutter's roving toolbar are used as they are. The ADR-0111 rule is therefore **not triggered** by
this design. **accessibility-reviewer and component-reviewer still run on M4-T3 before release**, as plan
M4 schedules (`plan.md:345-346`), because the `Combobox` is new inside the setup dialog's native
`<dialog>` and focus moves in new ways when the card is chosen.

### 11.2 Keyboard and focus

1. Arrowing onto the code card selects it (radio semantics) and renders the picker after the group; focus
   stays on the radio. Tab reaches the picker next.
2. A shaded card is reachable by arrows and reads its reason (`radio-card-group.tsx:149-150`).
3. A shaded type is reachable by arrows, describes its reason, and Enter speaks it and keeps the list
   open (`combobox.tsx:361-368`).
4. Escape in an open type list closes the list first, then the dialog: the order the M3-T4 fix gave
   `usePopoverPanel` (HANDOFF `:743-745`). Here the host is a native `<dialog>`, not a popover, so the
   journey must press Escape once with the list open and assert the dialog is still open.
5. After the source write the dialog closes and focus returns to its opener (`use-swimlane-management.ts:142-153`,
   `:277-282`), unchanged.
6. The drag clamp is announced once with `edgeNoteFor` (§5.1). The keyboard's Alt+↑/↓ already stop at the
   swimlane top (`swimlaneTopOf`, `swimlane-lanes.ts:271-279`).
7. Every shaded control is `aria-disabled` with a reason, never native `disabled` (ADR-0204); Playwright's
   `toBeDisabled()` counts `aria-disabled`, so the journey asserts "no native `disabled`, takes focus"
   instead (HANDOFF `:738-739`).

### 11.3 1024 × 600 (ADR-0179)

The setup dialog is the default size (`SwimlaneSetupDialog.tsx:46-50`) and gains a third card and a
field. At 600 px high the dialog body scrolls (the M3 measurement: about 430 px between title and Close,
`m3-ui-design.md:590-595`). The open type list is absolutely positioned in flow and extends the body's
scroll; the panel that holds it is `relative`, so a screen-reader-only node cannot stretch the dialog
(the 963 px lesson, HANDOFF `:740-742`). The journey asserts, at 1024 × 600: every card, the picker, an
open list's last option and the submit are reachable by scrolling the body, and the dialog does not grow
past the viewport. No new size or token; no `font-medium|semibold|bold` outside `components/ui/` (the
`token-architecture.test.ts` cap, HANDOFF `:735-737`).

### 11.4 Which e2e suites assert what this changes

Grep of `apps/web/e2e*/` for the dialog's names and strings: only **`e2e-swimlanes`** mentions swimlanes
(`swimlanes-by-hand.spec.ts`, `swimlanes-by-wbs.spec.ts`, `codes.spec.ts`, `support.ts`).

- `swimlanes-by-wbs.spec.ts:108`, `:233`, `:247`, `:275` choose cards by `/One per WBS group/` and
  `/By hand/` regexes. "One per code value" / "One per value of Area" match neither, so these hold.
- `swimlanes-by-hand.spec.ts:417-464` and `swimlanes-by-wbs.spec.ts:106-111` press **Set up swimlanes**
  by exact name; unchanged.
- `support.ts:326-328` finds the lens command by `/^(Set up swimlanes|Swimlanes)…$/`; unchanged.
- `codes.spec.ts` deletes a type (step 7, `:231`) on `plan:capability-codes`, whose source is `NONE`
  (`support.ts:148-154`), so the new shading of the source type's Delete… does not reach it. Each test
  seeds a fresh organisation (`support.ts:163-189`), so an M4 case that switches that plan's source cannot
  leak into an M3 case.
- **Also run** `web:workspace-fit` (View ▾'s 420 px bound at the floor, HANDOFF `:213-217`): the lens and
  its command are unchanged, but the rule is to run every suite the area touches.

### 11.5 The journey (plan M4, `e2e-swimlanes/swimlanes-by-code.spec.ts`)

On `plan:capability-codes` (Area GF/L1/RF in use, L2 unused; Trade CIV/STR/MEP/ENV; Phase unused,
`apps/seed-cli/src/capabilities/codes.ts:11-13`, `:57-64`):

1. Swimlanes… setup ▸ the code card ▸ Code: **Phase** is shaded with "No activity carries a Phase value
   yet…"; choose **Area** ▸ Set up swimlanes. The gutter reads Ground floor, Level 1, Roof, then **No
   Area** (CD_7, CD_8). L2 has no swimlane.
2. Drag CD_3 down past Level 1's edge: it stops at the edge and the note is announced. Move CD_3 to a free
   lane inside Level 1.
3. Move to swimlane… on CD_8 ▸ Roof: one `PATCH …/activities/codes`, CD_8 reads Roof through the API, one
   Undo returns it.
4. Swimlanes… ▸ Trade ▸ Use Trade; then ▸ Area ▸ Use Area: CD_3 is on the lane it was moved to (SC-4), and
   no lane write was sent on either switch.
5. Take a baseline: it succeeds (the §6.1 CHECK).
6. 1024 × 600: §11.3's assertions; axe clean.

**The 101-values case** needs a type with 101 values in use, so 101 activities. `capability-codes` has
eight, and changing it would move M3's counts (`support.ts:148-154`). It is a **new seeded plan**
(`plan:capability-codes-wide`, its `docs/TEST_PLAYBOOK.md` row, `pnpm check:playbook`), within the suite's
raised rate limit of 300 per handler (`playwright.swimlanes.config.ts:65`; about 101 value creates and 101
activity creates). The shaded reason is also pinned at the component tier, so if the shard time
(ADR-0138) objects, the journey step can move there without losing the check.

---

## 12. Module structure

```text
packages/layout/src/code-swimlanes.ts              NEW  codeBasisOf, codeSwimlaneValues, codeSwimlaneName (§3.1)
packages/types/src/index.ts                             PlanSummary.swimlaneCodeTypeId; ActivitySummary.codeSwimlaneLanes;
                                                        ghost frozenCode*; SWIMLANE_LIMIT
apps/web/src/features/tsld/render/project-swimlanes.ts  SwimlaneInput: source + 'ACTIVITY_CODE', codeTypeId, codeTypeName, noneName
apps/web/src/features/tsld/render/swimlane-ghosts.ts    code branch of removedLane (§7)
apps/web/src/features/tsld/model/swimlane-lanes.ts      laneRangeOf / dropInSwimlane MANUAL-only; edgeNoteFor (§5.1)
apps/web/src/features/tsld/model/swimlane-assignment.ts SwimlaneColumnSource + ACTIVITY_CODE; code copy constants
apps/web/src/features/codes/model/code-swimlane-lanes.ts NEW  the planner interface + context (§5.3)
apps/web/src/features/codes/model/use-set-activity-codes.ts   reads the planner; lanes on the write
apps/web/src/features/codes/components/CodeTypePane.tsx       Delete… shaded for the source type (§9)
apps/web/src/features/swimlanes/model/code-membership.ts      NEW  codeSwimlaneInput (§3.2)
apps/web/src/features/swimlanes/model/use-code-swimlane-assignment.ts NEW (§5.2)
apps/web/src/features/swimlanes/model/code-source.ts          NEW  per-type eligibility + reasons (§4.2)
apps/web/src/features/swimlanes/model/code-swimlane-copy.ts   NEW  gutter, editor and grid sentences
apps/web/src/features/swimlanes/components/SwimlaneSourceFields.tsx  the third card + the Code combobox
apps/web/src/features/swimlanes/components/CodeSwimlaneField.tsx     NEW  the editor's read-only line (§5.3)
apps/web/src/features/swimlanes/{SwimlaneSetupDialog,SwimlaneManageDialog}.tsx  third branch (§4.3)
apps/web/src/features/swimlanes/model/{use-swimlane-scene,use-swimlane-management}.ts  code source
apps/web/src/features/undo-redo/swimlane-commands.ts    SwimlaneBasisChoice.codeTypeId
apps/web/src/features/gantt/model/swimlane-cell.ts      code branch, read-only (§6.2)
apps/web/src/components/layout/workspace/               host wiring: planner provider, assignment, auto-resolve input
```

**Dependency direction:** `features/swimlanes` → `features/codes` (public index only) and the existing
`features/tsld`, `features/wbs`. `features/codes` imports neither. `features/tsld` gains **no** import
(#548). **No new primitive**; no third copy of anything that would call for one (the code membership is
the third `SwimlaneInput` builder, and it is already shaped by the shared `SwimlaneInput` contract, so
there is nothing further to extract).

---

## 13. Trade-offs

- **Code lanes on the list (every type)** vs a membership route plus per-type lanes: a larger list for
  plans that have switched codes, against zero requests and zero intermediate frames on a switch, and one
  cache instead of two that can disagree for a refetch. Measured in M4-T1.
- **Move to swimlane… offers the drawn swimlanes only** vs every live value: keeps the native select and
  its basis; a never-used value is one control away (Set code…). Owner question 2.
- **Lanes on every code write of the source type, through a context** vs only on Move to swimlane…: without
  them, a Set Area… on the diagram re-derives neighbours and bars jump (ADR-0153's "only the bar that
  caused it moves"). The cost is one context and one planner.
- **Editor Swimlane line read-only under a code** vs a second live control: avoids a stale-version refusal
  inside one tab.
- **"No Area" through the input** vs keeping "No swimlane": follows the approved spec at the cost of nine
  read sites, three of them edited.
- **Risks:** the shared "values in use" rule drifts between web and API (pinned by one API e2e and a
  `@repo/layout` spec both sides import); the planner context is absent in a test host and lanes are
  silently omitted (a structural test: every `useSetActivityCodes` caller inside the workspace sits under
  the provider); the wide seeded plan lengthens the shard (measure in M4-T3).

---

## 14. Implementer checklist

- [ ] M4-T1 (server): `swimlaneCodeTypeId` on the plan response and update; `ACTIVITY_CODE` in
      `deriveLaneBasis` (F2); lanes on the codes write; `codes` on create; `codeSwimlaneLanes` on the list
      (measured); the shared count rule, summaries excluded; ghost `frozenCode*`; guest branch. api-reviewer,
      security-reviewer (guest, `noSwimlaneName`).
- [ ] `@repo/layout` `code-swimlanes.ts` with specs; the API and the web call the same functions.
- [ ] MANUAL and WBS pictures byte-identical: the ADR-0206 parity suites and `project-swimlanes` tests
      unchanged and green.
- [ ] No `features/tsld` import added; `features/codes` imports no feature.
- [ ] Every shaded control has one reason and no native `disabled`.
- [ ] `swimlane-copy.structural.test.ts` covers the new copy; no bare "Code" for a classification (spec §0).
- [ ] Undo: source switch with a type; Move to swimlane… and Set Area… under the source are one step each,
      with lanes at replay; `COVERAGE` entries.
- [ ] `pnpm prepush`; `scripts/e2e-local.sh api`; `scripts/e2e-local.sh web:swimlanes`, `web:workspace-fit`.
- [ ] accessibility-reviewer and component-reviewer on M4-T3 before release; ux-reviewer on the copy.
- [ ] `docs/DEPLOYMENT.md` rollback runbook lands with M4's PR (`plan.md:338-340`).
- [ ] The epic ADR (M7) records F2, F3/§3.3, F8, §3.4, §5.2's choice list and §5.4.

---

## Owner questions

1. **Once the diagram is grouped by a code, what if more than 100 of its values come into use?** (Choosing
   a code with over 100 values in use is already refused, as you decided.)
   _Recommended: keep drawing all of them._ The limit stops you choosing a code that would draw too many
   bands; it does not undo your choice later. _Alternatives:_ refuse any code change that would take it
   past 100 (the planner then cannot set a new Area value without first clearing another), or switch the
   diagram back to no swimlanes automatically (surprising, and it changes the picture for everyone).

2. **Under a code, should "Move to swimlane…" list only the swimlanes on screen, or every value of the
   code?**
   _Recommended: only the swimlanes on screen, plus “No Area”._ Moving into a value nobody uses yet is done
   with **Set code…**, which can search all of a code's values. _Alternative:_ list every value (up to
   1,000) in Move to swimlane…, which makes it a long list with no search.
