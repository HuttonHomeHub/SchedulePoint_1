# ADR-0066: The seed catalogue, and the engine as the application's oracle

- **Status:** Accepted (M0–M4 landed; M5 in progress)
- **Date:** 2026-07-31
- **Supersedes:** nothing
- **Builds on:** ADR-0034 (engine conformance), ADR-0035 (CPM semantics), ADR-0028 (the pen),
  ADR-0050 (interchange, and the report discipline), ADR-0022 (recalculate), ADR-0058 (drift control)

## Context

**The engine is proven. The product around the engine is not.**

The ADR-0034 conformance harness feeds `p6_torture_test_v1.json` straight into `computeSchedule` —
a pure function. It never touches Prisma, the services, the DTOs, the recalculate transaction, the
API or any UI. All **117** capability keys in the fixture's `coverage_index` are therefore proven
**at the engine**, and **none** is proven **at the application**.

The only route from that fixture into a real database is the XER import, and the format cannot carry
about seventeen of the capabilities at all — `duration_type`, the external inter-project instants,
the per-relationship lag calendar, resource `max_units_per_hour` and `price_per_unit`, assignment
`curve`/`role`/lag, the four expenses, the eight activity steps. There is **no seed script anywhere
in the repository**: `apps/api/prisma/` holds migrations and a schema and nothing else.

Two defects found on 2026-07-31 are the argument for this ADR, and neither was hypothetical:

1. The importer coerced every P6 `TT_LOE` row into a zero-duration `TASK`. The engine implements
   Level of Effort completely (ADR-0035 §21) and every golden test passed; five activities in the
   product owner's own demo file collapsed to points instead of spanning their logic.
2. `parentId` never reached the engine at the `schedule.repository` seam, so every WBS summary
   took §24's _empty-summary_ branch and collapsed to a zero-length point at the data date — a
   defined, plausible-looking answer, which is why it shipped.

Both were **green at the engine and wrong in the product**. No gate in the repository could have
caught either, because no gate exercises the path between the two.

A second problem compounds it. The fixture is **one 129-activity plan**: when a date looks wrong
there is no way to tell which feature caused it, which is the difficulty behind the report that "the
WBS rows don't tally". And 129 activities is **6%** of the 2,000-activity scale the draw-performance
argument is conducted at (ADR-0026 §16, TECH_DEBT #75), so no plan in the repository is large enough
to test that claim either.

## Decision

Build a **seed catalogue**: a set of plans created through the **public REST API**, in five tiers —
the full fixture, small per-capability plans, systematic pairwise crossings, generated scale, and the
hostile cases — with a written playbook naming which plan proves what.

Four decisions carry the weight.

### 1. Seeding goes through the API, never through Prisma

A direct write can create a plan the product itself would refuse to make, so a Prisma-seeded test bed
would be exercising the rendering of impossible data. Going through the real write path also means
the seed run **is** a test: if the seeder cannot create something as a Planner, a Planner cannot
either, and that is a finding rather than a reason to reach for a privileged path.

The seeder therefore holds the ADR-0028 pen for structural writes and obeys every RBAC and validation
rule. The cost is speed. That is the right trade: the two defects above both lived in the layer a
direct write would skip.

### 2. The engine is the application's oracle — and its input comes from the spec

The pairwise tier is ~60 cases. Hand-authored expected dates do not scale to that, and worse, dates
authored by reading the engine would be **circular** — they would encode whatever the code already
does. So each case asserts instead that **the application matches the engine on the same inputs**:

```
SeedSpec ──▶ HTTP ──▶ persist ──▶ recalculate ──▶ read back ──┐
        │                                                     ├──▶ compare
        └──────────▶ computeSchedule (directly) ───────────────┘
```

**The engine's input is built from the `SeedSpec`, never from the persisted rows.** This is the
load-bearing detail and it is easy to get wrong: assembling the engine input by reading the database
would reuse `schedule.service.ts`'s own input assembly — the exact code both known defects lived in —
so the comparison would agree with itself and prove nothing. Deriving it from the source spec is what
makes the differential able to see a field the write path dropped.

Applied to defect (1): the spec says `LEVEL_OF_EFFORT`, so the engine spans the logic; the persisted
row is a zero-duration task, so the application collapses it to a point; the comparison fails naming
the activity and the field. It would have caught it on the first run.

This claim is deliberately narrow. It **cannot** tell us the engine is right — the ADR-0034 goldens
do that, per capability, against documented semantics. It catches everything _between_ the engine and
the screen, which is precisely the gap that has no gate today.

### 3. `@repo/seed` is pure, and separate from `@repo/interchange`

The package describes a plan and knows nothing about HTTP, Prisma or DTOs. That split is what lets
one spec feed both the seeder and the differential.

It is **not** an extension of `ImportGraph`, though the two look similar. `ImportGraph` is shaped by
what an interchange format can carry and deliberately stops where XER and MSPDI stop; a `SeedSpec` is
shaped by what the **application** supports, which is strictly more — and the difference is exactly
the seventeen capabilities that motivate this work. Extending it would push seed-only fields into the
interchange model where they would read as "an import could produce this" when no format can. Two
independent models with the same conventions (keys not ids, working-minutes, site-local dates) is the
honest shape, and it keeps `@repo/seed` free of a parser dependency.

### 4. The vocabulary copy is gated, because its failure is silent

`@repo/seed` cannot import `@prisma/client` (it is pure and browser-safe), so its enum vocabulary is
a hand-maintained copy. That copy's failure mode is the worst kind: a new enum member lands in the
schema, no spec can express it, the capability quietly falls out of the catalogue — and **every test
stays green**, because a catalogue with no plan for a feature is indistinguishable from a feature
nobody has reached yet.

`apps/api/src/common/contracts/seed-vocabulary.spec.ts` pins all sixteen enums against the real
Prisma enums, on the `dependency-type.spec.ts` precedent. It was verified to fail — naming the
missing member — before being relied on.

## Consequences

**Good.**

- Every capability the app claims gets a named plan that demonstrates it end to end.
- A field the write or read path drops fails a test instead of being found by a planner months later.
- TECH_DEBT #75 becomes answerable: a real plan at the scale the budget argues about.
- The XER import gains a reference to diff against, so import fidelity becomes measurable.
- The product owner can seed their own running stack, not just a dev machine.

**Costs and limits, stated plainly.**

- Seeding through HTTP is slow. A 5,000-activity plan is thousands of requests; the seeder batches
  where the API offers it and backs off on 429, and if it hits a ceiling **that is a finding worth
  having** rather than something to tune around.
- Pairwise covers every _pair_ of interacting dimensions. Three- and four-way interactions are **not**
  covered and will not be — that is a combinatorial cliff with sharply diminishing returns. Anyone
  reading this should not believe "all permutations" have been tested, because they have not.
- The differential proves the plumbing, not the semantics. An engine that is wrong in the same way
  the app is wrong would pass. That is the ADR-0034 goldens' job and this does not replace it.
- The playbook is prose and will rot (ADR-0058). `pnpm check:playbook` gates that every row names a
  plan the builders actually produce; it cannot gate that the sentence is still true, so the
  reconciliation pass owns it.
- The fixture's roles, activity-code types and UDF definitions have **no SchedulePoint concept**.
  They are reported as unplaceable, never dropped silently — the ADR-0050 discipline applied to
  seeding, so a reader can tell "the app cannot hold this" apart from "the seeder forgot".

**What M2 found, which is the argument for the whole ADR restated as evidence.** The capability
tier's coverage report resolves **109 of the 117** keys to a plan. The other eight are not gaps in
the catalogue — they are capabilities the **engine implements and no client can author**, which is
exactly the asymmetry a harness that feeds `computeSchedule` directly is structurally unable to see:

- **Four to TECH_DEBT #80**, the largest of them: `fullDayShiftsFromMask` derives every calendar's
  shifts from the weekday mask on the single create, the update and the interchange batch alike, so
  ADR-0036's intraday shift patterns — the headline of the rework it called _gating_ — exist in the
  engine and in storage and can be created by nothing.
- **Two to #79**, the `@Min(1)` on the mask forbidding a window-only base week.
- **Two with no product concept at all** (a role; a per-assignment lag).

M1 had already produced **#78** the same way. Four write-path gaps, none of which any existing gate
could have reported, all found by asking one computable question about plans rather than about code.

**What M3 shipped, and what it is allowed to claim.** The covering array is **63 cases over 26
dimensions with zero legal pairs uncovered**, and the differential runs all of them against a real
PostgreSQL in ~145 s. Three things about it are worth stating because each was a decision:

- **The suite has been seen to fail.** A differential that has never failed reports the same green
  whether it is comparing carefully or comparing nothing. So the LOE defect is reintroduced —
  written straight into the persisted row after a clean seed, exactly as the importer used to make
  it — and the guard asserts the comparison catches it. That guard was itself verified by blinding
  the comparison and watching it fail with the message it was given.
- **CI runs the whole array, not a prefix.** A truncated covering array is not a covering array, and
  "the pairwise differential passes" would not have changed wording to say so. It is its own CI step
  so the cost is attributed to a line a reader can see rather than hidden inside the API e2e run —
  the plan's stated risk for this task being that a slow suite gets quietly disabled.
- **What it cannot claim.** It cannot tell us the engine is right; the ADR-0034 goldens do that per
  capability against documented semantics. It catches what lies between the engine and the screen.
  It also covers **pairs only** — three- and four-way interactions are not covered and will not be.

Building it found one real seeder infidelity, and the way it surfaced is the design working:
`defaultCalendarKey: null` in a spec left the org's seeded five-day "Standard" calendar on the plan,
so the engine (reading the spec's null) and the application (holding the default) disagreed by four
days. The seeder now sends `calendarId: null` explicitly. Nothing else would have caught that — the
plan looked correct, and every date in it was wrong.

Two decisions worth recording because a reader will otherwise re-derive them:

- The implementation plan named **seven** families; the catalogue ships **nine**. Relationship
  types, lag, network shape and float — about thirty keys — had no family in that list, and folding
  them into a neighbour would have produced two plans too big to read by hand, which is the one
  property this tier exists to have.
- Three families ship as **matched pairs over the same activities** (Retained Logic / Progress
  Override, external / external-ignored, resources / levelling). A plan-level switch that changes
  every date cannot be demonstrated inside one plan: you see an answer with no way to tell whether
  the other setting differs. The pair is the evidence, and if the two plans agree the setting is not
  being read.

**What M4 measured, and the number it retracted.** The scale tier generates a plan of a **declared
shape** — three-level WBS, 1.6 links per activity, ~4% milestones, LOE hammocks _with span anchors_,
a progressed front at the data date, 35% assigned — and `scale.spec.ts` asserts every one of those
against the generated plan at 500 and 2,000, because a measurement is quoted against the shape and a
generator that silently drifted to 0.9 links per activity would still produce a number. The floor is
12 activities and the mix is deliberately **not** asserted there: 4% of twelve is half a milestone,
so the claim has no meaning at any tolerance.

Three things it found, and the first is the milestone's own premise landing on itself:

- **The generated plan was one queue, and every declared number was correct.** The first live 500
  run seeded cleanly — 540 activities, 800 links, no findings, every WBS summary correctly dated
  (the ADR-0038 rollup this whole ADR was written after) — and the engine came back with **96% of
  tasks critical, average total float zero, and a ten-year duration for 500 activities**. The cause
  was step 2 of the topology: linking each band's last activity to the next band's first reads like
  a hand-over and is in fact a single spine through the entire plan. The unit tests all passed,
  because density, WBS depth, activity mix, acyclicity and determinism were each exactly as
  declared. **A plan can be precisely the shape you specified and still be a queue**, and nothing
  but the longest path says so. `longestChainFraction` is the assertion that was missing; bands now
  hand over to the same band of the next phase, so the plan runs as four concurrent streams and the
  longest chain is 25% of the plan rather than 99%. The regression test was verified to fail against
  the old topology (0.992 against a 0.4 bound) before being relied on, and the fix was then re-seeded
  into a live instance and read back **from the engine**, not from the graph maths that motivated it:
  37% of tasks critical (was 96%), average total float 29 working days with a maximum of 109 (was
  zero throughout), a 140-activity plan spanning under a year (was ten years for 500), and still no
  undated activity — the WBS rollup that this ADR exists for is unaffected.
  Two smaller notes on it: the top-up links had to be confined to a band as well — drawn across the
  whole plan they crossed into neighbouring _parallel_ streams and re-serialised it to 66% even
  after the phase fix — and the scene layout used by the draw benchmark had **already** been fixed
  to run phases concurrently, so for one commit the picture and the logic disagreed about the same
  plan. The drawing was right and the logic was wrong.

- **The seeder's ceiling is the throttle, and it is reported rather than tuned around.** A
  2,000-activity plan is ≈ 6,500 write requests and a 5,000 one ≈ 16,200, against a global
  100-per-60-second limit — ≈ 65 and ≈ 162 minutes. The CLI prints that estimate _before_ it starts,
  because the alternative is discovering it forty minutes in. It does not raise or bypass the
  limiter: a seeder that took a privileged path would stop being a client, which is the premise of
  the whole ADR.
- **TECH_DEBT #75's "decide what representative is" is now half-answered, and the answer is that the
  scene dominates the number.** Painting the realistic plan instead of the synthetic lattice, back to
  back on one machine, moves p95 from 11.6 → 18.7 ms at whole-plan zoom (2,160 bars and 3,200 links
  against 2,000 and 1,493) and from 14.2 → **6.7 ms** at the working zoom, where routing costs
  nothing measurable — because real logic is local, so the cull works, and the lattice's every-edge-
  spans-seven-lanes construction defeats it. The full table is in TECH_DEBT #75.
  The retraction is worth more than the numbers: the **first** realistic run reported 4.6 ms p95 at
  whole-plan zoom and looked like the budget being met. It was wrong — a plan laid out nose-to-tail
  spans twenty-eight years at 2,000 activities, so nine bars in ten were culled and the comparison
  was measuring the cull. The layout now runs a phase's bands concurrently. A benchmark that
  flatters is worse than none, and this one flattered on its first attempt.

**No schema change, no API change, no web change.** Deliberately: a seeder that needs a schema change
is a seeder that is not using the product. An endpoint the seeder finds missing is recorded as a
finding and raised separately, so this work cannot quietly grow an API surface.

## Alternatives rejected

- **Direct Prisma seeding.** Faster; can create rows the product would refuse; skips every service
  invariant — which is where both known defects lived.
- **Extending the XER fixture to carry more.** The format has no column for most of it. Forcing it
  would mean inventing non-standard fields, and the file would stop being a realistic P6 export,
  which is its main value.
- **Extending the Python generator** (`fixtures/tools/generate_fixture.py`). It runs the wrong
  direction — it produces the JSON, and we need JSON → app. The fixture is pinned to
  `schema_version 1.0` and re-running it is a reviewed change, and ADR-0034 explicitly rejected
  adding Python to the pipeline.
- **Hand-authored expected dates for the pairwise tier.** Unmaintainable at sixty cases, and circular
  if authored by reading the engine.
- **One mega-plan containing everything.** That is what exists today, and its undiagnosability is one
  of the two problems this ADR sets out to solve.

## Links

- [`docs/specs/seed-catalogue/feature-spec.md`](../specs/seed-catalogue/feature-spec.md)
- [`docs/specs/seed-catalogue/implementation-plan.md`](../specs/seed-catalogue/implementation-plan.md)
- ADR-0034 — engine conformance & validation methodology
- ADR-0058 — drift control: "verify the claim; do not trust the document"
