# M0 — falsification conditions, committed before any harness code

> **This file lands in a commit of its own, touching nothing else.** That is the whole point of it.
> A condition written after the run is not a condition, and this repository has the receipts: ADR-0097
> Landing C's harness produced a **PROCEED from an `undefined`** — an edit had silently failed to
> apply, and `undefined >= 120` is `false`, which is the right answer from a missing number.
>
> **The standard is ADR-0121's, and it is worth stating plainly before anything is measured: that
> epic committed its conditions first, BOTH FAILED, and both remedies were applied rather than
> either criterion being softened.** If a condition below fails, the remedy is applied or the epic
> stops. Softening a bar to match what was measured is the one move this file exists to prevent.

Expected values are written down **now**, so that a later run agreeing with them means something.

---

## F1 — the extraction is a no-op for the existing instrument

After M1 moves the scene derivation and the verdict out of `apps/web/scripts/` and into shared
modules, running the existing CLI:

```
node apps/web/scripts/measure-revision-diff.mjs --scene fixture --preset week
```

must produce a verdict of the **same shape**, with non-vacuity counted the same way and the same
throw-when-it-cannot-judge behaviour.

**What this asserts, and what it deliberately does not.** Absolute timings will differ between any
two runs in this container — that is the epic's own premise, and pretending otherwise here would
be incoherent. **So the assertion is on shape and behaviour, not on milliseconds**, and that
limitation is stated rather than hidden, because the honest alternative is no assertion at all.

Concretely, before and after must agree on:

- the set of lines printed and their order;
- the non-vacuity counts being present and computed from the same population (bars and links
  **inside the measured viewport**);
- the verdict vocabulary reachable;
- a run with nothing to judge **throwing** rather than printing a verdict.

**Expected: PASS.** The CLI is the before/after oracle for this extraction — the ADR-0078
barrel-preserving argument — and its assertions do not change.

**If F1 fails:** the extraction changed what is measured. Fix the extraction. Do not re-baseline
the CLI.

### Result — PASS, 2026-09-07

Run before the extraction and after it, on `--scene fixture --preset week`. Output identical once
timings are normalised: the same lines in the same order, non-vacuity counted from the same
population, the same verdict vocabulary, and the throw preserved.

**The comparison method needed one correction, and it is worth recording because it is the same
class of error the conditions exist to catch.** The first normaliser replaced `[0-9]+\.[0-9]+` and
left the sign, so a run where the treatment came out marginally FASTER than the baseline
(`delta -0.56 pp`) read as a difference against one where it came out marginally slower
(`delta +0.19 pp`). Both PASS; both are the same shape. **The sign of a delta is a measurement, not
structure**, and treating it as structure would have failed F1 for exactly the reason F1 says it
must not — absolute timings do not reproduce here. Normalising `[-+]?[0-9]+\.[0-9]+` gives an
identical diff.

It also survived the second half of M1: the CLI now reads its bars and its gating from the scenario
registry rather than deciding again, and the output is still identical.

---

## F2 — the initial bundle does not move

`pnpm --filter @repo/web build` before the epic and after it. The **entry chunk's gzip size must be
unchanged**.

**Any movement in the entry chunk means the dynamic import did not split, and the epic STOPS until
it does.** This is the condition that can halt the work, and it is written that way deliberately:
`@repo/seed` is currently a **devDependency** of `@repo/web`, so importing the scale scene from
`src/` requires promoting it to a production dependency. That is a real cost paid by every user of
the application, to serve a panel only a staff member can open. It is not renegotiable against
"but the panel is nearly done".

**The lazy chunk's size is REPORTED, not gated.** Gating a number nobody has measured is how a gate
comes to be set at whatever the first run happened to produce — this repository's ratchets are set
at measured floors for exactly that reason (ADR-0058).

### Baseline — measured before any change

**Measured at `ca103349`** (the conditions commit, docs-only), clean tree, `pnpm --filter @repo/web build`.

| Chunk (gzip)             | Bytes       |
| ------------------------ | ----------- |
| `index-*.js` — **entry** | **397,471** |
| `jspdf.es.min-*.js`      | 127,391     |
| `index.es-*.js`          | 48,414      |
| `html2canvas-*.js`       | 45,754      |
| `purify.es-*.js`         | 10,493      |
| `staff-*.js`             | 4,619       |
| `rolldown-runtime-*.js`  | 397         |
| `share-*.js`             | 319         |

**F2's number is the entry chunk: 397,471 B gzip.** It must be unchanged after the epic.

**The staff route already code-splits, at 4,619 B.** That is the chunk the panel belongs in, and it
is the reason F2 is a realistic condition rather than a hopeful one — the splitting mechanism is
already working on this exact route.

**If F2 fails:** the named fallback is to keep the scale scene out of `src/` entirely and have the
panel derive a smaller scene locally, accepting that the probe's scene is then not the same one the
CLI uses — which is itself a cost to weigh, and would be recorded here rather than absorbed. If
neither the split nor the fallback is acceptable, **ship M0–M3 and drop the storage**: the product
owner gets the number, and no user pays for a bundle they cannot use.

---

### Result — 2026-09-07, after M3: **the split worked; the number moved by 63 bytes**

Measured with the same method as the baseline (`gzip -c dist/assets/index-*.js | wc -c`) — and the
baseline was **re-derived from `ca103349` first**, giving **397,471 B exactly**, which is why the
figures below can be compared at all.

| Chunk (gzip)             | Baseline `ca103349` | After M3    | Δ       |
| ------------------------ | ------------------- | ----------- | ------- |
| `index-*.js` — **entry** | 397,471             | **397,534** | **+63** |
| `staff-*.js`             | 4,619               | 8,979       | +4,360  |
| `run-probe-*.js`         | —                   | **7,858**   | new     |

**The split is proven, and the +63 B is not probe code.** Three independent checks:

1. **Grep.** The entry chunk contains none of `Run measurement`, `perf-probe`, `NON-VACUITY`,
   `INDETERMINATE`, `scaleSpec` or `canvas-draw`. The staff chunk contains all of them.
2. **The chunk graph.** `@repo/seed/scale`, both scenes and the runner are in `run-probe-*.js`,
   7,858 B gzip, referenced only from the staff chunk and fetched only when somebody presses Run.
3. **A byte-level diff of the two entry chunks.** The _entire_ difference is content hashes plus one
   statement: the entry's own `export{…}` list grows from 20 names to 32. The probe reuses modules
   the entry chunk **already contained** — `paintScene`, `cull`, `resolveTsldPalette`, `Surface`,
   `ConfirmDialog`, `Select` — and a child chunk consuming them requires them to be named. That is
   +119 raw bytes of linkage, 63 after gzip, and it is the honest price of the painter being _the
   shipped painter_ rather than a copy.

**So F2's number moved and F2's inference did not hold.** Its stated rule is "any movement in the
entry chunk means the dynamic import did not split, and the epic STOPS until it does" — and the
split demonstrably worked. The condition was written with one mechanism in mind (scene code leaking
into the entry) and cannot, as written, distinguish that from linkage growing by twelve export
names. **A byte-exact bundle condition cannot tell code from plumbing**; a condition that could
would have to be expressed over the chunk graph, which is what the three checks above do by hand.

Recorded as a **qualified pass**: the thing F2 exists to prevent did not happen, and the number it
names did move. Neither half is dropped. The 0.016 % is not renegotiated into "unchanged" — that
rewriting is the failure this whole document is built to refuse.

**`@repo/seed` is still a `devDependency` of `@repo/web`**, and did not need promoting: Vite inlines
it into `run-probe-*.js` at build time, so nothing resolves it at runtime and no production install
needs it. The cost F2 anticipated — "a real cost paid by every user of the application" — was not
paid, because the 7,858 B lands in a chunk only a staff member ever fetches.

## F3 — the panel and the CLI agree, and the 1920 cell comes back INDETERMINATE

Feed both the browser judge and the CLI the **stored fixture of a real recorded run** — the 1920
cell from `m0-condition.md`'s own second run:

| Quantity        | Value    |
| --------------- | -------- |
| baseline mean   | 10.00 pp |
| baseline spread | 6.67 pp  |
| treatment mean  | 20.19 pp |
| bar             | 2.00 pp  |

Both must report **the same thing**, and that thing must be **INDETERMINATE — not FAIL**.

**Why this is the case chosen.** The baseline's own run-to-run spread (6.67 pp) exceeds the bar
(2.00 pp) it is being judged against, so the instrument cannot separate the treatment from its own
noise. Today the CLI prints that as a **note after the verdict**, which reads as a result somebody
should act on; a human had to notice it by hand and write the finding into `m0-condition.md`. Making
it a first-class verdict is the correction this epic exists to make automatic.

**It is verified against a real recorded run rather than an invented one**, which matters: an
invented fixture proves the judge agrees with whoever wrote the fixture.

**If F3's expected value is wrong, the judge is wrong and not the fixture.**

### Result — PASS, 2026-09-07

`apps/web/src/features/perf-probe/model/f3-recorded-run.test.ts`. Three pairs reproducing the
recorded quantities exactly — baseline mean **10.00 pp**, spread **6.67 pp**, treatment mean
**20.19 pp**, bar **2.00 pp** — asserted to reproduce before anything is concluded from them.

**Verdict: `INDETERMINATE`.** And the counterfactual was run rather than reasoned about: with the
`baselineSpreadPp >= barPp` branch removed, the same fixture reports **`FAIL`** —

```
AssertionError: expected 'FAIL' to be 'INDETERMINATE'
```

— which is the whole epic in one line. A 10.19 pp delta against a 2.00 pp bar is a large,
real-looking effect, and on that run it was produced by a machine whose own baseline had moved
tenfold with nothing in the code path changed. The pre-correction judge would have handed somebody
a confident reason to withdraw a working feature.

**"Both must report the same thing" is structural rather than a coincidence.** The CLI driver
bundles and calls the _same_ `judgeRun` (`measure-revision-diff.mjs:108`, importing from the shared
module M1 extracted); the test asserts that by reading the driver, and additionally that it contains
no verdict arithmetic of its own — because a comment claiming it would be exactly the unexecuted
decision-bearing claim ADR-0076 Class 3 names. The bar is read from `MAX_DROPPED_DELTA_PP` rather
than retyped here, so the fixture cannot drift from the constant it is judged against.

---

## What is deliberately NOT a condition here

- **The M0 Condition A verdict itself** (does the compare overlay go default-on). That is the
  question the epic exists to let the product owner answer on their own hardware; pre-committing an
  expected value would be deciding it here.
- **The canvas-draw scenario's result** against ADR-0026 §9. Product-owner decision, taken 2026-09-07:
  a FAIL is **information**, reported plainly. M5 files rather than opens work, and the panel's
  wording must not imply an obligation.
- **The lazy chunk's absolute size** — see F2.

---

## M0-T3 — three preconditions, checked by running rather than inferred

### 1. `@repo/seed/scale` is browser-safe — CONFIRMED, and it costs 68.6 kB

Bundled alone for a browser target (`esbuild --platform=browser --target=chrome120`): it builds, and
the output contains **zero** occurrences of `node:`. So the claim in `scripts/scale-scene.ts` holds.

**But the size is the finding, and it was not in the brief.** Minified **337,440 B**, gzip
**68,641 B** — against a staff chunk that is currently **4,619 B**. Importing the scale scene from
`src/` therefore multiplies that chunk by roughly **sixteen**.

That is survivable **only** if it lands in a lazily-loaded chunk, and it is exactly why F2 gates the
entry chunk rather than the total. If the split does not hold, the fallback named in F2 is not a
nicety — 68.6 kB in the entry bundle would be paid by every planner on every cold load, for a panel
only a staff member can open. Recorded here so M1 designs the import boundary knowing the number
rather than discovering it at M4.

### 2. The retention list is table-driven, and the forced edit is deliberate — 2 places, not 3

- `RETENTION_TABLES` is a `const` array asserted by **set equality** in
  `retention-boundary.structural.spec.ts:44`. Adding an entry **breaks that test on purpose**: its
  own docblock says the set is closed "so adding a third forces a decision rather than an edit".
  That is the intended decision point, not friction to route around.
- The staff panel's rows are **derived** from the API's list, and `tableLabel()` falls back to the
  raw table name, with the reason stated: "a table added without a label here should read as
  unpolished, never as nameless."

**So a fourth table appears in the panel automatically**; the only edits are `RETENTION_TABLES` (plus
its deliberate structural assertion) and one label. **M4-T5 is smaller than the plan allowed for.**

### 3. `audit_events.action` is TEXT + CHECK — ZERO migrations, not one

`action` is a Prisma `String` with a database CHECK; there is **no `enum AuditAction`**. There _is_ an
`enum AuditActorType`, which is precisely why ADR-0086 D5 had to pay two migrations — Postgres
forbids using a new enum label in the transaction that added it.

**Adding `staff.probe_recorded` costs no migration at all**, and this heading said "ONE migration,
not two" until M4-T3 went to write it. Two claims in the paragraph below were wrong, and both were
asserted rather than read — ADR-0076 Class 3, inside the file whose job is to record what was
verified:

1. **The migration count.** `ck_audit_events_action_format` is a **format** check —
   `"action" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND length("action") <= 64`
   (`apps/api/prisma/migrations/20260803170000_audit_events/migration.sql:76-78`) — not an
   enumeration, so a new label is accepted the day it is written. The precedent that suggested
   otherwise says so itself: `20260809140100_staff_audit_actions/migration.sql` is a **deliberate
   no-op** (`SELECT 1;`) whose own comment reads _"a new action vocabulary costs no migration at
   all"_; it exists only to make the actor-type enum's split transaction visible in the history.
   Reading the precedent as a cost was reading its filename rather than its contents.
2. **The actor.** The probe's actor is `STAFF`, not `USER`. Every staff row uses it
   (`staff.controller.ts:98`, and three more); the single `USER` exception is `staff.access_denied`, and it is the
   exception precisely because that caller is **not** staff. Recording a staff member's own write as
   `USER` would put it in their organisation-facing history rather than the console's.

The paragraph's conclusion — that no new actor type is needed — survives both corrections, for a
different reason than it gave: `STAFF` was added by ADR-0086 D5 and is already in the enum. The
staff namespace is what the console's own feed keys on (`staff.%`), not the actor type, which is
why `staff.access_denied` can be `USER` without disappearing from it.

---

## Readings — the deliverable

The panel is the instrument; these are the numbers it exists to produce. Recorded verbatim as
pasted, with the interpretation kept separate from the data.

### 2026-09-08 — `revision-diff` / Fit / 2,000 activities

Product owner's machine. Intel Arc Pro Graphics via ANGLE D3D11, 22 threads, ~32 GiB, Edge 152,
1912×1068 css px at dpr 1, measured idle frame interval **16.70 ms**, attention held throughout.
`web` 0.123.0. Scene: 2,160 bars (2,000 activities, 160 WBS summaries, 76 milestones), 3,200 links
across 50 lanes, all 2,160 on screen at 1.66 px/day. Full run — 180 frames × 3.

| quantity  | value                                |
| --------- | ------------------------------------ |
| baseline  | 98.33 pp (run-to-run spread 1.11 pp) |
| treatment | 98.15 pp — 23.8 fps                  |
| delta     | −0.19 pp                             |
| verdict   | REPORTED, NOT GRADED (P3)            |

**What this reading does say.** The two headline figures are the same fact stated twice, and that is
worth writing down because they look contradictory: `droppedPct` counts intervals exceeding 1.5× the
idle interval (25.05 ms here), and 23.8 fps is a mean interval of 42.0 ms, which trips that threshold
on essentially every frame. 98.33 pp is not "98 % of frames never painted"; it is "essentially every
frame ran long". A first read of this table flagged the pair as irreconcilable, wrongly.

**What it does not say — and this is the load-bearing part.** The delta is **uninterpretable**, not
merely ungraded. With the baseline at 98.33 pp the arithmetic ceiling leaves 1.67 pp of headroom
against a 2.00 pp bar, so no treatment cost could have produced a failing delta. `−0.19 pp` must not
be read as evidence that the overlay is cheap. Filed as `docs/TECH_DEBT.md` #260, together with the
observation that this already happened once in `docs/specs/revision-compare-changes/m0-condition.md:199`
and went unremarked.

**What it is evidence for.** 23.8 fps at the whole-plan framing on real hardware, against ADR-0026
§9's 30 fps floor at the 2,000-activity ceiling. P3 means no verdict is issued at Fit, and that rule
is unchanged — but the number is a level rather than a difference, so saturation does not touch it.
It is the first real-hardware figure at this framing since 2026-08-03.

**Attribution — do not put this in #75.** This is the `revision-diff` scene, whose baseline is the
painter plus the comparison harness. `docs/TECH_DEBT.md` #75 asks about `canvas-draw`, which is a
different code path and a different question. The two readings that row is waiting for have not been
taken.

### 2026-09-08 — `revision-diff` / Week / 2,000 activities — **the one that answers ADR-0127**

Same machine, 18 minutes later. Idle frame interval **16.60 ms**. Same 2,160-bar scene; at the Week
framing the cull leaves **264 bars on screen at 12.00 px/day**. Full run — 180 frames × 3.

| quantity  | value                               |
| --------- | ----------------------------------- |
| baseline  | 0.19 pp (run-to-run spread 0.56 pp) |
| treatment | 0.00 pp — 60.0 fps                  |
| delta     | −0.19 pp                            |
| verdict   | **PASS** (P1 and P2)                |

**ADR-0127's paint cost is answered: the overlay costs nothing detectable.** That entry closed with
the cost UNANSWERED and a headed run on real hardware owed, because the container's own no-change
baseline moved 0.56 → 1.85 pp and 0.93 → 10.00 pp between runs an hour apart — wider than the 2.00 pp
bar, so the environment was disqualified from answering. This machine is not: its baseline spread is
**0.56 pp against a 2.00 pp bar**, comfortably inside, which is what makes the verdict mean something
rather than merely exist.

**Both limbs, and neither is doing the other's work.** P1, the difference: −0.19 pp against ≤ +2.00.
P2, the level: 60.0 fps against ADR-0026 §9's 30 fps floor at the 2,000-activity ceiling — double it.
The treatment measuring marginally _faster_ than the baseline is noise well inside the 0.56 pp spread,
not a claim that the overlay makes the diagram quicker.

**Saturation does not apply here, and that was checked rather than assumed.** #260's trap needs the
baseline near the ceiling; at 0.19 pp the headroom is 99.81 pp against a 2.00 pp bar, so a costly
treatment had every opportunity to fail this gate and did not. That is what the Fit run could not
say.

**What it does not settle.** One framing, one machine, one afternoon. Fit remains ungraded by P3 and
uninterpretable by #260, so nothing here describes the whole-plan zoom. And a PASS is a statement
about cost, not a decision about the default — see below.

### Still owed

| run                  | answers                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `canvas-draw` / Week | #75's 500-activity limb, which ADR-0026 §9 states and nothing has ever measured, and its 2,000 limb |
| `canvas-draw` / Fit  | #75's unattributed ~8 ms at the whole-plan framing                                                  |

Both are `canvas-draw`, which is a different painter path from the `revision-diff` scene above.
`docs/TECH_DEBT.md` #75 is waiting on exactly these two and on nothing that has been run so far.
