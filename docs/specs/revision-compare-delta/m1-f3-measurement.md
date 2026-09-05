# F3 — the end-to-end figure M0 deferred

**Result: PASS.** `p95 58.7 ms` against a committed bar of `250 ms`, at 2,000 activities.

## What was owed, and why

`m0-condition.md` §F3 asks for **≤ 250 ms p95 end-to-end over the real HTTP route at 2,000
activities**. `m0-measurement.md` §F3 split the limb and said so plainly: the route did not exist
when M0 ran, so the loads were measured (p95 25.2 ms, median 19.3 ms) and **the end-to-end half was
deferred to M1's first measurement**. That is this file.

The condition's own words about why the bar is loose are worth repeating, because they decide how
to read the result: it exists **to catch an accidental N+1 or a per-row query**, not to be tight.
An N+1 over 2,000 activities would be orders of magnitude above this. A bar that can only fail on a
mistake is still worth having when the mistake is silent.

## Result

Harness: `apps/api/scripts/measure-revision-compare.mts`, run under
`scripts/vitest.measure.config.mts`.

```
F3 end-to-end, 2000 activities / 1900 dependencies, 15 runs after 3 warm-ups:
  p50 50.4 ms   p95 58.7 ms   min 45.2 ms   max 58.7 ms
  bar 250 ms p95 -> PASS
  non-vacuity: entered 180, left 260
```

Percentiles are nearest-rank over 15 samples after 3 warm-ups — the M0 harness's convention, kept so
the two numbers are comparable. The route's own figure is **about 2.3×** the two bulk loads M0 timed
(25.2 ms p95), which is the guard chain, the query DTO, the delta itself, the DTO serialisation and
the socket. That ratio is the useful part: it says the read model is not hiding a second query
pattern behind the loads M0 already measured.

## The non-vacuity control, checked first

`entered 180, left 260`. **A benchmark over two identical schedules reports the fastest number this
route can produce and says nothing about the case it exists for** — the failure ADR-0093 and
ADR-0108 both record, and the reason `m0-condition.md` puts its pinned positive case before the
other limbs. So the harness moves 200 activities between the capture and the read, asserts the delta
is non-empty **before** it judges the timing, and fails rather than reporting a fast empty run.

It also happens to exercise the cap: `leftTotal` 260 exceeds `REVISION_ROW_CAP` (200), so the
returned `left` array is truncated and the true total travels beside it, which is the state a client
must render as "showing 200 of 260".

## Where the harness bypasses the product

Stated rather than left to be discovered (ADR-0081 §3, and M0's own practice):

1. **The 2,000 activity rows and 1,900 dependencies are inserted directly**, not created over HTTP.
   M0 measured that seeding 2,000 activities through the API costs about an hour at the observed
   rate, which would have measured the seeder. For a **read** benchmark that is legitimate: the
   numbers describe queries, not writes.
2. **The recalculation and the baseline capture go through the public API**, because they are what
   makes both sides real persisted CPM output rather than rows the script invented.
3. **Everything the measurement is about goes over the real route** — a real socket, the real guard
   chain, the real query DTO, the real service, the real DTO serialisation. That is precisely the
   half M0 could not reach.

The network is chains of 20 rather than 2,000 parallel bars, so it has real depth and a real
critical path — the ADR-0066 scale-generator finding (a generator that held every declared shape
number while being one queue) applied in the opposite direction.

## A toolchain finding, recorded so nobody spends the hour again

**`tsx` cannot boot this application.** The first version of this harness ran under `tsx` and failed
with `Nest can't resolve dependencies of the OperationalAlertService (?, +, PinoLogger)` — a
provider whose imports are correct. The cause is that the SWC plugin in the vitest configs owns the
decorator-metadata transform Nest's DI reads, and `tsx` does not emit it, so every constructor
parameter type is erased. The error points at an `import type` mistake that does not exist.

That is why `apps/api/scripts/vitest.measure.config.mts` exists and why this harness is wrapped in
one `it`: it is a harness, not a test, and the only thing it asserts is the committed bar, so a
later regression shows up as a failure rather than as a number nobody read. It is excluded from
every test config and from CI — it seeds thousands of rows and takes minutes.

## Consequence for the throttle

**None: §4.5's decision stands, and now on a measurement rather than on a paragraph.** The spec said
no throttle beyond the global 100/60 s, on the ground that a persisted read shares the generic
budget precisely because it runs no CPM computation — the reasoning `schedule.controller.ts`
already documents for `health-check`. It also said, in as many words, that if F3 contradicted the
paragraph the paragraph would lose. It did not: 58.7 ms is a persisted read, two orders of magnitude
from anything that would warrant its own budget, and copying `FLOAT_PATHS_THROTTLE` here would be
the mistake ADR-0116 M6 names by hand.
