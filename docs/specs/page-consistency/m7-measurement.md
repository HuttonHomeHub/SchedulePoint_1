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
stop early — against CLAUDE.md §15's 200 ms budget, on a tenant roughly **190× larger than this
entire installation** (which holds 124 clients across 2 organisations). A candidate partial
composite was measured and saves ~0 ms for 1,768 kB. Recorded as _the agent was run and said no
change_, which §19.3 treats as a different fact from _the agent was not run_.

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
