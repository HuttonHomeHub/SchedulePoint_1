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
