# Implementation Plan: Canvas axis markers — the date pills leave the scene

- **Feature spec:** [`./feature-spec.md`](./feature-spec.md)
- **Status:** Draft (pre-approved by the product owner; CQ-1/CQ-2 are settled by M0's measurement)
- **Owner:** unassigned
- **Register row:** `docs/TECH_DEBT.md` #148
- **Feature flag:** **none** — ADR-0088 D1 (a `VITE_` constant is inlined at build time and is not an
  operator rollback) plus the Class A shape (this replaces a surface rather than adding one, so a
  flag would mean two marker implementations). **Rollback is a commit boundary**, and the milestone
  order below is chosen so each is independently revertible.

## Breakdown

```mermaid
flowchart LR
  E[Epic: Canvas axis markers] --> M0[M0 Measure] --> M1[M1 Pure module] --> M2[M2 Persistent row] --> M3[M3 Transient row] --> M4[M4 Gates, docs, ADR]
```

### Epic

**Canvas axis markers** — the TSLD's date marks become axis markers in the ruler band, so no date
label ever covers an activity bar, at zero cost to the diagram's vertical budget. Closes
`docs/TECH_DEBT.md` #148. Maps to no roadmap theme: it is a defect on the primary surface.

---

## Milestone 0 — Measure before the design is fixed

**Outcome:** a numbers document that either confirms the two-row design or amends it, and answers
CQ-1 and CQ-2 with data.
**Ships dark:** nothing is reachable; no product code changes. The output is
`docs/specs/canvas-axis-markers/m0-measurements.md` plus a measurement harness.
**Journey:** n/a — a harness, not a capability. The harness's own docblock states where it bypasses
the product (ADR-0081 §3, after `measure-band-copy` made an unreachable milestone look finished).

> **Why this milestone exists and is not optional.** This repository has **six consecutive epics
> whose width or height expectation was contradicted by their own measurement** — ADR-0091 D4,
> ADR-0092 M4, ADR-0093, ADR-0094 M0-T1, ADR-0097 Landing C, ADR-0099 M0 (the first caught _before_
> building). The architect's pill widths (~39 / 61 / 101 px) are arithmetic on a character estimate
> and **have not been measured**. Every one of them is load-bearing: they set the overlap threshold,
> which decides CQ-1, which decides whether a planner ever sees the word `Today`.
>
> **The falsification condition is written before the harness runs.** If M0-T1 shows the widest
> persistent label exceeding **140 px**, or M0-T3 shows two 16 px rows unreadable in a 40 px band,
> the two-row shape is **withdrawn** and `ui-architect` is re-engaged. Recorded here so a milestone
> under pressure cannot quietly reinterpret its own gate.

---

#### Feature: The axis-marker measurement harness

> **Description:** A Playwright harness that measures label widths, overlap frequency, ruler
> occupancy and vertical stack at **1646** — the product owner's Surface Pro at 2880×1920 @ 175 %,
> and the width ADR-0091's retrospective established two epics had never used.
> **Complexity:** M
> **Dependencies:** none
> **Risks:** the harness measures a dev server left over from another suite → `reuseExistingServer`
> is true outside CI (ADR-0099's recorded three-false-diagnoses incident); `scripts/e2e-local.sh`
> already refuses to run while anything answers on 3000 or 5173 — use it, do not invoke Playwright
> directly. A harness that reports a verdict from an `undefined` (ADR-0097 Landing C) → **the
> harness throws when it has nothing to judge**, never returns a default.
> **Testing requirements:** the harness is the test. It must be run twice and agree.

##### Task M0-T1 — Real label widths at the ruler's own font

- **Description:** Measure, in Chromium, the rendered width of `Today`, `Data date`,
  `Data date · today`, and the **widest** cursor label the product can produce
  (`render/cursor-readout.ts` — the range form `2 Jan – 6 Jan · 5d` is wider than the point form),
  at the **ruler's** typography (`text-xs`, `TsldCanvas.tsx:1870`) **and** at the painter's
  `LABEL_FONT` (`geometry.ts:254`), because the two differ and the spec's rejected alternative
  turns on that difference.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** measuring a font the deployed image does not have → ADR-0097 recorded that **this
  product has never decided a typeface** (`globals.css:278` opens with `'Inter'` and there is no
  `@font-face` anywhere), so the measurement is of _whatever resolves on the runner_. **State that in
  the output** rather than presenting the number as the product's.
- **Testing:** n/a
- **Development steps:**
  1. Add `apps/web/e2e-measure-axis-markers/` + `playwright.measure-axis-markers.config.ts`,
     modelled on `playwright.measure-toolbar.config.ts`.
  2. Render each label string into a probe span inside the real ruler element, read `offsetWidth`.
  3. Report each width, the font actually resolved (`getComputedStyle(...).fontFamily`), and the
     spread across three runs.

##### Task M0-T2 — Overlap frequency per zoom preset (settles CQ-1)

- **Description:** For each preset (Day / Week / Month / Quarter / Year at 1646), compute the
  **day separation** at which `Data date` and `Today` markers first overlap, using M0-T1's measured
  widths and `pxPerDayForPreset(level, width)` (ADR-0056).
- **Complexity:** S
- **Dependencies:** M0-T1
- **Risks:** answering with arithmetic alone → also drive the real product with a plan whose data
  date is 0, 3, 7, 30 and 200 days from today and **observe** which case overlaps, because the
  arithmetic omits the clamp.
- **Testing:** n/a
- **Development steps:**
  1. Seed (or select from `docs/TEST_PLAYBOOK.md`) plans at each separation.
  2. Record, per preset, whether the two markers overlap.
  3. **Apply the CQ-1 escalation trigger:** if overlap holds at Week or finer, the default (withhold
     Today) is withdrawn in favour of the merged-with-offset marker, and the decision is recorded.

##### Task M0-T3 — Ruler occupancy, photographed (settles CQ-2 and fixes the row geometry)

- **Description:** Screenshot the ruler band at Day / Week / Month / Quarter / Year, with particular
  attention to the **sticky month and year labels pinned at x = 0** (`time-scale.ts:213`, `:216`) —
  the one ruler content a left-edge-clamped marker always hits, and the one that is not inferable
  from a neighbour.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** deciding row y from arithmetic → **the exact y of Row A and Row B is an output of this
  task**, not a spec constant. The spec's 4–20 / 22–38 proposal is a starting point that this task
  may move.
- **Testing:** n/a
- **Development steps:**
  1. Photograph the band at each preset, plus the `pxPerDay < 18` case where the day row empties.
  2. Overlay the two candidate marker rows and report what each occludes at each preset.
  3. Choose Row A and Row B y; if nothing separates them from the sticky labels, adopt the CQ-2
     fallback (extend `dropOverprintedSticky` to markers) and say so.

##### Task M0-T4 — `aboveCanvas` before, as the zero-delta baseline

- **Description:** Record `aboveCanvas` at 1646 with the ADR-0091 vertical-stack harness. Expected
  **135 px** (ADR-0099 M5).
- **Complexity:** S
- **Dependencies:** none
- **Risks:** the harness silently omitting a band → ADR-0091 M7 records it returning **five** bands
  for six because a lookup was `.filter()`ed rather than throwing, with every surviving number
  plausible. Confirm the band count is six before trusting the total.
- **Testing:** n/a
- **Development steps:** run it; record the number and the band breakdown; note any disagreement with
  135 as a finding in its own right.

##### Task M0-T5 — Before screenshots

- **Description:** `apps/web/scripts/shoot.mjs` for `plan-workspace` (`:340`),
  `plan-workspace-readonly` (`:345`) and `export-diagram` (`:424`), archived as the "before" set.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** the harness mints a tenant per run and paints its name into the header, so a byte
  comparison reports "everything changed" (ADR-0099 M2). Compare by **pixel diff over the diagram
  region**, not by hash.
- **Testing:** n/a

##### Task M0-T6 — Does the contrast matrix cover the marker fill?

- **Description:** Establish, by reading `styles/token-contrast.test.ts`, exactly which pairs the
  `canvas` scope asserts, and confirm the spec's §3 claim that the **marker fill against the ruler
  ground** is unasserted.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** concluding it is covered because a similar pair is → the `:250-257` sweep uses
  `--background`, and the ruler is `bg-canvas` (`TsldCanvas.tsx:1870`), i.e. `--canvas`. These are
  different tokens; `PLOT_GROUNDS` (`:288-293`) is the list that names `--canvas`, and the marker
  fills are not in it.
- **Testing:** the M2 gate lands the pair **before** the CSS/markup that needs it, verified red
  (the `--canvas-grid-month` precedent, `token-contrast.test.ts:260-273`).

##### Task M0-T7 — The cost of a DOM layout read per novel label

- **Description:** Measure the cost of `offsetWidth` on a ruler-resident span, cold and warm, and the
  frequency of novel labels during a 5-second pan+drag at the Day preset.
- **Complexity:** S
- **Dependencies:** M0-T1
- **Risks:** claiming a cost without running it — ADR-0076 Class 3, twice recorded.
- **Testing:** n/a

##### Task M0-T8 — Write the numbers document and the verdict

- **Description:** `m0-measurements.md`, ending in **PROCEED** (two-row design confirmed, CQ-1 and
  CQ-2 answered) or **AMEND** (falsification condition met; `ui-architect` re-engaged).
- **Complexity:** S
- **Dependencies:** M0-T1 … M0-T7
- **Risks:** the document restating the spec's estimates instead of the measurements → each number
  names the command or file that produced it (ADR-0076 / `docs/PROCESS.md` "Decision-bearing claims
  carry their evidence").
- **Testing:** n/a

---

## Milestone 1 — `render/axis-markers.ts`, the pure module

**Outcome:** one module owns cull → clamp → coincidence → overlap → row assignment. The painter
consumes it for the **lines**. **The picture does not change.**
**Ships dark:** nothing is reachable and nothing moves. The proof is that
`render/paint.golden.test.ts` stays **green, unmodified** through this milestone — that is the
acceptance condition, and it is the only milestone in the plan where the oracle is untouched.
**Journey:** none — no user-facing capability. M2 carries the first one.

---

#### Feature: The pure axis-marker model

> **Description:** Extract the decision that is currently split across a line branch and a pill block
> into one pure module, with no behaviour change.
> **Complexity:** M
> **Dependencies:** M0 verdict = PROCEED
> **Risks:** an "extraction" that changes the picture → the golden oracle is the before/after
> oracle, exactly as ADR-0078 designed it; it must not be modified in this milestone. A future
> reader mistaking this for two implementations → the module is the only home for `todayMerged`.
> **Testing requirements:** `axis-markers.test.ts` (new, covering cull/clamp/coincidence/overlap/row
> order and every edge case in spec §2); `paint.golden.test.ts` green unmodified;
> `paint.test.ts` green unmodified; `paint.data-date-budget.test.ts` green unmodified.

##### Task M1-T1 — Write `axis-markers.test.ts` first, against the intended API

- **Description:** The module's test lands before the module (the ADR-0100 M2-T1 discipline).
- **Complexity:** M
- **Dependencies:** M0
- **Risks:** asserting jsdom pixel-exact clamping → jsdom has no layout; **clamping against a
  measured DOM width is a browser question** and belongs in M2's gate. The unit suite asserts
  clamping against an _injected_ width.
- **Testing:** the suite is the deliverable.
- **Development steps:**
  1. Cases: cull off-screen left / right; both clamp to one edge at a narrow width (T2); cull runs
     before clamp (T3); coincident ⇒ one line + merged label, both directions (sub-pixel and exact,
     mirroring `paint.test.ts:596-636`); overlap-not-coincident ⇒ CQ-1's chosen rule; row y identical
     at `pxPerDay` 24 and 4 (T4).
  2. A **structural** case pinning the calm-band invariant: `axisMarkers`' signature takes no pointer
     argument (ADR-0089 D1's "the compiler is the enforcement", with the structural test as the
     weaker instrument on top, and its blind spot stated).

##### Task M1-T2 — Add the module; the painter consumes it for lines only

- **Description:** `render/axis-markers.ts`, returning `{ lines, marks }`. `paint.ts` layer 3.5
  strokes `lines`; the pill blocks are **unchanged** in this task and continue to read the same
  values, now sourced from the module.
- **Complexity:** M
- **Dependencies:** M1-T1
- **Risks:** importing the barrel and rebuilding the ADR-0078 §3a cycle → import `screenXOfDay` from
  `./geometry`; `geometry-is-a-leaf.structural.test.ts:43` already asserts this and must be extended
  to name the new module.
- **Testing:** the four suites above, all green **unmodified**. Verify red once by perturbing the
  coincidence threshold and confirming the golden oracle reddens.
- **Development steps:**
  1. Add the module + its barrel export.
  2. Rewire `paint.ts:1322-1404` to source `dataDateX`, `todayX` and `todayMerged` from it.
  3. Extend `geometry-is-a-leaf.structural.test.ts`'s module list.
  4. Run the full unit suite; account for **zero** golden-log lines changing.

---

## Milestone 2 — The persistent row: `Data date` and `Today` leave the scene

**Outcome:** no persistent date label covers a bar, for every role including a Viewer and an
External Guest.
**Entry point:** the plan workspace diagram itself — a planner opens any plan (Project Explorer →
a plan) and the `Data date` marker is in the ruler band, adjacent to its rule, with every bar in the
topmost lane legible. **This is a capability with a reachable surface, not a dark milestone.**
**Journey:** `apps/web/e2e-axis-markers/markers.spec.ts` — its own CI step — opens the plan
workspace against a real API, asserts **S1** (no marker rect intersects the scene canvas rect) at two
pan positions and two zoom presets, **as a Viewer as well as with the pen** (trap T1). Lands here,
with the first user-facing milestone, not at the end (ADR-0081 §2).

---

#### Feature: The DOM marker layer, persistent row

> **Description:** Two rows inside the existing ruler element; the persistent row rendered from
> `axisMarkers()`; the Today and Data date pill blocks deleted from `paintScene`.
> **Complexity:** L
> **Dependencies:** M1
> **Risks:** see traps T5, T6, T7, T8, T13, T14 in the spec — each has an acceptance criterion.
> The golden re-baseline is the largest single risk and has its own task.
> **Testing requirements:** unit (the row-inside-`RULER_HEIGHT` guard, the DOM sync's dirty rule);
> browser (S1); contrast (the new pair, verified red **before** the markup); export (S4).

##### Task M2-T1 — The contrast pair lands first, verified red

- **Description:** Add the marker-fill-against-ruler-ground pair to `token-contrast.test.ts`, in the
  `canvas` scope, at the WCAG 1.4.11 3:1 floor.
- **Complexity:** S
- **Dependencies:** M0-T6
- **Risks:** writing the value first and the gate after — the recorded cause of
  `--canvas-grid-month` shipping at 2.08:1 behind a green suite **and a paragraph saying it could
  not** (`token-contrast.test.ts:260-273`).
- **Testing:** the gate itself; verified red by temporarily binding the marker fill to a
  near-ground token.
- **Development steps:**
  1. Add the pair(s) — `--destructive` on `--canvas`, `--foreground` on `--canvas` — with a docblock
     saying **why** these are the right grounds now (the markers moved onto the ruler, whose ground
     is `--canvas` and not `--background`).
  2. If either fails, derive a value at the same hue (the ADR-0077 M7 precedent) rather than lowering
     the floor.

##### Task M2-T2 — The two rows and the DOM sync

- **Description:** Two absolutely-positioned rows inside `[data-testid="tsld-ruler"]`, at the y M0-T3
  chose; `syncAxisMarkers()` in the rAF loop reusing the `syncRulerRow` node-pool + `translateX`
  idiom (`TsldCanvas.tsx:614-637`).
- **Complexity:** M
- **Dependencies:** M2-T1
- **Risks:** inheriting `syncRuler`'s early-return (T6) → its own dirty rule, with its inputs named.
  A layout read in a pointer handler (T5) → the width memo is read only inside the frame. Two
  viewport reads (T7) → take the painter's snapshot. A flex line splitting free space (T14) → absolute
  positioning, no auto margins.
- **Testing:**
  - unit: both rows lie wholly inside `RULER_HEIGHT`, derived from the module's constants
    (replacement guard **(a)**), verified red against a row pushed to `RULER_HEIGHT - 4`;
  - unit: the marker container is a **descendant** of the ruler element, so it inherits
    `aria-hidden` (T8);
  - unit: the dirty rule fires on a `todayFraction` change with the viewport still (T6).
- **Development steps:**
  1. Add the rows to the ruler JSX and the refs + pools beside the existing three.
  2. Add `syncAxisMarkers()` and call it beside `syncRuler()` in the frame.
  3. Add the label-width memo (`createMeasureCache` shape), read only in the frame.

##### Task M2-T3 — Delete the two pill blocks from the painter, and re-baseline the oracle

- **Description:** Remove `paint.ts:1366-1381` (Today pill) and `:1389-1404` (Data date pill) and the
  constants `TODAY_CHIP_H`, `TODAY_CHIP_TOP`, `DATA_DATE_CHIP_TOP`. Re-baseline
  `paint.golden.test.ts` **deliberately**.
- **Complexity:** M
- **Dependencies:** M2-T2
- **Risks:** re-baselining with `-u`, which the oracle's own docblock names as the precise failure
  ADR-0034 warns about (`paint.golden.test.ts:30-34`) → the three-step procedure in spec §4.6, with
  every removed snapshot line accounted for against a written list. A structural assertion left
  unread → they are re-argued in the PR description, not just re-run. Note the oracle's recorded
  correction: the **edge** layer also writes `palette.selection` (ADR-0078 S1), so first-occurrence
  does not identify a layer.
- **Testing:**
  - `paint.golden.test.ts` re-baselined, then verified red by re-adding one pill draw;
  - `paint.data-date-budget.test.ts:173-174`: `measureText` delta **0**, `fillText` delta **0**;
    `:157-168`'s constant-delta assertions keep their shape with the smaller constant;
  - `paint.dates-budget.test.ts` and the other four counting-stub suites green.
- **Development steps:**
  1. Delete the blocks and constants; keep the rules.
  2. Re-baseline; read the diff line by line against the expected removals.
  3. Re-read and re-argue the structural assertions.
  4. Update `paint.data-date-budget.test.ts`, keeping its **purpose** sentence (the layer's cost is
     constant in the plan size) and changing only the constants.

##### Task M2-T4 — Migrate the pill assertions, each verified red in its new home

- **Description:** Move the label assertions out of `paint.test.ts:505-535` and `:548-685` into
  `axis-markers.test.ts` and the browser gate. `paint.test.ts` keeps everything about the **rules**.
  Delete guard `:679-684` and guard `:537-541` only after their reason is re-expressed.
- **Complexity:** M
- **Dependencies:** M2-T3
- **Risks:** claiming a case is "already covered" when it is not — ADR-0089 M6 records exactly that,
  caught only by spot-checking the claim. **Every migrated assertion is verified red against a stub
  before the original is deleted** (trap T11).
- **Testing:** the migrated suites, each verified red.
- **Development steps:**
  1. For each assertion in the two blocks, decide: rule (stays), model (moves to
     `axis-markers.test.ts`), geometry (moves to the browser gate). Write the decision down.
  2. Land the new homes; verify each red; then delete.
  3. Replace the two collision guards with pair **(a)** (M2-T2) and pair **(b)** (M2-T5), and record
     in the new docblock **the shape of the original failure**: both old guards asked whether the
     pills collided with each other, carefully and correctly, and nothing asked what was underneath.

##### Task M2-T5 — The flag-on journey and replacement guard (b)

- **Description:** `apps/web/e2e-axis-markers/` + `playwright.axis-markers.config.ts`, its own CI
  step and `scripts/e2e-local.sh` target.
- **Complexity:** M
- **Dependencies:** M2-T2
- **Risks:** a zero-width or `display:none` element having a zero-overhang rect and passing (T13) →
  the assertion filters to markers with a **non-zero** rect and asserts at least one is present, so a
  green run cannot mean "no markers exist" (the ADR-0093 second-assertion pattern). Locating a marker
  by its copy → locate by a stable `data-` attribute (the ADR-0091 M7 rule). A stale dev server
  adopted by `reuseExistingServer` → drive it through `scripts/e2e-local.sh`.
- **Testing:** the journey is the test.
- **Development steps:**
  1. Open the plan workspace against a real API; wait for a computed schedule.
  2. **Guard (b):** for every visible marker element, assert its `getBoundingClientRect()` does not
     intersect the scene canvas's. Assert **≥ 1** marker is visible, so the guard cannot pass
     vacuously.
  3. Repeat at a second pan position (drag the scene vertically by > 1 lane) and a second preset.
  4. Repeat **without the pen** (a Viewer session) — the persistent row must be present and correct.
  5. Add the CI step and the `e2e-local.sh` target; confirm the target maps (ADR-0096 records
     `web:<suite>` mapping to `test:e2e:<suite>` and the base journey being unreachable through it).

##### Task M2-T6 — Export parity, proved not asserted

- **Description:** Confirm S4 — the exported PNG is byte-identical.
- **Complexity:** S
- **Dependencies:** M2-T3
- **Risks:** asserting it from the reading in spec §1 → `apps/web/e2e-export/` decodes the **real**
  download; the unit export suites run in jsdom and take the resolver's fallbacks, so they
  structurally cannot reach the branch that ships (ADR-0103).
- **Testing:** `scripts/e2e-local.sh web:export` before and after, comparing the decoded PNGs.

---

## Milestone 3 — The transient row: the cursor readout

**Outcome:** the cursor date readout no longer covers a bar during the gesture it describes.
**Entry point:** a Planner or Org Admin takes the pen, arms a tool and drags — the readout appears in
the transient row above the persistent row.
**Journey:** extends `apps/web/e2e-axis-markers/markers.spec.ts` with a pen-held drag asserting S1
holds **while a gesture is in flight** (the one state M2's journey cannot reach).

---

#### Feature: The transient marker row

> **Description:** The cursor chip leaves `paintInteractionLayer`; the cursor **guideline** stays.
> **Complexity:** M
> **Dependencies:** M2
> **Risks:** the calm-band invariant broken by a shared input (§4.2) → the structural signature test
> from M1-T1 covers both directions. A DOM write per pointer move (T5) → M0-T7's number is the
> budget.
> **Testing requirements:** unit (the transient row empties on pointer-out); browser (S1 during a
> gesture); the golden oracle re-baselined a second time, for `paintInteractionLayer` only.

##### Task M3-T1 — Move the cursor chip; delete `CURSOR_CHIP_TOP` / `CURSOR_CHIP_H`

- **Description:** Remove `paint.ts:1863-1876`'s chip drawing and the two constants; render the
  readout in the transient row from the existing `cursorReadout()` output.
- **Complexity:** M
- **Dependencies:** M2
- **Risks:** the guideline going with the chip → the dashed full-height rule is a **scene** mark and
  stays; a unit case asserts the guideline still strokes with no chip drawn.
- **Testing:** the golden/interaction-layer suites re-baselined per §4.6's procedure;
  `paint.live-feedback.test.ts` re-read.

##### Task M3-T2 — Repair the stale pen-gate comment

- **Description:** `TsldCanvas.tsx:2016-2020` explains the `editing` gate on `cursorPointRef` by
  asserting _"the interaction canvas only exists while editing (`ictx` is null otherwise)"_. That
  stopped being true at `:836`, where `interactionLayerMounted = editing || CANVAS_MULTI_SELECT_ENABLED`.
  The gate is still correct; the reason is false.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** deleting the comment rather than correcting it → the correct reason is that the readout
  is a pen-scoped affordance, and a Viewer would otherwise pay a `getBoundingClientRect()` per raw
  pointer move for a marker they have no gesture to produce. Write that.
- **Testing:** n/a (comment), but the M2-T5 Viewer branch is what proves the behaviour.

##### Task M3-T3 — Journey: S1 holds mid-gesture

- **Description:** Extend the journey with a pen-held drag.
- **Complexity:** S
- **Dependencies:** M3-T1, M2-T5
- **Risks:** the assertion racing the debounced recalc → hold the ADR-0064 recalculation hold, or
  assert during the drag rather than after the drop.
- **Testing:** the journey.

---

## Milestone 4 — Gates, docs, the ADR, and the specialist pass

**Outcome:** the standard the next canvas mark must obey describes the system; the register is
correct; five specialists have read the combined diff.
**Entry point:** none — **ships dark** in the product sense; its output is documentation, gates and
folded review findings.
**Journey:** the M2/M3 journey is re-run as part of the pass; no new one.

---

#### Feature: The record

> **Description:** `DESIGN_SYSTEM.md`, `TECH_DEBT.md`, the ADR, `CLAUDE.md` §16, screenshots,
> changeset.
> **Complexity:** M
> **Dependencies:** M3
> **Risks:** an ADR written and never filed → ADR-0071 was cited by shipped code, two migrations and
> three other ADRs while absent from the register. **File it into `docs/adr/` in the same commit that
> accepts it**, and add it to `docs/adr/README.md` (ADR-0078 found seven ADRs missing from that
> index).
> **Testing requirements:** `pnpm check:doc-links`, `pnpm check:claims`, `pnpm check:counts`.

##### Task M4-T1 — Revise the marker-channel table

- **Description:** `docs/DESIGN_SYSTEM.md:712-738`. The table gains **placement** as a fourth
  property beside shape, weight and hue. The paragraph documenting `DATA_DATE_CHIP_TOP = TODAY_CHIP_TOP + TODAY_CHIP_H + 4`
  is rewritten — those constants no longer exist, and a standard naming a deleted constant is the
  drift class this repository gates against.
- **Complexity:** S
- **Dependencies:** M3
- **Risks:** correcting only the sentence that is obviously stale → re-read the whole §, including
  the coincidence rule, against the shipped code (`docs/RECONCILE.md`'s rule).
- **Testing:** `pnpm check:doc-links`.

##### Task M4-T2 — Close #148; file the two recorded findings

- **Description:** Close #148 with what was actually found, **including that its own table described
  one pan position and its title named the wrong two lanes**. File the export finding
  (`drawTitleBand` erases the pills; the export names them in the legend instead) with the ADR-0103
  family — #164/#166/#167 — rather than folding it in.
- **Complexity:** S
- **Dependencies:** M3
- **Risks:** rewriting the row to look like it was right → preserve the wrong version, as ADR-0075's
  suite docblock does, because a same-day failure of "verify the claim" is more instructive than a
  clean file.
- **Testing:** n/a

##### Task M4-T3 — Write, accept and file the ADR

- **Description:** Spec §4.11's outline, filled in with M0's measurements and the CQ-1/CQ-2
  decisions. **Claim the number at filing time**, not from this plan — ADR-0079 was filed as 0079
  rather than the 0078 its own plan named, because the number was taken in between.
- **Complexity:** M
- **Dependencies:** M0 (numbers), M3 (outcome)
- **Risks:** the ADR asserting the plan's estimates rather than the measurements → every
  decision-bearing claim names the command, file or test that established it.
- **Testing:** `pnpm check:doc-links`, `pnpm check:claims` if any dependency citation is added.

##### Task M4-T4 — After screenshots and the zero-delta assertion

- **Description:** Re-shoot `plan-workspace`, `plan-workspace-readonly`, `export-diagram`; re-run the
  vertical-stack harness and assert `aboveCanvas` is **135 px** — an **equality**, not a bound
  (S2, the ADR-0099 M4 shape).
- **Complexity:** S
- **Dependencies:** M3, M0-T4
- **Risks:** comparing by hash (ADR-0099 M2: the harness mints a tenant per run) → pixel-diff the
  diagram region.
- **Testing:** the harness.

##### Task M4-T5 — The specialist pass

- **Description:** Run the six agents named in spec §5 over the combined M1–M3 diff. Fold every
  blocking finding **with a regression test verified red first**; record the non-blocking ones in
  `docs/TECH_DEBT.md` rather than rushing them.
- **Complexity:** L
- **Dependencies:** M3
- **Risks:** treating the pass as a formality → seven consecutive epics in this register have had
  their gate pass find defects that had already passed a human read, and ADR-0099 M10's largest was
  a milestone's headline capability having **no entry point**. Expect findings.
- **Testing:** whatever the findings require.
- **Development steps:**
  1. `test-engineer` — the re-baseline, the replaced guards, the migration.
  2. `component-reviewer` — the deleted constants, the revised standard, the new module API.
  3. `accessibility-reviewer` — `aria-hidden` inheritance, no second announcement, 1.4.11 / 1.4.1.
  4. `ux-reviewer` — CQ-1's outcome, CQ-2's outcome, the calm band.
  5. `performance-reviewer` — the layout read, the per-frame DOM sync, the claimed painter saving.
  6. `devops-reviewer` — the two new Playwright configs and CI steps.

##### Task M4-T6 — Changeset and version impact

- **Description:** A `patch` changeset for `@repo/web` — user-visible, no contract change, no
  breaking change.
- **Complexity:** S
- **Dependencies:** M4-T5
- **Risks:** none.
- **Testing:** n/a

---

## Sequencing & slices

| Milestone | Ships                              | Releasable alone                                               | Revert cost                                             |
| --------- | ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| **M0**    | numbers + a harness                | yes (no product code)                                          | delete the harness                                      |
| **M1**    | the pure module; picture unchanged | yes                                                            | one commit; the oracle is untouched, which is the proof |
| **M2**    | persistent markers in the ruler    | **yes — this is the milestone that fixes #148 for every role** | one commit; the painter's pill blocks return            |
| **M3**    | the transient marker               | yes                                                            | one commit                                              |
| **M4**    | docs, ADR, gate pass               | yes                                                            | n/a                                                     |

M2 is the release that matters: it fixes the defect for the Viewer, the Contributor and the External
Guest, i.e. for everyone who cannot produce a cursor chip at all. M3 completes it for the pen-holder.
Splitting them this way means the larger audience is served first and each milestone has one thing to
review.

**`main` stays releasable at every boundary.** No milestone leaves a marker rendered in two places or
a decision computed in two places: M1 moves the decision, M2 moves the persistent labels with their
gate, M3 moves the transient label with its gate.

## Definition of Done (per task)

Each task's PR satisfies the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md).
Two are called out because this work makes them sharp:

- **"Tests" means the pre-push gate was run.** `pnpm lint && pnpm typecheck && pnpm test`, **plus**
  `scripts/e2e-local.sh web:axis-markers` for M2/M3, **plus** `scripts/e2e-local.sh web` (the base
  journey) for any milestone that changes the default screen — ADR-0096 records that mapping being
  broken and the base suite being the one thing the documented pre-push gate could not run.
- **After a label or layout change, run every journey**, not the one CI names. ADR-0091 M7 records
  three journeys breaking across one piece of work, each found by CI rather than by the author,
  because only the named suite was re-run.

## Risks & assumptions (rollup)

| Risk / assumption                                                    | Likelihood                          | Impact   | Mitigation                                                                                                                                      |
| -------------------------------------------------------------------- | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| The 40 px band cannot hold two legible rows                          | med                                 | high     | M0's falsification condition, written before the harness runs; AMEND re-engages `ui-architect`.                                                 |
| CQ-1's default withholds `Today` almost always on live plans         | **high**                            | med      | M0-T2's measured escalation trigger; option (b), the merged marker with an offset, is costed and ready.                                         |
| Markers occlude the sticky month/year label (CQ-2)                   | med                                 | med      | Row y is an M0-T3 output; fallback is `dropOverprintedSticky` extended to markers — one rule for the class, in the file that already owns it.   |
| The golden re-baseline hides a real change                           | low                                 | **high** | Every removed line accounted for against a written list; structural assertions re-argued; verified red after.                                   |
| A migrated assertion is claimed covered and is not                   | med                                 | high     | Verified red in its new home before the original is deleted (ADR-0089 M6).                                                                      |
| A layout read per pointer move costs a frame                         | low                                 | med      | Memo keyed by label string; read only in the rAF frame; M0-T7 measures it.                                                                      |
| The fix is verified only with the pen                                | med                                 | high     | The journey runs a Viewer branch; the cursor chip is pen-gated at `TsldCanvas.tsx:2021`.                                                        |
| A width expectation contradicted by its own measurement              | **high** (six for six historically) | med      | That is what M0 is; it is the first milestone and it can say AMEND.                                                                             |
| Contrast regression on the ruler ground                              | med                                 | med      | M2-T1 lands the pair before the markup, verified red.                                                                                           |
| The export changes                                                   | low                                 | high     | S4 decodes the real download; the pills were already erased by an opaque band.                                                                  |
| The ADR is written and never filed                                   | med                                 | med      | M4-T3 files into `docs/adr/` **and** `docs/adr/README.md` in the accepting commit (ADR-0071, ADR-0078).                                         |
| **Assumption:** the CPM engine is not imported and no migration runs | —                                   | —        | Established by reading `render/`, `components/TsldCanvas.tsx` and the change surface; there is nothing here to hold recalculation parity _for_. |
