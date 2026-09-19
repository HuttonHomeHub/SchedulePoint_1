# FC-9's runs, and the one count it withdrew

Two judged runs. **Run 1 is not kept as a verdict** — it reported `FAIL` on three limbs and one of
the three was the harness's own fault, which is exactly why the raw output of a superseded run is
worth a paragraph rather than a file.

## Run 1 — two real findings and one instrument fault

- `fatClient / client.planCount` → **`Seq Scan on plans, projects`, 8.79 ms**. Real, and the
  crossover `database-architect` predicted at 75–100 projects under one client.
- `fatProject / project.activityCount` → **25.37 ms p95, added total 25.80 ms** against a 25 ms bar.
  Real, and marginal.
- **The clients LIST plan reported `Seq Scan on clients` — and the table held SIX rows.** A
  sequential scan is obviously the right plan at that size. The dilution guard this harness
  deliberately carries covers `projects`, `plans` and `activities` and did not cover `clients`, so
  limb (b)'s regression assertion was grading the harness and would have been reported as a product
  regression. Same fault the guard exists for, one table over.

Two changes followed, and both are measurement corrections rather than adjustments to the bar:

1. **`clients` is diluted too**, to 8,000 rows — the size `client.repository.ts`'s own escalation
   trigger names, so the list is graded at a size somebody had already decided was interesting.
2. **`VACUUM (ANALYZE)` before the judged pass**, with the un-vacuumed figures printed beside it.
   An index-only scan is only index-only to the extent the visibility map says a page is
   all-visible, and a freshly bulk-inserted table has no bits set, so run 1 measured the worst state
   a table is ever in. `database-architect` could not establish the heap-fetch count at all (its
   probes ran inside an uncommitted transaction) and left it for a harness that commits and can
   vacuum. Both ends are now on the page, because the true cost moves between them: every
   recalculation dirties every activity row in a plan (ADR-0144 §8).

## Run 2 — `fc9-run-2.md`, the judged one

| Limb                                        | Result                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| (a) route p95 < 50 ms                       | **PASS** — worst 29.0 ms (`fatProject`, project detail)                 |
| (a) added p95 ≤ 25 ms                       | **PASS** — worst 22.39 ms (`fatProject`)                                |
| (b) no `Seq Scan` on a child table          | **FAIL on exactly one count** — see below                               |
| (b) the clients LIST keeps its keyset index | **PASS** — `Index Scan using clients_organization_id_created_at_id_idx` |
| (c) estimate < 100,000                      | **PASS** — worst 1,851                                                  |

The vacuum moved `typical / project.activityCount` 3.18 → 0.83 ms and `fatClient / client.planCount`
12.78 → 4.12 ms, and took the added total under its bar. It did **not** change a plan shape, which
is the point: limb (b) is about what Postgres chooses, and vacuuming changes what a choice costs.

## The one failure, and what was done about it

`client.planCount` at the `fatClient` shape — 500 projects under one client, 2,000 projects in the
table — plans as **`Seq Scan on projects`** feeding an `Index Only Scan (uq_plans_project_name)`.
4.12 ms today, and **O(projects in the installation)** rather than O(this client), which is the
property limb (b) exists to refuse. Milder than the architect's prediction (they measured a
`Seq Scan on plans` at a 76,817-plan estate; here the plan side stays index-only and it is the
project side that gives way) and the same defect: the count stops being bounded by its subject.

**FC-9's withdrawal clause is applied to the count that failed, and that is an amendment, made in
writing, not a softening.** The clause as committed reads "the counts are withdrawn", all four; three
of the four are index-only at every shape, at 0.10–0.29 ms, with nothing to withdraw them for. So
`client.planCount` goes and the other three stay, and this paragraph is the re-argument the clause
explicitly permits in place of quietly relaxing the bar.

The consequence on screen is small and worth stating: a client's detail header says
"4 projects" rather than "4 projects · 11 plans across its projects". The primary fact survives; the
two-level one, which was also the awkward one to word, does not.

**Two remedies exist and neither was applied here.**

- A **query-shape** change — resolve the client's project ids first and pass them as an array, which
  forces the bitmap path (`database-architect` measured 0.232 ms against 2.85 ms). Its own cost is an
  unbounded `IN` list, bounded only by how many projects one client holds.
- A candidate **`projects (client_id) INCLUDE (id) WHERE deleted_at IS NULL`** index, which would
  make the project side index-only. Unlike ADR-0144's rejected index this would **not** spend the
  HOT-update exemption, because `projects` is not rewritten by recalculation — but it is an index,
  and every index in this repository goes through `database-architect` (CLAUDE.md §19.3), which is a
  round this milestone did not have room for.

Filed as `docs/TECH_DEBT.md` with both options and a trigger, rather than guessed at now.
