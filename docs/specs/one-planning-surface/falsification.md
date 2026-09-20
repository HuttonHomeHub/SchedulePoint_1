# Falsification conditions — one planning surface

**To be committed in its own commit, before any harness runs.** ADR-0128's ordering: a bar written
after the measurement is a bar chosen to be met. ADR-0142 D4 is the other half — **an approved
remedy is a claim that it will work, and approval does not make it one** — so the ghost overlay,
the remaining-float derivation and the baseline default are judged here rather than assumed.

**The assumption most likely to be wrong is that this epic is cheap on the canvas.** Seven
consecutive epics in this repository have had a width or cost expectation contradicted by their own
measurement, and every one was contradicted in the same direction. FC-5 is written so that a
contradiction **removes a feature** rather than moving a bar.

**Three predictions are written down to be falsified.** They are stated in the table under FC-1 and
FC-5. If any is wrong it is recorded as wrong, in place, rather than quietly replaced.

**One prediction is deliberately absent, and its absence is the honest half.** Nothing here
predicts how many of the 13 unpinned Playwright configs will fail on their first run with placement
live. There is no basis for a number: ADR-0092 records that one journey ever ran in Visual mode and
that it found a real defect the first time it did. FC-6 therefore measures rather than predicts, and
its bar is about triage discipline rather than a count.

---

#### FC-1 — the deployed estate decides the baseline migration, not an assumption

**Bar, three readings, taken through the ADR-0140 staff diagnostics panel on the deployed host
(never `psql` — see §4.11 of the spec):**

| Reading                                           | Prediction | What it decides                               |
| ------------------------------------------------- | ---------- | --------------------------------------------- |
| `plans.scheduling_mode = 'VISUAL'`                | **0**      | Whether any planner has ever chosen the mode. |
| `activities.visual_start IS NOT NULL`             | **0**      | Whether any bar in the estate is hand-placed. |
| baselines whose source plan carries any placement | **0**      | **The `date_basis` DEFAULT.**                 |

**Baseline:** unmeasured. Nothing in this repository has ever counted any of the three.

**Judged by:** the three registry entries added at M0-T1, read from the staff console, output
committed as `m0/estate-readings.md` with the date, the release and the row counts.

**What each outcome does, decided in advance so the result cannot be reinterpreted:**

- **All three zero** → `baselines.date_basis` ships `NOT NULL DEFAULT 'EARLY'`, on the
  `hours_per_day_minutes DEFAULT 1440` precedent: `'EARLY'` is then **true of every pre-existing
  row**, established by `baseline.repository.ts:207-208` being the only write path and carrying no
  branch. The migration is a formality and M-A is small.
- **Reading 3 non-zero** → the DEFAULT is **withdrawn**. `date_basis` becomes nullable with no
  default and NULL is a permanent sentinel meaning _the basis is unknown_, per ADR-0126's rule and
  `budgetedExpense`'s "0 is a claim". The comparison reports `NOT_ASSESSABLE` for those rows rather
  than a number.
- **Reading 2 non-zero, reading 3 zero** → the DEFAULT stands (no baseline is affected) **and** the
  release note in §4.5b gains a named population.

**Withdrawal clause:** none, and it cannot have one. This is a measurement whose two outcomes both
have a defined design; there is nothing here to withdraw.

**The trap this is written against:** taking reading 1 alone. A plan can be `VISUAL` with no
placements (behaviourally identical to `EARLY`, by `compute.visual.spec.ts:71-80`), and
`visual_start` is writable through the activity DTO **regardless of the plan's mode** — so the mode
column is the weaker of the two questions and answering only it would be a confident wrong answer.

---

#### FC-2 — Pass 1 is byte-identical, and the proof is that nothing had to be edited

**Bar, two clauses, both of which must hold:**

1. The ADR-0034 golden conformance suite passes with **zero** changes to any `early*`, `late*`,
   `totalFloat`, `freeFloat`, `isCritical` or `isNearCritical` value in any fixture.
2. `compute.visual.spec.ts`'s `pureFields` assertions (`:55-64`, `:82-96`) and the whole existing
   `compute.spec.ts` pass **unedited**.

**Baseline:** both suites green today.

**Judged by:** `scripts/e2e-local.sh api` plus the engine unit suites, at the end of M-D.

**Clause 2 is the load-bearing one and it is about the diff, not the result.** ADR-0140's M-B
acceptance condition is borrowed verbatim: _the assertions pass unedited, and editing one is the
signal that the milestone did more than it says._ A suite adjusted to accommodate a change has
stopped being an oracle for it.

**Withdrawal clause:** none. If Pass 1 moves, the change is wrong and is redone. There is no
version of this epic in which the CPM arithmetic changes.

---

#### FC-3 — the golden re-baseline is enumerated before it is taken

**Bar:** the snapshot re-baseline at M-D adds **exactly** `remainingFloatMinutes` and
`visualConflictReason` to every result row, and changes **nothing else** — no reordering, no
reformatting, no incidental field.

**Baseline:** the committed golden snapshots as of M-D's first commit.

**Judged by:** a written list of expected added lines, committed **before** the re-baseline is
taken, then diffed against the actual change line by line. **Never `vitest -u` followed by a read.**

This is ADR-0106's procedure, adopted because that epic's first re-baseline since ADR-0078 S1 was
audited against a written list and the list is what caught it being right. The failure mode being
guarded is not a wrong value — it is a **correct value beside a silent second change**, which a
`-u` run makes indistinguishable from the change you meant.

**Withdrawal clause:** none.

---

#### FC-4 — remaining float is right on a calendar where the naive version is wrong

**Bar:** on an **eight-hour** plan calendar, an activity with total float `T` minutes and drift `d`
minutes for which `round(T/f) − round(d/f) ≠ round((T−d)/f)`, the API reports
`round((T−d)/f)`.

**Baseline:** no such quantity exists today.

**Judged by:** an API e2e case with a fixture chosen so the two expressions **disagree**, verified
red against a client-side subtraction. A fixture where they agree passes against both
implementations and proves nothing — which is the shape ADR-0139 records, where the whole-day
branches of two formatters are factor-insensitive and a test written with a whole-day duration
passes identically against the defect and the fix.

**Why this is a condition and not a unit test:** finding C6 was derived by reading
`schedule.repository.ts:750-773`, not observed. If the arithmetic turns out never to diverge for a
reachable fixture, **that is a finding and is recorded** — the derivation moves server-side anyway
on the one-derivation argument (§4.3 reason 2), but this document should not claim a correctness
motive that no fixture can exhibit.

**Withdrawal clause:** if no reachable fixture makes the two disagree, FC-4's correctness clause is
**withdrawn in place** and §4.3's stated reason is narrowed to reasons 2 and 3. The design does not
change; the justification does.

---

#### FC-5 — the ghost layer does not spend the canvas's remaining headroom

**Bar, two limbs, both on the product owner's hardware through the ADR-0128 staff panel:**

1. **Week framing, 2,000 activities, both overlays on:** dropped frames ≤ **baseline + 2.00 pp**
   (ADR-0127 D8's bar), and the reported run-to-run spread is **inside** 2.00 pp — a baseline that
   moves by more than the bar cannot produce a verdict, and the honest answer is then
   `INDETERMINATE`, not a pass.
2. **Fit framing, 2,000 activities, both overlays on:** frames per second ≥ **30.0**, `docs/TECH_DEBT.md`
   §9's floor.

**Baseline:** `docs/TECH_DEBT.md` #75's 2026-09-10 readings — Week/2,000 at **60.0 fps, 0.00 pp
dropped**; Fit/2,000 at **32.2 fps**, re-measured across five sittings against a 0.4 fps noise floor.

**Prediction, written to be falsified:** limb 1 passes (Week culls 2,160 bars to ~267, so doubling
the drawn rects is ~267 extra hollow strokes) and **limb 2 fails** — Fit draws 1,792 bars against
32.2 fps with **2.2 fps of headroom**, and a second outline per bar is not obviously affordable
inside that.

**Judged by:** a `ghost-overlay` scenario added to the ADR-0128 probe registry, run in one sitting
with its spread reported, as ADR-0129 P3 was.

**Withdrawal clause — and it is the only one in this document that can remove a feature.** If limb
2 fails:

1. **First remedy, and it is free:** withhold ghosts below a pixel-width floor, the ADR-0141 pitch
   argument — a 1 px hollow outline beside a 1 px bar is not a picture, it is noise, so the ghost is
   not merely cheap to omit at Fit but **wrong to draw**. Re-measure.
2. **If that does not clear it:** the overlays are **withdrawn at framings below a measured
   `pxPerDay` floor**, and the toggle shades with a reason rather than disappearing (ADR-0082) —
   because a control that vanishes when you zoom out is indistinguishable from a bug.
3. **What is explicitly not available:** raising the bar, changing the framing, or reporting a
   figure from a headless container. ADR-0127 D8 records a container whose no-change baseline moved
   0.56 → 1.85 pp and 0.93 → 10.00 pp between two runs an hour apart, and that environment is
   disqualified for this question by name.

**Do not judge this at Fit alone.** `docs/TECH_DEBT.md` #260 records that a Fit baseline of 98.33 pp
leaves less headroom than the bar, so a dropped-frame delta at that framing is **arithmetically
incapable of failing** — which is why limb 2 is an fps bar and limb 1 is a pp bar, and why they are
at different framings.

---

#### FC-6 — the thirteen journeys are converted, not re-pinned

**Bar, three clauses:**

1. All **13** configs that pin `VITE_SCHEDULING_MODES: 'false'` today have the pin **removed**, and
   every one of those suites is green with placement live, **before** the milestone that deletes the
   flag opens.
2. **Zero** configs are re-pinned, and zero specs are skipped, to achieve clause 1.
3. Every spec that fails on its first unpinned run is **triaged and recorded** in `m-b/triage.md`,
   classified as (a) a product defect this epic must fix, (b) a test asserting a surface no shipped
   bundle produces, or (c) a fixture that needs a placement to exercise the same thing. Each gets a
   one-line reason. A count with no classification does not satisfy this clause.

**Baseline, derived rather than remembered:** `VITE_SCHEDULING_MODES` occurs **16 times across 15
files** under `apps/web/*.config.ts`. **13 are live pins.** The three that are not:
`playwright.library.config.ts:13` (prose beside its own pin at `:76`),
`playwright.gantt-editing.config.ts:17-23` (records pinning **nothing**, deliberately) and
`playwright.workspace-chrome.config.ts:8` (records leaving it **on**). The thirteen:
`interchange:65`, `loe:63`, `authoring-flow:75`, `library:76`, `wbs:77`, `resource-view:81`,
`search-nav:88`, `copy-paste:101`, `gantt:73`, `share:69`, `undo:61`, `authoring:62`,
`multi-select:94`.

**Judged by:** `scripts/e2e-sweep.sh` over the full suite list (which ADR-0112 records as **derived**
rather than hand-written, after it was found wrong in both directions), plus the committed triage.

**Why clause 2 exists.** ADR-0084's batch 1 retired three flags and CI found two were pinned off by
a whole Playwright config, stranding six editing specs; the recorded lesson is to convert the
harness **before** the flag goes. Clause 2 is that lesson made unwaivable, because the cheap way out
of a red suite at 2am is a pin, and a pin restores the condition the epic exists to delete while
leaving the suite green.

**Withdrawal clause:** none for clauses 1 and 2. For clause 3, a spec classified **(b)** may be
**deleted** rather than fixed — ADR-0088's finding that the base journey's editing specs proved a
behaviour "in a world no shipped bundle can produce" applies directly, and a test asserting the
Early-mode surface after Early is deleted is that finding exactly.

---

#### FC-7 — nothing moves on a plan that never had a placement

**Bar:** for a seeded plan with `visual_start` null on every activity, **every** user-visible date
is identical before and after the epic — canvas bars, Gantt grid cells, Gantt chart bars, the
framed span, the printed programme, the exported PNG, the CSV, the guest share view, and the
baseline variance figures.

**Baseline:** the same plan on the release preceding M-A.

**Judged by:** a before/after comparison over the seed catalogue (ADR-0066), taken at M-F, committed
as `m-f/no-placement-parity.md`.

**This is SC-3 and it is the migration's entire safety argument.** It is a product-level restatement
of `compute.visual.spec.ts:71-80`, and it is asserted at the **product** rather than at the engine
for the ADR-0066 reason: all 117 capability keys are proven at `computeSchedule` and none at the
application, and the two defects that motivated that ADR were green at the engine and wrong in the
product.

**Withdrawal clause:** none.

---

#### FC-8 — the ghost is legible, and it is legible without colour

**Bar, three clauses:**

1. The ghost's stroke clears **3:1** against the canvas ground in the **canvas surface scope**
   (ADR-0102), asserted by the existing contrast matrix with the new pair added **before** the CSS
   is written.
2. The ghost's token pair is present in `@theme inline` and resolves to a real value **in a
   browser**, asserted by the reachability limb ADR-0100 M4 added — not by the matrix alone.
3. Earliest and latest ghosts are distinguishable from each other, and from the placed bar, **with
   colour removed** (WCAG 1.4.1), asserted by a screenshot taken under a greyscale filter.

**Baseline:** no ghost token exists.

**Judged by:** `token-contrast.test.ts` (clauses 1–2) and a `shoot.mjs` entry (clause 3).

**Clause 2 is not redundant with clause 1 and the distinction has cost this repository twice.**
ADR-0100 M4 found a token pair never aliased in `@theme inline` painting **no colour at all** in a
real browser while the contrast gate stayed green, because the gate resolves `:root` names.
ADR-0121 found the sibling failure one layer along: `stackSeries` emitted `var(--chart-n)`, and
Canvas 2D's `fillStyle` setter **discards an unparseable value and keeps the previous colour**, with
no throw and no visual error state — so the stack would have painted as one solid block with every
unit test green. A canvas token must be a **resolved value**, and the resolution must happen against
the **canvas root**.

**Withdrawal clause:** none. A lens the reader cannot see is not a lens.
