# M0 measurement: layout interchange

Taken 2026-09-24 against `7ed12976` (the branch after the approval and `conditions.md`, before any
layout code). Every figure names the command that produced it.

## M0-T1 — the NetPoint round trip, today

**Instrument:** `apps/api/test/layout-interchange.e2e-spec.ts`, run with
`npx vitest run --config vitest.e2e.config.mts --silent=false --reporter=verbose test/layout-interchange.e2e-spec.ts`
against the local `app_test` database. It seeds `plan:reference-netpoint-power-plant` with the real
seeder, exports through `GET …/interchange/export/xer` and imports through
`POST …/projects/:projectId/interchange/commit` into a second project, then compares per activity code.

| Quantity                     | Source     | Re-imported  | Verdict                       |
| ---------------------------- | ---------- | ------------ | ----------------------------- |
| Activities                   | 58         | 58           | kept                          |
| Project finish               | 2031-02-28 | 2031-02-28   | kept                          |
| Critical activities          | 12         | 12 (same)    | kept                          |
| Hand placements              | 58         | **0**        | **lost** (FC-1)               |
| Distinct rows                | 14         | **12**       | **lost**, repacked by phase 3 |
| Activities whose row changed | —          | **55 of 58** | **lost**                      |

The brief's four figures (58 placements lost, 14 → 12 rows, finish 28 Feb 2031, 12 critical) are
**confirmed**; they were inherited until this run. The test's FC-1 half is `it.fails` and reports as
an expected failure today; M3 turns it into `it`.

## M0-T2 — the UDF column lines

**None available.** The product owner has no P6 installation and supplied no P6-exported XER
containing a user-defined field (2026-09-24). M2 and M3 build the `UDFTYPE`/`UDFVALUE` lines from
Oracle's documented subset (spec §0.6), and FC-6 is recorded as **unobserved** (`conditions.md`).

## M0-T3 — can the API e2e import the NetPoint plan?

**Yes, directly.** `apps/api/test/layout-interchange.e2e-spec.ts` imports
`../../seed-cli/src/references/netpoint-power-plant.js`, and `tsc` over `apps/api`'s tsconfig accepts
it (no `rootDir` is set; `apps/api/tsconfig.json`). `apps/api/scripts/measure-finish-milestone.mts:31-32`
already did the same under vitest. No move into `@repo/seed` is needed, so the seed CLI is untouched.

## M0-T4 — foreign-file baseline and today's row overlaps

**Instrument:** the third case of `apps/api/test/layout-interchange.e2e-spec.ts`, judged against
`apps/api/test/fixtures/layout-interchange-m0-baseline.json` (written by hand from the first reading,
never regenerated). **Verified red** twice: mutating the NetPoint overlap count, and one hex digit of
the graph digest, each fails the case; restoring passes it.

**Scope departure, stated:** the plan asks for "every XER fixture imported by the existing e2e suites".
Those are small builders private to their own spec files, so the baseline uses the **torture fixture**
(`packages/engine-conformance/fixtures/p6_torture_test_v1.xer`, the only genuine P6 export in the
repository, 147 activities) plus the **NetPoint re-import**. FC-2's parity is pinned for the torture
file as a SHA-256 of the parsed import graph and of the report.

| Figure                                     | Value                                            | Stable?          |
| ------------------------------------------ | ------------------------------------------------ | ---------------- |
| Torture import graph (sha256)              | `2b64abaa…ba6e58c9`                              | yes (9 readings) |
| Torture import report (sha256)             | `f386b7a6…f6fa0aca`                              | yes (9 readings) |
| NetPoint re-import: activities overlapping | **2**                                            | yes (9 readings) |
| Torture import: activities overlapping     | **8, 23, 18, 14, 17, 16, 13** over seven imports | **no**           |

"Overlapping" uses the web's drawn span (visual-effective dates, finish milestone at the end of its
day), so these are overlaps a planner sees on the canvas immediately after an import. Both plans
open with some, which confirms spec §0.3's defect: phase 3 packs on **early** dates.

### A second defect the measurement found: phase 3 is not reproducible

One file, imported seven times, packs into seven different layouts. `findLayoutRowsForPlan`
(`apps/api/src/modules/activities/activity.repository.ts`) orders the packer's input by
`orderBy: { id: 'asc' }`, and activity ids are `@default(uuid(7))`
(`apps/api/prisma/schema.prisma`, model `Activity`): UUIDv7 carries random bits within one
millisecond, and an import creates its activities in the same few milliseconds. So the packer's
tie-breaks are decided by chance. The method's docblock says the order means the tie-breaks "never
depend on the database's scan order", which is true and does not make the result reproducible.

**Consequence for M1:** besides packing on the drawn span, phase 3 must order its input by something
the file determines (the activity code, with the source position as a tie-break), or FC-5 can pass on
one run and fail on the next. The torture count is therefore asserted only as "greater than zero"
until M1, not pinned.
