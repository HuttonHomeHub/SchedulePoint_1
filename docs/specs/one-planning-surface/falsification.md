# Falsification conditions — one planning surface

**To be committed in its own commit, before any harness runs.** ADR-0128's ordering: a bar written
after the measurement is a bar chosen to be met. ADR-0142 D4 is the other half — **an approved
remedy is a claim that it will work, and approval does not make it one** — which now applies to
three product-owner answers as well as to my own proposals.

**Revised 2026-09-20** after CQ-3 through CQ-7 were answered, three against the stated defaults.
**FC-5 and FC-8 are re-derived rather than amended** (the overlay model went from two members to
three, and the third has no renderer today); **FC-7 is narrowed** (the constraint strip changes
Pass 1 downstream, so "nothing moves" cannot cover the stripped population); **FC-9 and FC-10 are
new**, one per answer that created a new blast radius.

**The assumption most likely to be wrong is still that this epic is cheap on the canvas, and the
answer to CQ-4 made it less likely to hold, not more.** Seven consecutive epics here have had a
width or cost expectation contradicted by their own measurement, every one in the same direction.
FC-5 is written so a contradiction **removes a feature** rather than moving a bar.

**Four predictions are written down to be falsified** — in FC-1, FC-5 and FC-10. If any is wrong it
is recorded as wrong, in place.

**One prediction is deliberately absent, and its absence is the honest half.** Nothing here predicts
how many of the 13 unpinned Playwright configs fail on their first run with placement live. There is
no basis for a number: ADR-0092 records that one journey ever ran in Visual mode and that it found a
real defect the first time it did. FC-6 measures rather than predicts.

---

#### FC-1 — the deployed estate decides the baseline migration

**Bar, three readings, through the ADR-0140 staff diagnostics panel on the deployed host** (never
`psql` — spec §4.11):

| Reading                                           | Prediction | What it decides                               |
| ------------------------------------------------- | ---------- | --------------------------------------------- |
| plans with `scheduling_mode = 'VISUAL'`           | **0**      | Whether any planner ever chose the mode.      |
| activities with `visual_start IS NOT NULL`        | **0**      | Whether any bar in the estate is hand-placed. |
| baselines whose source plan carries any placement | **0**      | **The `date_basis` DEFAULT.**                 |

**Baseline:** unmeasured. Nothing in this repository has counted any of the three.

**Judged by:** three registry entries added at M0-T1, read from the staff console, committed as
`m0/estate-readings.md` with the date, the release and the counts.

**Decided in advance, so the result cannot be reinterpreted:**

- **All three zero** → `baselines.date_basis` ships `NOT NULL DEFAULT 'EARLY'`, on the
  `hours_per_day_minutes DEFAULT 1440` precedent: `'EARLY'` is then **true of every pre-existing
  row**, established by `baseline.repository.ts:207-208` being the only write path and carrying no
  branch on the mode.
- **Reading 3 non-zero** → the DEFAULT is **withdrawn**; `date_basis` is nullable with no default
  and NULL is a permanent sentinel (ADR-0126; `budgetedExpense`'s "0 is a claim"). The comparison
  reports `NOT_ASSESSABLE` rather than a number.
- **Reading 2 non-zero, reading 3 zero** → the DEFAULT stands **and** §4.5's release note gains a
  named population.

**Withdrawal clause:** none, and it cannot have one — both outcomes have a designed response.

**The trap this is written against:** taking reading 1 alone. A plan can be `VISUAL` with no
placements (identical to `EARLY`), **and `visualStart` is accepted regardless of the plan's mode** —
`activities.service.ts:388` and `:526-528` carry no mode check (verified). So reading 2 is the
stronger question and answering only reading 1 would be a confident wrong answer.

---

#### FC-2 — Pass 1 is byte-identical, and the proof is that nothing had to be edited

**Bar, two clauses:**

1. The ADR-0034 golden conformance suite passes with **zero** changes to any `early*`, `late*`,
   `totalFloat`, `freeFloat`, `isCritical` or `isNearCritical` value in any fixture.
2. `compute.visual.spec.ts`'s `pureFields` assertions (`:55-64`, `:82-96`) and the whole existing
   `compute.spec.ts` pass **unedited**.

**Baseline:** both green today.

**Judged by:** `scripts/e2e-local.sh api` plus the engine unit suites, at the end of M-D.

**Clause 2 is load-bearing and it is about the diff, not the result.** ADR-0140's acceptance
condition, borrowed: _the assertions pass unedited, and editing one is the signal that the milestone
did more than it says._ A suite adjusted to accommodate a change has stopped being an oracle for it.

**This condition does NOT cover the constraint strip.** Stripping an `SNET` changes that plan's Pass
1 legitimately (spec §4.5) — the fixtures here carry no stripped constraint, and FC-10 is where that
population is judged. Conflating the two would make FC-2 unpassable for a correct implementation.

**Withdrawal clause:** none. There is no version of this epic in which the CPM arithmetic changes
for an unmodified network.

---

#### FC-3 — the golden re-baseline is enumerated before it is taken

**Bar:** the M-D re-baseline adds **exactly** `remainingFloatMinutes` and `visualConflictReason` to
every result row and changes **nothing else** — no reordering, no reformatting, no incidental field.

**Baseline:** the committed snapshots as of M-D's first commit.

**Judged by:** a written list of expected added lines, committed **before** the re-baseline is taken,
then diffed line by line. **Never `vitest -u` followed by a read.**

ADR-0106's procedure. The failure guarded is not a wrong value — it is a **correct value beside a
silent second change**, which `-u` makes indistinguishable from the change you meant.

**Withdrawal clause:** none.

---

#### FC-4 — remaining float is right where the naive version is wrong

**Bar:** on an **eight-hour** plan calendar, for an activity where
`round(T/f) − round(d/f) ≠ round((T−d)/f)`, the API reports `round((T−d)/f)`.

**Baseline:** no such quantity exists today.

**Judged by:** an API e2e case whose fixture makes the two expressions **disagree**, verified red
against a client-side subtraction. A fixture where they agree passes against both implementations
and proves nothing — the ADR-0139 shape, where two formatters' whole-day branches are
factor-insensitive and a whole-day fixture passes identically against the defect and the fix.

**Withdrawal clause:** if no reachable fixture makes them disagree, FC-4's **correctness** clause is
withdrawn in place and spec §4.3's justification narrows to reasons 2 and 3 (one derivation; the
engine already owns both inputs). The design does not change; the stated motive does.

---

#### FC-5 — three ghost kinds do not spend the canvas's remaining headroom

**Re-derived for CQ-4's answer. The original condition was written for two overlays; the model has
three, and the third is drawn for every activity when levelling has run.**

**Bar, two limbs, on the product owner's hardware through the ADR-0128 panel, with **all three**
overlays on:**

1. **Week framing, 2,000 activities:** dropped frames ≤ **baseline + 2.00 pp** (ADR-0127 D8's bar),
   **and** the reported run-to-run spread is **inside** 2.00 pp. A baseline that moves by more than
   the bar cannot produce a verdict, and the honest answer is `INDETERMINATE`, not a pass.
2. **Fit framing, 2,000 activities:** ≥ **30.0 fps**, `docs/TECH_DEBT.md` §9's floor.

**Baseline:** #75's 2026-09-10 readings — Week/2,000 at **60.0 fps, 0.00 pp**; Fit/2,000 at
**32.2 fps**, re-measured across five sittings against a **0.4 fps** noise floor.

**Prediction, written to be falsified:** limb 1 passes (Week culls 2,160 bars to ~267, so three
overlays add ~800 hollow strokes); **limb 2 fails**, and **more surely than it would have with two**
— Fit draws 1,792 bars with **2.2 fps of headroom**, and three outlines per bar is roughly 5,400
extra strokes.

**A scene must be measured in which the levelled overlay is non-empty.** `levelResources` is
opt-in and off by default, so the naive fixture draws **two** ghosts and reports a number for a
model the product does not have. The probe's fixture sets `levelResources` and its non-vacuity
control asserts a non-zero count of levelled ghosts drawn while it was measured — ADR-0129 P3's
rule (37 of 264 bars), and the ADR-0066 finding that a draw benchmark once measured the cull rather
than the painter.

**Judged by:** a `ghost-overlay` scenario in the ADR-0128 probe registry, one sitting, spread
reported.

**Withdrawal ladder — the only one here that can remove a feature:**

1. **Withhold ghosts below a pixel-width floor** (ADR-0141's pitch argument): a 1 px hollow outline
   beside a 1 px bar is not a picture, so the ghost is not merely cheap to omit at Fit but **wrong
   to draw**. Re-measure.
2. **Cap the number of simultaneously-drawn overlays** below a measured `pxPerDay` floor, shading
   the excess toggles with a reason (ADR-0082) rather than letting them silently do nothing.
3. **Withdraw the overlays entirely below that floor**, toggles shaded with a reason — a control
   that vanishes when you zoom out is indistinguishable from a bug.
4. **Not available:** raising the bar, changing the framing, dropping the levelled member to make
   the number fit, or reporting from a headless container (ADR-0127 D8 disqualified that
   environment by name after its no-change baseline moved 0.93 → 10.00 pp in an hour).

**Do not judge at Fit alone.** #260 records a Fit baseline of 98.33 pp leaving less headroom than
the bar, so a pp delta there is **arithmetically incapable of failing** — which is why limb 2 is an
fps bar at a different framing.

---

#### FC-6 — the thirteen journeys are converted, not re-pinned

**Bar, three clauses:**

1. All **13** configs pinning `VITE_SCHEDULING_MODES: 'false'` have the pin **removed**, and every
   one of those suites is green with placement live, **before** the milestone that deletes the flag
   opens.
2. **Zero** configs are re-pinned and **zero** specs are skipped to achieve clause 1.
3. Every spec failing its first unpinned run is **triaged and recorded** in `m-b/triage.md` as
   (a) a product defect this epic must fix, (b) a test asserting a surface no shipped bundle
   produces, or (c) a fixture needing a placement. Each gets a one-line reason. **A count with no
   classification does not satisfy this clause.**

**Baseline, derived rather than remembered:** 16 occurrences across 15 files under
`apps/web/*.config.ts`; **13 are live pins**. The three that are not: `library:13` (prose beside its
own pin at `:76`), `gantt-editing:17-23` (records pinning **nothing**, deliberately),
`workspace-chrome:8` (records leaving it **on**). The thirteen: `interchange:65`, `loe:63`,
`authoring-flow:75`, `library:76`, `wbs:77`, `resource-view:81`, `search-nav:88`, `copy-paste:101`,
`gantt:73`, `share:69`, `undo:61`, `authoring:62`, `multi-select:94`.

**Judged by:** `scripts/e2e-sweep.sh` over the **derived** suite list — ADR-0112 found that list
wrong in both directions (naming a deleted suite, omitting seven), which is why it is derived and
why a hand-typed subset is not evidence here — plus the committed triage.

**Why clause 2 exists.** ADR-0084's batch 1 retired three flags; CI found two were pinned off by a
whole Playwright config and six editing specs stranded. The cheap way out of a red suite is a pin,
and a pin restores the condition the epic exists to delete while leaving the suite green.

**Withdrawal clause:** none for clauses 1–2. A spec classified **(b)** may be **deleted** rather than
fixed — ADR-0088's finding that the base journey proved a behaviour "in a world no shipped bundle can
produce" is that case exactly.

---

#### FC-7 — nothing moves on a plan that never had a placement **and had no constraint stripped**

**Narrowed, deliberately, by CQ-7's answer.** The original bar said "a plan with `visual_start` null
on every activity". That is no longer sufficient: the strip changes Pass 1 downstream (spec §4.5), so
a plan with no placement but with stripped constraints legitimately reports different float. Leaving
the wider bar would make this condition unpassable for a correct implementation — and the temptation
would then be to reinterpret it, which is what conditions exist to prevent.

**Bar:** for a seeded plan with `visual_start` null on every activity **and no `SNET` eligible for
the strip**, every user-visible date is identical before and after the epic — canvas bars, Gantt
grid cells, Gantt chart bars, framed span, printed programme, exported PNG, CSV, guest share view,
baseline variance figures **and** float read-outs.

**Baseline:** the same plan on the release preceding M-A.

**Judged by:** a before/after comparison over the seed catalogue (ADR-0066), committed at M-F as
`m-f/no-placement-parity.md`.

**Asserted at the PRODUCT, not the engine**, for the ADR-0066 reason: all 117 capability keys are
proven at `computeSchedule` and none at the application, and the two defects that motivated that ADR
were green at the engine and wrong in the product.

**Withdrawal clause:** none.

---

#### FC-8 — the ghosts are legible, and distinguishable from **each other**, without colour

**Re-derived for three members.** The original clause 3 asked only that a ghost be distinguishable
from the placed bar. With three kinds the harder question is whether they are distinguishable from
**one another**, and a design that passes the original clause can fail this one completely.

**Bar, four clauses:**

1. Each ghost's stroke clears **3:1** against the canvas ground in the **canvas surface scope**
   (ADR-0102), asserted by the contrast matrix with the new pairs added **before** the CSS is
   written.
2. Every new token pair is present in `@theme inline` and resolves to a real value **in a browser**,
   asserted by the reachability limb ADR-0100 M4 added — not by the matrix alone.
3. **Earliest, latest and levelled are distinguishable from each other, and all three from the
   placed bar, with colour removed** (WCAG 1.4.1) — asserted by a greyscale screenshot of a scene
   carrying all three simultaneously on the same activity.
4. The levelled member is drawn in that scene — i.e. the fixture has `levelResources` on and at
   least one delayed activity. A greyscale shot of two ghosts proves nothing about three.

**Baseline:** no ghost token exists.

**Judged by:** `token-contrast.test.ts` (1–2) and a `shoot.mjs` entry (3–4).

**Clause 2 is not redundant with clause 1, and the distinction has cost this repository twice.**
ADR-0100 M4 found a pair never aliased in `@theme inline` painting **no colour at all** in a real
browser while the contrast gate stayed green, because the gate resolves `:root` names. ADR-0121 found
the sibling one layer along: `stackSeries` emitted `var(--chart-n)`, and Canvas 2D's `fillStyle`
setter **discards an unparseable value and keeps the previous colour** — no throw, no visual error
state — so the stack would have painted as one solid block with every unit test green.

**Withdrawal clause:** none for 1–2. If clause 3 cannot be met with three kinds, **the levelled
member's visual language changes** (stroke rhythm, cap, weight) until it can — the member is not
dropped, because CQ-4's answer is what put it here and a third kind that is indistinguishable is the
1.4.1 failure rather than a styling preference.

---

#### FC-9 — a programme with no upstream placement produces byte-identical bounds

**New, for CQ-5's answer.** FC-7's shape, one plan boundary out.

**Bar, two clauses:**

1. For a programme whose upstream closure carries **no** `visual_start` anywhere, every downstream
   activity's derived `external_early_start` is **byte-identical** to the value the preceding release
   produces, across all four edge types (`FS`, `SS`, `FF`, `SF`) and including the `missing: true`
   path for an uncalculated predecessor.
2. For a programme whose upstream predecessor **is** placed, the downstream bound moves by exactly
   the placement's effect on that predecessor's effective dates — and **not** by its drift, which is
   a different quantity.

**Baseline:** the programme conformance scenarios as they stand before M-H.

**Judged by:** the ADR-0045 programme conformance harness, run against both producers.

**Both producers must be exercised, and this is the clause most likely to be skipped.**
`cross-plan-dependency.repository.ts:189` and `conformance/cross-plan-adapter.ts:130-131` build the
same projection from different sources (verified). A run that exercises only the adapter certifies a
basis the product may not use, **green**. The harness must be shown to fail when either producer
alone is switched.

**The backward bound is out of scope and that is a designed asymmetry, not an omission.**
`loadOutgoingWithSuccessorDates` reads the downstream successor's **late** dates (`:201-206`), and
there is no placed-late: Pass 2 is forward-only and ADR-0033 D5 settled SQ-e. A condition asserting
the backward bound changed would be asserting a thing that cannot exist.

**Withdrawal clause:** none for clause 1. If clause 2's arithmetic turns out to be ambiguous for a
given edge type, **that edge type's behaviour is specified in the ADR before M-H ships** rather than
discovered by a planner.

---

#### FC-10 — the constraint strip is measured, bounded, recorded and reported

**New, for CQ-7's answer — _"this is the one irreversible decision in the epic and it needs rails,
not a warning."_** Four clauses: one gates whether it runs at all, one is the safety property, two
are the rails.

**Clause A — the population is measured before anything is stripped.**

**Bar:** M0 reports, through the ADR-0140 panel, the count of activities with
`constraint_type = 'SNET'` split three ways — **binding** (`early_start = constraint_date`),
**inert** (`early_start > constraint_date`), **unknown** (`early_start IS NULL`) — plus, of the
binding set, how many are covered by a post-ADR-0126 **FULL** baseline.

**Prediction, written to be falsified:** the binding count is **under 200 activities in a single
plan and a single organisation**, and **FULL-baseline coverage is zero**. ADR-0140's first press
measured 164 activities in one plan, one organisation across the **whole** deployed estate, and
ADR-0126 shipped recently enough that a FULL baseline over them is unlikely.

**Clause B — the automatic strip is bounded by what was measured.**

**Bar:** the migration runs automatically **only if** the binding population is **≤ 500 activities
across ≤ 5 plans**. Above either, the strip does **not** ship as an unattended migration: it becomes
a per-plan, planner-initiated action with the same conversion rule and the same record.

**Why those numbers, derived rather than chosen:** 164 activities in one plan is the entire known
estate, so 500/5 is roughly threefold headroom — generous enough not to fire on ordinary growth, and
tight enough to **fail loudly** if the estate is materially larger than anybody believes (a second
customer onboarded between now and M-I being the obvious way that happens). A bar with no failure
mode is decoration.

**Clause C — the bars do not move, proved on a real plan.**

**Bar:** for a plan carrying binding `SNET`s, every activity's `visualEffectiveStart` and
`visualEffectiveFinish` are **identical** before and after the strip; and the plan's downstream
`early*`/`totalFloat` **do** change where an SNET was removed — asserted **positively**, not merely
tolerated.

**This is the condition that distinguishes the epic's intent from a silent regression.** Asserting
only "bars do not move" would pass equally against a migration that did nothing at all; asserting
only "float changed" would pass against one that moved every bar. Both halves, or neither means
anything.

**Judged by:** an API e2e over a seeded plan with one binding SNET, one inert SNET and one
uncalculated activity, verified red against (i) a strip with no `visual_start` written and (ii) a
strip that converts the inert one.

**Clause D — the record exists and the planner is told.**

**Bar:** every stripped constraint has a `placement_migration_log` row written **before** the delete,
in the same transaction; and a plan with stripped constraints renders the dock notice stating the
count, on first load, dismissible per user.

**Why this cannot be left to the audit log:** `PATCH …/activities/:activityId` is
`REASONS.PLAN_CONTENT` (`audit-coverage.structural.spec.ts:264`, verified) — permanently excluded
under ADR-0073's content-edit rule. **Nothing in `audit_events` will ever record a stripped
constraint.** That absence is the reason the record exists.

**Withdrawal clause:** if clause A's measurement exceeds clause B's bound, the **unattended
migration is withdrawn** and M-I ships the planner-initiated form instead. The conversion rule, the
record and the notice are unchanged — what changes is who presses the button. If clause C cannot be
made to pass, **the strip is withdrawn entirely** and CQ-7 returns to the product owner with the
measurement, because a strip that moves bars is a worse product than the constraints it removes.
