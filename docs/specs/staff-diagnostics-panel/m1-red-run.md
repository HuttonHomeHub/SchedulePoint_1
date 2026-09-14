# M1's red run — the gates, against code that does not exist

- **Status:** Approved
- **Date:** 2026-09-13

ADR-0140 D4 puts the gates before the code, and the reason is narrow: `$queryRaw` matches none of
the accessor strings `staff-boundary.structural.spec.ts` forbids, so choosing raw SQL and noticing
later would be exploiting a blind spot and calling it compliance. A gate written **after** the code
it governs can only ever prove the code is currently fine. This file is the record that these were
written first, and it exists because the red state is gone the moment M2 lands.

## S-3 — the widened boundary gate, verified red against four named mutations

Each mutation was applied to a real file, the suite run, and the file restored. The mutation is
named because ADR-0110 D5's rule is that a gate is finished when the defect it was written for has
made it fail — not when it passes.

| #   | Mutation                                                 | Result                                                                                                                                                                   |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | a `$queryRaw` call appended to `staff-probe.service.ts`  | `× runs no raw SQL outside the one declared exception` — `staff-probe.service.ts → $queryRaw (not a declared exception)`                                                 |
| 2   | a `$queryRawUnsafe` call in **the excepted file itself** | `× …` — `staff-diagnostics.repository.ts → $queryRawUnsafe (no exception exists)`. The exception is for `$queryRaw` only; string-built SQL has no exception at any path. |
| 3   | the exception's reason emptied to `''`                   | `× makes every raw-SQL exception carry a reason` — `expected 0 to be greater than 80`                                                                                    |
| 4   | `rawSqlOffenders` made to `return []`                    | `× has a non-empty population, and catches an offender when it sees one` — `expected [] to have a length of 3`                                                           |

**Mutation 4 is the one worth keeping.** The first version of the pinned positive asserted that
_this file_ contains the three banned strings — which is circular, because they are here as data, so
it passes whatever the scan actually does with them. Separating the predicate from the files it runs
over is what makes the positive case mean something: it is fed three synthetic offenders and a
fourth synthetic source that only **mentions** `$queryRaw` in a comment, and must catch exactly
three. That fourth case is the scan-matching-its-own-documentation trap, which four gates in this
repository have shipped.

### A second exception, added in M2 and recorded rather than absorbed

`staff-diagnostics.repository.spec.ts` trips the gate: its Prisma stub **declares** a `$queryRaw`
property. It calls nothing, and in a unit test no client exists to call — but the scan reads source
text and cannot separate a mock from a query.

That left two moves, and the one not taken is the finding. Narrowing the rule to exclude `.spec.ts`
files would have been **weakening a gate to land the change that tripped it** — the exact failure
the S-1 pinned positive is written against, one file over — and the gate covers tests deliberately:
a spec importing `PlanRepository` to build a fixture has put that import in the module, and only
luck keeps it out of the shipped path. So the narrower move: one more file named **by path**, with
its reason inline. Every other file still fails, and the import assertion covers this one unchanged.

## S-1, S-2, S-4, S-5 — red because their subject does not exist

`vitest run src/modules/staff/staff-diagnostics.structural.spec.ts`, on the M1 tree:

```text
Tests  7 failed | 3 passed (10)
```

Seven assertions over real source, all red:

```text
× declares every property as number, except the two registry literals
    dto/staff-diagnostics.dto.ts must exist — these gates govern it: expected false to be true
× has no index signature, which would make the shape open again
× declares no input decorator
    the diagnostics handler must exist: expected -1 to be greater than or equal to 0
× projects nothing but aliased count expressions
    staff-diagnostics.repository.ts must exist — these gates govern it
× interpolates nothing — the query takes no parameters, so injection is structural
× declares the entry type with exactly the closed key set
    staff-diagnostics.registry.ts must exist — these gates govern it
× exports the registry frozen, so an entry cannot be added at runtime
```

**A missing file is a failure, never a skip**, and that is a decision rather than an accident: a
gate that quietly passes while its subject does not exist would make this whole ordering pointless,
and is how M2 could have shipped with a gate that had never once run against anything.

**Three passed, and they are the pinned positives** — each over a synthetic source, so they prove
the predicates work _before_ the code exists rather than after:

```text
✓ catches a non-numeric property when it sees one      (planName: string, capturedAt: Date)
✓ catches an input decorator when it sees one          (@Query())
✓ catches a projected column when it sees one          (, a.name)
```

Those three are §4.4's table read back: the mutations the spec named as the red-verification for
S-1, S-2 and S-4 are the assertions themselves, run against synthetic input, so they are permanent
rather than a note in a file like this one.

## What this does NOT establish

The gates hold the **shape**. They cannot tell whether the SQL is correct, whether the counts mean
what the labels say, or whether the route is reachable — that is M2's API e2e and M3's journey.
Nor can S-3 see a raw query reached through a helper defined in another module: it reads source
text, and that blind spot is stated in its own docblock rather than implied.

---

## The M4 gate pass — six specialists, five blocked, sixteen defects

Recorded here rather than in a commit message because the list is the useful part: **every one of
these passed a human read**, and four of them passed a green test suite that was asserting the right
thing about the wrong world.

### Reached independently by more than one reviewer

| Defect                                                                                                                                                                                                                                                                                                                     | Found by                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **The throttle ADR-0140 D7 decided was never implemented.** The handler inherited 30 / 60 s while the ADR, the plan and `m0-measurements.md` all asserted 6 — and `staff-throttle.structural.spec.ts` asserted `@Throttle` appeared _exactly once_, so the override three documents described was **forbidden by a gate**. | api, security, backend-performance |
| **A failed re-run rendered the previous numbers under an error saying there were none.** `@tanstack/query-core`'s error reducer spreads the prior state and never clears `data`, so `result = query.data` survived both a failure and an in-flight refetch. The panel's own docblock promised the opposite.                | component, ux, accessibility       |
| **Copy stayed live mid-refetch**, closing over the superseded reading — so an operator could paste last run's numbers into a measurement record believing them current.                                                                                                                                                    | component, ux                      |

### Found once, and each a real defect

- **D-B was never costed, and it is the expensive half** — 240–245 ms of a 327 ms press, against a
  sibling entry that got a committed falsification condition, three fixture variants and an index
  probe. It was scoped out because a planning document described it as joining no resource tables,
  which the shipped query does. (backend-performance)
- **D-B contradicted the spec's own F2 ruling.** Its `AND c.deleted_at IS NULL` excluded exactly the
  activities the diagnostic exists to find whenever a plan's calendar had been soft-deleted —
  while the sibling query's unfiltered join is documented as correct for that same reason.
  (test-engineer)
- **The diagnostic's own premise was unwitnessed.** Every `drive()` call hard-coded
  `isDriving: true` and nothing was ever unassigned, so `ra.is_driving = true` and
  `ra.deleted_at IS NULL` — the two clauses that make this "the DRIVING resource's calendar" rather
  than "any resource's" — could both be deleted with the suite green. (test-engineer)
- **Two structural assertions could not fail.** "Exports the registry frozen" was a whole-file
  `toContain('as const')` satisfied by two unrelated declarations — one of which this milestone
  added, taking the check from weak to vacuous without anybody touching it. "Declares the entry type
  with exactly the closed key set" checked presence and not absence, under a docblock claiming a
  widened type "cannot pass unremarked". (test-engineer)
- **The focus test could not fail either.** `refetch` is a bare spy that never flips `isFetching`,
  so the relabel it claims to prove never happened and the assertion held because nothing did.
  (test-engineer)
- **The clipboard rejection said nothing at all** — no visible change, nothing in the live region,
  on a browser that refuses clipboard access, which is an ordinary configuration (WCAG 4.1.3).
  (accessibility)
- **"1 organisations"** on the commonest installation shape there is: the breakdown line was written
  inline in the component with a hard-coded plural, beside a sentence that singularised correctly
  through the pure model. (ux)
- **Nothing said what a non-zero count MEANS.** Both entries are retrospective — they size whose
  stored numbers changed meaning when a release landed — and neither the screen, the labels nor the
  pasted block said so anywhere. "17 of 1,284" reads as "17 activities are broken right now" to
  anybody who has not read ADR-0139. (ux)
- **`aria-disabled` with no visual shading.** Every other such control in the codebase pairs it with
  `aria-disabled:pointer-events-none aria-disabled:opacity-50`; this one had the attribute and no
  treatment, so a sighted mouse user got no cue before pressing a control that would do nothing.
  (component)
- **A comment's arithmetic went stale in the commit that invalidated it**: "eight routes … 240 a
  minute" became nine and 270 the moment this route landed. (security)

### Two things this pass got wrong, corrected by running rather than reading

- **The D-B rewrite that looked obvious.** Its plan shows a `Sort` node at
  `actual time=249.330..258.530` beside a 287 ms aggregate, which reads as two `count(DISTINCT …)`
  dominating the cost. Removing both saves **19 %** — that timing is inclusive of its 223 ms child.
  There is no cheap rewrite, and the hypothesis died in two minutes because it was measured.
- **The `deleted_at` witness that witnessed nothing.** Row 9 was built as "drive it with the crane,
  then drive it with the gang", assuming the second supersedes the first. It does not:
  `clearDrivingForActivity` sets `is_driving = false` and deletes nothing. The mutation stayed green
  and only running it showed that — so the row now _unassigns_ the crane, which is the one path that
  soft-deletes. Row 11 exists for the same reason one query along: D-B's copy of that clause cannot
  be moved by row 9 at all, because a `count(*)` over two joined rows is unchanged when one of them
  is discarded.

Every fix carries a regression test verified red against the specific defect it names, and each
mutation is recorded in the test's own comment rather than here. Three findings are filed rather
than folded (`docs/TECH_DEBT.md` #319 and the two below), with reasons.
