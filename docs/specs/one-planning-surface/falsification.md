# Falsification conditions — one planning surface

**Committed in its own commit, before any harness runs.** ADR-0128's ordering: a bar written after
the measurement is a bar chosen to be met. ADR-0142 D4 is the other half — **an approved remedy is a
claim that it will work, and approval does not make it one** — which now applies to four
product-owner decisions and to four specialist reviews as well as to my own proposals.

**Revised twice.** After §6 was answered, and after four specialist reviews (two blocking). This
revision: **FC-11 is new** and is the epic's foundation; **FC-5, FC-7 and FC-8 are re-derived**, not
amended; **FC-2, FC-3, FC-6 and FC-10 each close a named gap** found by the test review.

**The largest change is that FC-7 was unpassable and not for the reason it said.** It is judged over
the seed catalogue, which contains progress, LOEs and summaries — **all of which move at M-F**,
because Pass 2 is not a superset of Pass 1 (spec C11). Narrowing it to "no stripped constraint" was
not enough; it needed the premise corrected and a new condition ahead of it.

**Five predictions are written down to be falsified** — FC-1, FC-5, FC-10 and FC-11. If any is wrong
it is recorded as wrong, in place.

**One prediction is deliberately absent.** Nothing here predicts how many of the 13 unpinned
Playwright configs fail on first run. ADR-0092 records that one journey ever ran in Visual mode and
found a real defect the first time it did.

---

#### FC-11 — Pass 2 agrees with Pass 1 where nothing is placed, **including progress, LOE and summaries**

**New, and it is the condition whose absence let spec §1.2 ship a false premise for two drafts.**

**Bar:** for a fixture containing a **started** activity, a **complete** activity, a
**`LEVEL_OF_EFFORT`** and a **`WBS_SUMMARY`** over a multi-day child, with **no `visualStart`
anywhere**, `visualEffectiveStart === earlyStart` and `visualEffectiveFinish === earlyFinish` for
**every** activity.

**Baseline — measured, and it is the reason this exists:** today, with no placement anywhere, an
in-progress activity reads early **02 Jan** and visualEffective **10 Jan**; a complete one **02–05**
vs **10–14**; a summary over a four-day child collapses to a **point**; so does a two-day LOE.

**Judged by:** a new case in `compute.visual.spec.ts`, **verified red first** against the current
engine — which it will be, on all four rows, before M-P.

**Why the existing suite could not catch it.** `compute.visual.spec.ts:71-80` is the citation §1.2
rested on and it is **five plain tasks**; the whole 220-line file contains **zero** `actualStart`,
`percentComplete`, `WBS_SUMMARY` or `LEVEL_OF_EFFORT`. The claim was true of the fixture and false
in general, and nothing in the repository asked the general question.

**Prediction:** all four rows fail before M-P and pass after it, and **no** Pass 1 value moves in
either state (FC-2 covers that half).

**Withdrawal clause:** none. If Pass 2 cannot be made to agree, the collapse cannot ship — every
progressed plan in the estate would move its bars at M-F.

---

#### FC-1 — the deployed estate decides the baseline default and the strip's bound

**Bar:** the readings below, through the ADR-0140 staff diagnostics panel on the deployed host
(never `psql`). **M0-T1 has shipped** with **eight** new entries (ten total), so this reads what
exists rather than specifying it.

| Reading                              | Entry                                             | Prediction |
| ------------------------------------ | ------------------------------------------------- | ---------- |
| Plans in `VISUAL`                    | `visual-placement-plans`                          | **0**      |
| Activities placed                    | `visual-placement-activities`                     | **0**      |
| Placed on an `EARLY` plan            | `placement-on-early-plan`                         | **0**      |
| Baselines over a placed plan         | `baselines-over-placed-plans`                     | **0**      |
| SNET binding / inert / unclassified  | `snet-binding`, `snet-inert`, `snet-unclassified` | see FC-10  |
| Binding SNETs a FULL baseline covers | `snet-full-baseline-coverage`                     | **0**      |

**Judged by:** the readings, committed as `m0/estate-readings.md` with date, release and counts.

**`placement-on-early-plan` is the population whose bars MOVE at the collapse** and nothing else
measures it — it is the one reading that is about M-F rather than about the migration.

**Decided in advance:**

- **All zero** → `baselines.placement_snapshot_level` ships `DEFAULT NONE`, which is the literal
  truth of every existing row regardless.
- **`baselines-over-placed-plans` non-zero** → the level still ships `DEFAULT NONE`; what changes is
  that the comparison must report `NOT_ASSESSABLE` for a real population rather than a theoretical
  one, and M-C-T2's tests get a fixture instead of a hypothetical.

**Withdrawal clause:** none.

**The trap:** reading 1 alone. A plan can be `VISUAL` with no placements, **and `visual_start` is
accepted regardless of mode** (`activities.service.ts:388`, `:526-528` — verified, no mode check),
which is exactly why `placement-on-early-plan` exists.

---

#### FC-2 — Pass 1 is byte-identical, **and the guard is verified red**

**Gap closed:** this condition guards the one risk the rollup marks **catastrophic** and it had **no
verified-red step**, while every sibling (FC-4, FC-9, FC-10) has one.

**Bar, three clauses:**

1. The ADR-0034 golden suite passes with **zero** changes to any `early*`, `late*`, `totalFloat`,
   `freeFloat`, `isCritical` or `isNearCritical` value in any fixture.
2. `compute.visual.spec.ts`'s `pureFields` assertions (`:55-64`, `:82-96`) and the whole existing
   `compute.spec.ts` pass **unedited**.
3. **The guard is demonstrated to work.** During the engine milestone, a throwaway mutation lets a
   Pass-2 value perturb a Pass-1 field; the run is confirmed **red**; the mutation is reverted and
   the output committed as `m-d/fc2-red-run.md`. A gate that has never failed is a gate nobody has
   tested.

**Scope, stated because it is narrower than it reads:** clauses 1–2 cover the **existing** corpus.
The new `MSO`/`MFO` fixture (M-D-T3) and FC-11's progress/LOE/summary fixture are **not** covered by
them. **So: every new engine test combining a placement with a constraint variant, a progress state,
an LOE or a summary carries its own purity assertion.** Without that rule the corpus grows a blind
spot exactly where the epic is doing new work.

**Withdrawal clause:** none.

---

#### FC-3 — the golden re-baseline is enumerated, and **the artefact is named**

**Gap closed:** this condition named no artefact, and the obvious reading was wrong.

**The artefacts, established by reading:**

- **`goldens.spec.ts` is `.toEqual()` against hand-typed literals, not a snapshot.** So ADR-0106's
  `-u` ritual **does not apply to it**, and quoting that ritual here would have described a workflow
  nobody performs.
- **The only `toMatchSnapshot()` in the module is `level.parity.spec.ts:185`**, whose picked-field
  shape contains **neither** new field and which **must not move at all**.

**Bar, two clauses:**

1. In `goldens.spec.ts`, the change is **purely additive inside each expected block**: the diff
   contains **zero modified lines** and zero reordered ones — only insertions of
   `remainingFloatMinutes` and `visualConflictReason`. Population is **~30–40 expectation pairs**,
   entirely workable by hand.
2. `level.parity.spec.ts:185`'s snapshot is **unchanged**. If it moves, a picked-field shape has
   silently widened.

**Judged by:** a written list of expected insertions committed **before** the edit, diffed line by
line.

**The discriminator differs by artefact type and that is the point** — for hand-typed literals the
rule is "additive, zero modified lines"; for a real snapshot it is "does not move". Applying the
snapshot rule to the literals would have licensed an `-u`-shaped sweep over a file that has no `-u`.

**Withdrawal clause:** none.

---

#### FC-4 — remaining float is right where the naive version is wrong

**Bar:** on an **eight-hour** calendar, for an activity where
`round(T/f) − round(d/f) ≠ round((T−d)/f)`, the API reports `round((T−d)/f)`.

**Judged by:** an API e2e whose fixture makes the two **disagree**, verified red against a
client-side subtraction. A fixture where they agree passes against both implementations — the
ADR-0139 shape.

**Withdrawal clause:** if no reachable fixture makes them disagree, the **correctness** clause is
withdrawn in place and spec §4.3's justification narrows to the remaining reasons (one derivation;
the DTO alternative does not exist because minutes are persisted for neither input). The design does
not change.

---

#### FC-5 — the window and the levelled ghost do not spend the canvas's headroom

**Re-derived.** The previous version measured **three peer ghosts**. The product owner chose **one
feasible window plus one rival ghost**, and spec §4.5 establishes that **two thirds of the window is
already drawn** (the drift tail's left edge is earliest; the corrected float tail's right edge is
latest). So the increment is smaller and its shape is different — and the condition must measure
what ships, not what was proposed.

**Bar, two limbs, on the product owner's hardware through the ADR-0128 panel:**

1. **Week framing, 2,000 activities**, window + levelled on: dropped frames ≤ **baseline + 2.00 pp**
   (ADR-0127 D8), **and** the run-to-run spread is inside 2.00 pp.
2. **Fit framing, 2,000 activities**: ≥ **30.0 fps**, `docs/TECH_DEBT.md` §9's floor, **and the
   spread safeguard applies here too.**

**The spread safeguard on limb 2 is a gap closed, not a flourish.** CLAUDE.md §17 records that exact
framing needing **five sittings** and a measured **0.4 fps** noise floor after two readings
disagreed by **8.9 fps with no code change**. A single Fit reading is not a verdict, and the
previous version required a spread only on limb 1. **Each per-member reading carries it too**, or
the increments are noise dressed as attribution.

**Baseline:** #75's 2026-09-10 readings — Week/2,000 **60.0 fps, 0.00 pp**; Fit/2,000 **32.2 fps**.

**Prediction, to be falsified:** limb 1 passes; limb 2 **passes** for the window alone (it replaces
two tails with one bracket and may be cheaper than today) and is **marginal** with the levelled
ghost added. This inverts the previous revision's prediction, deliberately: the design changed.

**Non-vacuity, strengthened.** The previous control asked only for a **non-zero** count of levelled
ghosts, which a one-ghost scene satisfies. **Require a stated proportion of levelling-delayed
activities in the fixture, and name the seed-catalogue plan: `plan:capability-levelling`.** A
measurement over a scene where almost nothing is delayed reports the cost of almost nothing — the
ADR-0066 finding that a draw benchmark once measured the cull rather than the painter.

**Increments:** measure with (a) nothing, (b) window only, (c) levelled only, (d) both. The
withdrawal ladder needs per-member attribution and a single both-on reading cannot supply it.

**Withdrawal ladder:**

1. Withhold below a pixel-width floor (ADR-0141's pitch argument). Re-measure.
2. Withdraw the **levelled ghost** below a measured `pxPerDay` floor, lens shaded with a reason.
   **The window is withdrawn last**, because it subsumes two tails the product already draws and
   removing it is a net regression.
3. **Not available:** raising the bar, changing the framing, dropping the spread safeguard, or
   reporting from a headless container (ADR-0127 D8 disqualified that environment by name).

---

#### FC-6 — the thirteen journeys are converted, not re-pinned — **and a pass is triaged too**

**Gap closed:** the previous version triaged **failures** and said nothing about **passes**.

**Bar, four clauses:**

1. All **13** pins removed; every suite green with placement live, **before** the flag-deleting
   milestone opens.
2. **Zero** re-pins, **zero** skips.
3. Every **failure** is classified in `m-b/triage.md` as (a) a product defect this epic must fix,
   (b) a test asserting a surface no shipped bundle produces, or (c) a fixture needing a placement.
4. **Every PASS carries a one-line note stating whether that suite contains an assertion provably
   sensitive to placement being live** — and if it does not, that is recorded as **coverage this
   conversion did not buy**, not as a pass.

**Why clause 4.** A converted journey can pass for three indistinguishable reasons: the surface is
genuinely correct under placement; the surface is wrong in a way the suite does not look at; or the
suite has **no placement-sensitive assertion at all**. Only the first is what the conversion is for,
and thirteen green ticks report all three identically.

**Clause 5 — the triage classification is itself reviewed.** A classification nobody checks is a
self-assessment by the person who most wants the milestone to close. `test-engineer` reviews
`m-b/triage.md` before M-F opens.

**Baseline, derived:** 16 occurrences / 15 files; **13 live pins**: `interchange:65`, `loe:63`,
`authoring-flow:75`, `library:76`, `wbs:77`, `resource-view:81`, `search-nav:88`, `copy-paste:101`,
`gantt:73`, `share:69`, `undo:61`, `authoring:62`, `multi-select:94`. The three non-pins are
docblocks (`library:13`, `gantt-editing:17-23`, `workspace-chrome:8`).

**Judged by:** `scripts/e2e-sweep.sh` over the **derived** list (ADR-0112 found it wrong in both
directions), plus the reviewed triage.

**Withdrawal clause:** none for 1–2. A spec classified **(b)** may be **deleted** (ADR-0088's "a
world no shipped bundle can produce").

---

#### FC-7 — nothing moves where nothing was placed, stripped, **progressed, LOE or summarised**

**Re-derived, and the previous narrowing was insufficient.** The last revision narrowed this to
exclude the stripped population. That was necessary and not sufficient: **it is judged over the seed
catalogue, which contains progress, LOEs and summaries, and all of those move at M-F** because Pass
2 is not a superset of Pass 1 (spec C11). The condition would have failed for a **correct**
implementation — and the temptation would then have been to reinterpret it, which is what conditions
exist to prevent.

**Bar, two parts, at two different milestones:**

- **Part A, at M-F.** For a seeded plan with no placement, **no strip-eligible `SNET`, no progress,
  no LOE and no `WBS_SUMMARY`**, every user-visible date is identical before and after — canvas,
  Gantt cells and bars, framed span, print, exported PNG, CSV, guest view, baseline variance, float
  read-outs.
- **Part B, at M-P, and it is the stronger half.** For a seeded plan **with** progress, an LOE and a
  summary, and still no placement, every user-visible date is identical before and after **M-P** —
  and remains identical through M-F. This is SC-8, and it is what converts C11's correction from a
  paragraph into a gate.

**Baseline:** the same plans on the releases preceding M-P and M-F respectively.

**Judged by:** a before/after comparison over the seed catalogue, committed as
`m-p/progress-parity.md` and `m-f/no-placement-parity.md`.

**Asserted at the PRODUCT, not the engine** — ADR-0066's rule: all 117 capability keys are proven at
`computeSchedule` and none at the application, and the two defects that motivated that ADR were
green at the engine and wrong in the product. FC-11 is the engine half; this is the product half,
and neither substitutes for the other.

**Withdrawal clause:** none.

---

#### FC-8 — the overlays are legible against the **full existing ghost vocabulary**

**Re-derived.** The previous version compared three new ghosts to each other and to the bar. **The
canvas already has two ghost layers this spec never mentioned** — `baselineGhosts`
(`paint.ts:1321-1372`, `GHOST_DASH [2,2]`) and `compareGhosts` (`:1374-1432`,
`COMPARE_DASH [6,3]`) — and **`COMPARE_DASH`'s own docblock records those two having been
pixel-identical once**, found by a ux review. A condition that ignores them repeats that defect.

**Bar, five clauses:**

1. Each new stroke clears **3:1** against the canvas ground in the **canvas surface scope**
   (ADR-0102), with the pairs added to the matrix **before** the CSS is written.
2. Every new token pair is in `@theme inline` and resolves to a real value **in a browser**
   (ADR-0100 M4's reachability limb; ADR-0121's `var()`-to-`fillStyle` silent discard).
3. **With colour removed**, all of these are mutually distinguishable in one frame: the **placed
   bar**, the **feasible window**, the **levelled ghost**, a **baseline ghost** and a **compare
   ghost**.
4. **The fixture carries an active baseline and a selected revision pair**, or clause 3 is asserted
   over a vocabulary smaller than the one that ships.
5. The window is a **bracket**, not a dashed outline — a different shape class from both existing
   ghosts, which is what keeps it structurally out of the collision rather than tuned out of it.

**Judged by:** `token-contrast.test.ts` (1–2) and a `shoot.mjs` entry under a greyscale filter (3–5).

**Withdrawal clause:** none for 1–2. If clause 3 cannot be met, **the levelled ghost's rhythm
changes** until it can — it is not dropped, because a third kind that is indistinguishable is the
1.4.1 failure rather than a styling preference.

---

#### FC-9 — a programme with no upstream placement produces byte-identical bounds

**Bar, three clauses:**

1. For a programme whose upstream closure carries **no** `visual_start`, every downstream
   `external_early_start` is **byte-identical** across all four edge types and including the
   `missing: true` path for an uncalculated predecessor.
2. For a placed upstream predecessor, the bound moves by the placement's effect on that
   predecessor's **`visualEffectiveStart`/`visualEffectiveFinish`** — named explicitly, because
   getting the source column wrong breaks both the rename and this condition, and it was previously
   only inferable from this file.
3. **Both producers are exercised**, and the harness is **shown to fail when either alone is
   switched** — `cross-plan-dependency.repository.ts:189` and
   `conformance/cross-plan-adapter.ts:130-131` build the same projection from different sources.

**Also asserted, negatively:** a structural guard that the **backward** side is **not** renamed to a
"Placed" variant. The plan asserts the positive half only, and a well-meaning reader completing the
symmetry would introduce a basis that cannot exist (there is no placed-late; ADR-0033 D5 settled
SQ-e).

**And the surface is wider than the programme route:** the derivation runs inside **ordinary**
recalculation whenever `countActiveForPlan > 0` (`schedule.service.ts:1425-1432`), so clause 1 is
exercised through `POST …/schedule/recalculate` as well as `…/recalculate-programme`.

**Withdrawal clause:** none for clause 1.

---

#### FC-10 — the strip is measured, bounded, recorded and reported

**Clause A — the population, in four classes.** M0-T1 has shipped `snet-binding`, `snet-inert`,
`snet-unclassified` and `snet-full-baseline-coverage`. **The fourth class is
`early_start IS NULL OR early_start < constraint_date`, and it arises two ways of which only one
clears**: a stored schedule predating the constraint (clears on recalculation), and a started
activity whose actual start bypasses the clamp (`compute.ts:765`) so it reads below its constraint
in a schedule computed seconds ago — **which never clears**. The planner-facing notice must not
imply these resolve.

**Exhaustiveness is asserted ACROSS entries, not inside one.** Gate S-5's fixed all-numeric row
shape makes a three-way split inside a single entry inexpressible, so three entries share one
denominator and the check is `binding + inert + unclassified === total`, verified red against the
plan's own earlier three-class version.

**Prediction, to be falsified:** binding is **under 200 activities in one plan and one
organisation**; FULL-baseline coverage is **zero**.

**Clause B — the bound, read against the population AFTER the placement exclusion.** The strip runs
unattended **only if** the binding population, **excluding rows with `visual_start IS NOT NULL`**,
is **≤ 500 activities across ≤ 5 plans**. Above either, it becomes planner-initiated with the same
rule and record.

**The exclusion is load-bearing and is a gap closed.** `visual_start` is accepted regardless of mode,
so a row can carry a stale placement **and** a binding SNET — and the naive `WHERE` would **destroy
the placement**. Those rows are left, counted and reported, the treatment the other undecidable
classes get. Measuring the bound before the exclusion would size a population the strip does not
touch.

**Clause C — the bars do not move, proved on a real plan.** For a plan carrying binding `SNET`s,
every `visualEffectiveStart`/`Finish` is **identical** before and after; and the plan's downstream
`early*`/`totalFloat` **do** change where an SNET was removed — **asserted positively, not merely
tolerated**. Asserting only the first passes against a migration that did nothing; only the second
passes against one that moved every bar.

**Judged by:** an API e2e over a seeded plan with one binding SNET, one inert SNET, one unclassified
activity **and one row carrying both a `visual_start` and a binding SNET** — verified red against
(i) a strip writing no `visual_start`, (ii) a strip converting the inert row, and (iii) a strip
overwriting the already-placed row.

**Clause D — the record exists and the planner is told.** Every stripped constraint has a
`placement_migration_log` row — with its **prior `visual_start`** as well as its prior constraint —
written **before** the delete, in the same transaction; and the plan renders the dock notice stating
the count and **naming the consequence**.

**Why not the audit log:** `PATCH …/activities/:activityId` is `REASONS.PLAN_CONTENT`
(`audit-coverage.structural.spec.ts:264`, verified), permanently excluded under ADR-0073. **Nothing
in `audit_events` will ever record a stripped constraint.**

**Withdrawal clause:** if clause A exceeds clause B's bound, the **unattended** migration is
withdrawn and the planner-initiated form ships instead — the rule, record and notice unchanged. If
clause C cannot pass, **the strip is withdrawn entirely** and CQ-7 returns to the product owner with
the measurement, because a strip that moves bars is a worse product than the constraints it removes.
