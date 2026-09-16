# M7 — Clients search: the cost, and why it does not reopen FC-2

- **Taken:** 2026-09-16, 1646 × 1000, same fixture (123 clients / 81 calendars / 80 resources).
- Before: `m0-density-1646.json`. After: `m7-density.json`.

---

## 1. The chrome cost, which was predicted and is now measured

| Screen      | before | after   | delta   | rows in the first screen |
| ----------- | ------ | ------- | ------- | ------------------------ |
| **clients** | 180    | **240** | **+60** | **16 → 15**              |
| calendars   | 304    | 296     | −8      | 14 → 14                  |
| resources   | 276    | 268     | −8      | 14 → 14                  |
| members     | 269    | 269     | 0       | 1 → 1                    |
| audit-log   | 414    | 382     | −32     | 9 → 10                   |

**The spec predicted ≈ 270 px and "16 rows → ~14"** (feature-spec §7, repeated in §4.8 and in
`falsification.md`). Measured, it is **240 px and one row**. The prediction was pessimistic by 30 px,
and it is recorded rather than quietly replaced — a prediction beaten is still a prediction that was
wrong, and the reason is worth knowing: clients' bar carries a search field and `Clear filters` and
**not** the two `<Select>` controls that make the calendars and resources bars taller.

## 2. Why this does not reopen FC-2, and why judging it here would be perverse

The spread across the five tabular screens is now **142 px** (240 → 382), against 234 at M0 and 210
at M3. **FC-2 stays withdrawn.** It was judged at the point its own plan named — the M3 boundary,
before M7 — it failed, and its bar fired. `falsification.md` refuses re-judging it after a later
milestone in as many words, and this is precisely the case that rule was written for.

It is worth being explicit about _why_, because the number looks like an improvement and is not one:
**M7 narrows the spread by making the best screen worse.** Clients was the floor at 180; adding
60 px to the floor closes the gap without giving a single reader a single extra row anywhere — and
it costs the one screen that had the most rows one of them. A condition that would score that as
progress is measuring the wrong thing, which is the same lesson M4 learnt about `lastCellX`.

The product owner chose this capability knowing it adds chrome (CQ-1, answered "build it inside this
epic"). It buys taking 123 rows to 3, which is not a quantity FC-2 was ever written to see.

## 3. What was built, and the one thing that was not

**No index and no migration.** `database-architect` was engaged per §19.3 and answered no change,
having re-measured for clients rather than inheriting ADR-0053 M4's figures: **3.6 ms** at that
ADR's own 5,000-row ceiling for a term matching nothing — the worst case, since `LIMIT` can never
stop early — against CLAUDE.md §15's 200 ms budget, on a tenant roughly **40× larger than this
entire installation** (which holds 124 clients across 2 organisations). A candidate partial
composite was measured and saves ~0 ms for 1,768 kB. Recorded as _the agent was run and said no
change_, which §19.3 treats as a different fact from _the agent was not run_.

**Two corrections from the M8 gate, both to this paragraph rather than to the decision.** It read
**190×** in two places, here and in `client.repository.ts`; 5,000 / 124 is **40×**, an arithmetic
slip in a checkable number, which is the class §19 asks to carry its evidence. And it justified the
cost with "a bitmap scan bounded to one tenant" — a sentence inherited from ADR-0053 M4, true of
**that** measurement's table composition (target tenant at 20.8% of the table) and not of this one.
Independently re-measured by **backend-performance-reviewer** on a clean Postgres 16: the planner
seq-scans the **whole table** while the tenant is a majority share, and only takes the org-bound
bitmap plan below roughly a 25–33% share — and the deployed database is in the seq-scan regime
today, one org holding 123 of 124 clients. The verdict is unchanged and now rests on the right
thing: 2.34 ms (100% share, seq) → 6.97 ms (33%, seq) → 2.53 ms (25%, bitmap) → 2.68 ms (10%,
bitmap), every point two orders inside the budget, and the candidate index changes nothing in
**either** regime. The trigger is phrased on a single org's row count rather than on a plan shape,
which is why it survives the correction.

**The escalation trigger, should it ever fire:** a single organisation past ~2,000 active clients,
or the list's p95 past ~20 ms. The remedy is `CREATE EXTENSION pg_trgm` and a GIN index on
**`name`** — **not** `lower(name)`, which cannot serve this predicate at all. That correction is
`docs/TECH_DEBT.md` **#336**, and it applies to calendars and resources today.

**The API mirrors `calendarSearchWhere` exactly**: a spreadable fragment rather than an `OR`, so it
composes with the soft-delete and org-scope terms instead of replacing them. That composition is
what the API e2e case asserts — a soft-deleted client must not return through the search — because
a repository-level unit test of the fragment alone structurally cannot see it.

**`archivedFilterWhere` is deliberately not copied**: `Client` has no `archived_at`. Nor is the
resources branch's `code` term: clients have no code.

**The query is keyed by the term**, so a searched view and the full list are separate cache entries.
That matters because this query is not the Clients screen's alone — the navigator rail, the
breadcrumb resolvers and the pickers all read it, and none of them should inherit somebody's search.
Absent `q` ⇒ the same key, the same URL, the same cached list as before.

### The census gate caught it, which is the gate working

ADR-0123's Gate B failed on `routes/clients.tsx` the moment the route read a search param: _"these
read a search param and nobody has said where the real parser is crossed on their behalf"_. It is
classified now with a sentence. Nothing was wrong — the route reads `q` through `pickText` like
every other `q` on this surface — but the gate's whole point is that **nobody gets to add a
seventh undeclared param silently**, and it held.
