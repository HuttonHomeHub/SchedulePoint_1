# M2 measurement record: the organisation export

Recorded 2026-10-14 against the code at `d9c10dd2` (milestone 2's endpoint, before any tuning). Node
22.22.0, PostgreSQL 16.15 (`shared_buffers` 128 MB) on the same machine, 4 vCPU Intel Xeon @ 2.10 GHz,
16 GB, a shared sandbox and not the owner's server: **read the shapes and the ratios, not the
milliseconds.** The API was the built one (`pnpm --filter @repo/api build`, `node dist/main.js`), not
the Nest dev runner, with the global rate limit lifted so the seeder was not throttled (the export
route keeps its own limit; the API was restarted between runs).

This is the ADR-0142 measurement the plan's Task 2.4 asks for, taken **before any page is built**. Its
purpose is the go/no-go in "Verdict" below.

## What was asked

The thresholds are `feature-spec.md` §1 "Success criteria" and ADR-0194 D3:

| #   | Threshold                                                                                                      | Size it applies to                          |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| T1  | The download completes in under **30 s**                                                                       | the brief's _typical_ size (20 plans × 500) |
| T2  | The export completes in under **5 min**                                                                        | the brief's _upper bound_ (100 × 2,000 × 4) |
| T3  | The export adds under **256 MB** to the API's memory                                                           | the upper bound                             |
| T4  | An ordinary read's p95 stays under **1 s** while an export runs                                                | the upper bound                             |
| T5  | Browser memory for a very large ZIP: if the upper bound exceeds **~250 MB**, record a debt row (plan M3 risks) | the upper bound                             |

Only a tenth of the upper bound was built (see "What was not measured"), so T2, T3 and T5 at the upper
bound are **extrapolations**, labelled as such, with the method stated.

## The fixture, and how it was made

Everything went in through the public REST API (ADR-0066); nothing was written to the database
directly. From the repository root, with the built API running on port `$P`:

```bash
# 1. A user, an organisation, one client and 10 empty projects (one per plan).
node docs/specs/organisation-export/m2-measure/fixture.mjs http://localhost:$P projects "Measure Co" measure@example.com 10
# 2. One 2,000-activity plan per project, the documented way (docs/TEST_PLAYBOOK.md "Tier 4 - scale").
docs/specs/organisation-export/m2-measure/seed-plans.sh $P measure-co measure@example.com <project-id>…
# 3. Two baselines on every plan.
node docs/specs/organisation-export/m2-measure/fixture.mjs http://localhost:$P baselines measure-co measure@example.com <plan-id>…
```

A second organisation, "Other Measure Co" (5 plans, 10 baselines), was seeded **at the same time as**
the first one's plans 2 to 10, so its rows are interleaved with Measure Co's in every table's primary
key order. That is what a real multi-tenant server looks like, and it is what the `EXPLAIN` below is
taken against.

Each seeded plan is `scale-2000`: **2,160 activities** (2,000 plus 160 WBS summaries), **3,200 links**
(1.6 per activity, where the brief's upper bound is 4), 672 assignments. Measure Co then holds:

| Table (file)                                                     | Rows (10 plans) |
| ---------------------------------------------------------------- | --------------- |
| `activities`                                                     | 21,600          |
| `dependencies`                                                   | 32,000          |
| `baseline-activities`                                            | 43,200          |
| `baseline-dependencies`                                          | 64,000          |
| `baseline-assignments`                                           | 13,440          |
| `assignments`                                                    | 6,720           |
| `activity-history`                                               | 59,716          |
| `audit-events`                                                   | 32,064          |
| everything else (22 files, 20 baselines, calendars, projects, …) | ~100            |
| **Total**                                                        | **272,851**     |

Seeding one plan took 240 to 262 s over HTTP (6,480 requests); the seeder reported "No findings" for all
15 plans.

## How the figures were taken

`docs/specs/organisation-export/m2-measure/measure.mjs` signs in, runs an **ordinary read** in a loop
(`GET …/plans/:planId/activities?limit=100`, 25 ms apart) for 8 s with no export running, then starts
the export (`POST …/export`) and keeps the same read loop going until the last byte arrives. It records
wall time to the last byte, bytes, the API process's resident set (`/proc/<pid>/status`, sampled every
100 ms; **delta = peak minus the figure just before the export**), and event-loop delay and V8 memory
from `eld-preload.cjs`, which is loaded into the API process with `node --require` and uses
`perf_hooks.monitorEventLoopDelay` at its 10 ms resolution (so an idle process reads about 10 ms: **the
floor is the resolution, not delay**). The first runs' event-loop windows were not trusted (two windows
carried the same maximum to the hundredth, so the reset between them had not taken), which is why only
the last run's are quoted. No signal is used to ask for a reading: Nest's shutdown hooks
claim `SIGUSR2`, and the first version of this harness killed the API with it.

```bash
ELD_FILE=/tmp/eld.json docs/specs/organisation-export/m2-measure/start-api.sh $P      # prints the pid
ELD_FILE=/tmp/eld.json node docs/specs/organisation-export/m2-measure/measure.mjs http://localhost:$P <pid> measure-co <a plan id> measure@example.com
```

Where the time goes (`apps/api/test/measure/organization-export-stages.measure.ts`) and the query
plans (`organization-export-explain.measure.ts`) run in-process against the same database:

```bash
DATABASE_URL=… EXPORT_ORG=measure-co pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts organization-export-stages --silent=false --disable-console-intercept
DATABASE_URL=… EXPORT_ORG=measure-co MEASURE_OUT=explain.txt pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts organization-export-explain
```

## Results

### One plan, and ten

| Run                                     | Rows    | Wall   | ZIP                    | RSS before → peak (delta) | Ordinary read p95, idle → during |
| --------------------------------------- | ------- | ------ | ---------------------- | ------------------------- | -------------------------------- |
| 1 plan, 2 baselines, fresh process      | 27,285  | 2.9 s  | 3,159,045 B (3.0 MB)   | 262 → 390 MB (**+128**)   | 41 → 85 ms                       |
| 1 plan, same process again              | 27,285  | 2.7 s  | 3.0 MB                 | 369 → 392 MB (+23)        | 40 → 86 ms                       |
| 10 plans, 20 baselines, fresh process   | 272,851 | 25.8 s | 31,496,722 B (30.0 MB) | 259 → 532 MB (**+273**)   | 38 → 90 ms (max 144)             |
| 10 plans, same process again            | 272,851 | 24.0 s | 30.0 MB                | 445 → 538 MB (+93)        | 35 → 75 ms (max 151)             |
| 10 plans, fresh, memory broken down     | 272,851 | 25.1 s | 30.0 MB                | 255 → 547 MB (**+292**)   | n/a                              |
| 10 plans, fresh, `--trace-gc`           | 272,851 | 24.9 s | 30.0 MB                | 258 → 531 MB (**+273**)   | n/a                              |
| 10 plans, fresh, final code and harness | 272,851 | 26.6 s | 31,498,243 B (30.0 MB) | 258 → 540 MB (**+282**)   | 38 → 94 ms (max 255)             |

**Linearity between the two sizes.** 10 plans is 10.0× the rows of one and took 8.9× to 9.2× the time
(25.8 s to 26.6 s against 2.9 s): the per-plan cost falls slightly, so the extrapolation below, which is
linear in rows, errs high. The ZIP grew 10.0× (3.16 MB to 31.5 MB), so its size is exactly linear.

**Ordinary reads.** An ordinary read of 100 activities has a median of 30 to 32 ms with nothing else
running and 53 to 54 ms while an export runs. The p95 during an export is **61 to 94 ms**, under a
tenth of T4's 1 s, and does not grow with the export's size (85 ms at one plan, 90 to 94 ms at ten);
the worst single read was 255 ms. The same machine runs the API, the database and the client, so this
is the loaded case.

**Event loop** (final run, the only one whose idle and export windows were verified separate; the
sampler's resolution is 10 ms, so an idle process reads about 10 ms). Idle: p99 11.6 ms, worst 26 ms
(1,494 samples). During the export: mean 15.3 ms, **p99 52 ms, worst 138 ms** (1,763 samples). The
export therefore does work on the main thread (Prisma's result parsing, and the JSON and CSV text) but
in pieces: the longest single stall was 138 ms and nothing was blocked for a second.

### Where the time goes

One pass over all 272,851 rows, inside one snapshot, adding one stage at a time:

| Stage                                                                                  | Time        |
| -------------------------------------------------------------------------------------- | ----------- |
| 1. Read every page (Prisma, no serialising)                                            | 8.6–8.8 s   |
| 2. Read **and** serialise to JSON and CSV text (330,670,465 characters)                | 12.0–12.3 s |
| 3. The whole writer into a stream that discards its bytes (reads each table **twice**) | 23.2–23.4 s |

Stage 3 is 1.9 to 2.0 times stage 2: **the cost is the two reads of every table** (a ZIP's entries are
written one after another, so the JSON and the CSV of a table cannot be produced from one read without
holding one of them in memory). Deflate, the CRC-32 and the SHA-256 add little because they run on the
libuv thread pool and overlap the reading. A CPU profile of a full export agrees: the main thread was
idle for more than half the wall time, and the largest items were Prisma's response parsing (4.2 %) and
the garbage collector (4.0 %). Per table, in milliseconds per row for one read and serialise:
activities 105 (the widest rows, about 2.2 kB of JSON and CSV), `baseline-activities` 67,
`activity-history` 44, `dependencies` 32, `audit-events` 33, `assignments` 33, `baseline-assignments`
24, `baseline-dependencies` 23.

### Memory

The peak resident set is **+273 to +292 MB over the idle process on a fresh API at ten plans** (four runs), and
+93 MB (ten plans) or +23 MB (one plan) when the same process runs a second export: the process
settles at about 535 to 550 MB, whatever the size of the export that got it there. The V8 trace shows
why. `--trace-gc` of a ten-plan export prints five full collections, each reclaiming a heap of 300 to
326 MB down to **72 to 80 MB** (75.0, 80.1, 72.3, 77.5, 73.5): **the live set does not grow with the
rows exported**, and what climbs between collections is garbage that V8 is in no hurry to collect
(`external` memory peaked at 25 MB, so it is not the ZIP's buffers). So the memory the export adds is a
property of V8's heap-growth policy, not of the organisation's size, and the extrapolation below holds
it at the same plateau. That argument is from five collections inside one export and a second export
in the same process; a real hundred-plan run was not made.

### The query plans

`EXPLAIN (ANALYZE, BUFFERS)` of every read's first page and its second (keyset) page, taken against
Measure Co with Other Measure Co's rows interleaved (`organization-export-explain.measure.ts`). The
slowest page is `activities`' first, **5.6 ms** (a bitmap scan of the `plan_id` index and a top-N sort of
the plan's 2,160 rows); every other page is 0.04 to 3.2 ms. The big org-level tables (`baseline-*`,
`resource_assignments`, `activity_history_entries`, `audit_events`) are read by an **index scan of the
primary key filtered on `organization_id`**, which stops after the page's 1,000 rows; the filter removed
at most 1,010 foreign rows per page (`assignments`, page 2). None of the 28 files needed anything the
schema does not have, so **no index was requested and nothing went to database-architect.**

One thing the data cannot show, recorded as `docs/TECH_DEBT.md` #516: with one organisation a
primary-key scan filtered by organisation is as cheap as an indexed one, and with the two organisations
here it removed about as many foreign rows as it returned. On a server holding _many_ organisations
whose rows interleave, that filter would read the others' rows too. It is a question for the first
multi-organisation server, not for this one, and the fix would be a schema change, so it stops at
database-architect when it matters.

## Extrapolation

**Method.** Time is modelled as two reads of every table (the stage-3 finding), each at the per-row
cost measured above, summed over the table row counts of the size in question. The model reproduces
the measured ten-plan run: 24 s predicted, 23.2 to 25.8 s measured. Size is rows times the measured
characters per row, divided by the measured 10.5× deflate ratio. Per plan it takes the fixture's
shape (2,160 activities, 2 baselines, 672 assignments, 5,972 history entries, 3,206 audit events) and
varies the link density, because the brief's upper bound is four links per activity and the fixture has
1.6. **These are extrapolations from a ten-plan measurement; a hundred-plan export was not run.**

| Size                                    | Rows   | Uncompressed | ZIP    | Time (extrapolated)  |
| --------------------------------------- | ------ | ------------ | ------ | -------------------- |
| Fixture, 10 plans × 2,000 (measured)    | 273 k  | 331 MB       | 30 MB  | **24–26 s** measured |
| Typical: 20 plans × 500, 1.6 links/act  | 184 k  | 216 MB       | 21 MB  | 15 s                 |
| Typical: 20 plans × 500, 4 links/act    | 256 k  | 283 MB       | 27 MB  | 19 s                 |
| Upper bound: 100 × 2,000, 1.6 links/act | 2.73 M | 3.3 GB       | 315 MB | **4.0 min**          |
| Upper bound: 100 × 2,000, 4 links/act   | 4.17 M | 4.6 GB       | 442 MB | **5.2 min**          |

The spec's §3 estimate (2 to 3 GB of JSON and CSV, 150 to 250 MB of ZIP at the upper bound) was low by
1.5 to 2×, almost all of it from the two baselines' copies of every link and activity; its per-row JSON
size (1 to 2 kB) and its 10× deflate ratio held.

## Thresholds

| #   | Threshold               | Result                                                                                                                                                                   | Verdict                            |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| T1  | Typical size < 30 s     | 15 to 19 s extrapolated; 10 plans of 2,000 (about 2.5× that many rows) measured at 24 to 26 s                                                                            | **Met**                            |
| T2  | Upper bound < 5 min     | 4.0 min at the fixture's link density, **5.2 min** at the brief's four links per activity (extrapolated)                                                                 | **Borderline: over at 4 links**    |
| T3  | Added memory < 256 MB   | **+273 to +292 MB** cold at ten plans (four runs); +93 MB on a warm process; live heap flat at 72 to 80 MB; so ~+280 MB at any size on a fresh process (argued, not run) | **Borderline: over by about 10 %** |
| T4  | Ordinary read p95 < 1 s | 61 to 94 ms during a ten-plan export                                                                                                                                     | **Met, by 10×**                    |
| T5  | ZIP > ~250 MB: debt row | 315 to 442 MB at the upper bound                                                                                                                                         | **Fires: row #515**                |

## What was tried to move T2 and T3

ADR-0194 D3's first rung is "tune (compression level, batch size)". Each was run on the ten-plan fixture:

| Change                                                    | Wall                     | ZIP     | RSS delta (fresh) | Kept?                                      |
| --------------------------------------------------------- | ------------------------ | ------- | ----------------- | ------------------------------------------ |
| None (the code above)                                     | 24–26 s                  | 30.0 MB | +273 to +292 MB   | yes                                        |
| Text handed on in 64 KiB pieces instead of per page       | 29.4–29.7 s              | 30.0 MB | +225 to +241 MB   | no: 20 % slower for about 45 MB            |
| The same, with 250-row pages instead of 1,000             | 30.1 s                   | 30.0 MB | +215 MB           | no: no further effect                      |
| Same, with deflate level 1 instead of 6                   | 30.5 s                   | 34 MB   | +230 MB           | no: **compression is not the cost**        |
| The next page requested before the current one is written | 23.5 s (23.4 in-process) | 30.0 MB | +284 MB           | no: 6 % is not worth the extra moving part |

The two levers that would move T2 are not tuning. **Reading each table once** (halving the time) needs
either the CSV held in memory while the JSON is written, which breaks T3, or a second thread doing the
CSV pass, which is D3's second rung (a worker thread). A **cheaper read** of the heaviest tables (raw SQL
in place of Prisma's model mapping) would cut stage 1, but it widens the reviewed SQL surface and was not
tried. **T3** falls with a Node flag in the container's start line (a smaller young generation, or an
earlier old-generation collection), which is a deployment change and not an application one.

## Verdict

**GO for milestone 3 at the sizes the product has today and the brief's typical size** (T1 and T4 are
met with a wide margin, the owner's own organisation is "hundreds of activities", and one plan exports
in under 3 seconds). **The two upper-bound thresholds, T2 and T3, are borderline by extrapolation and
are the owner's call**, not mine: the plan says to stop and bring the options in D3 if a threshold fails,
and these sit within 10 % of theirs on an extrapolation. Recorded for that decision:

1. **Accept** the upper bound as it is: 4 to 5 minutes and about 540 MB resident at 100 plans × 2,000
   activities is 50 to 100 times the owner's organisation, the export is a rare act by one person, and
   nothing is stored or queued. The transaction ceiling is set to cover it (10 minutes).
2. **Tune** by deployment: a Node flag for T3, nothing for T2.
3. **Build the single-read variant** (a worker thread for the CSV pass), which roughly halves T2. It is
   D3's second rung and is a separate piece of work.

What this changes elsewhere: ADR-0194 D3 now carries these figures and the two rows below. The
`docs/specs/organisation-export/feature-spec.md` §3 estimates are annotated with the measured sizes.
Debt rows **#515** (a browser `Blob` for a ZIP of 300 to 450 MB) and **#516** (the export reads every
table twice, and what happens on a multi-organisation server) carry the triggers.

## What was not measured

- **A hundred-plan export.** The fixture is 10 plans (273 k rows, 331 MB); everything at the upper bound
  is the model above. A real run needs about two and a half hours of seeding on this machine.
- **The brief's link density.** The fixture has 1.6 links per activity; the 4-per-activity rows are
  modelled by the per-row cost of a `dependencies` row.
- **A client on a slow link.** The client here reads as fast as it can; a slow one holds the snapshot
  open for as long as it takes (the 10-minute ceiling is the bound), and proxy behaviour (the web nginx,
  Cloudflare) is the owner's own check in milestone 4.
- **The owner's server.** Different hardware, a real network and a Postgres with warm and cold caches.
- **`work_mem`, vacuum and replication effects of a long-held snapshot** on a busy server. The snapshot
  is open for as long as the export runs (24 s here, minutes at the upper bound).
