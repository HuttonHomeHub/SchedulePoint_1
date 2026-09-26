# M0 measurement: zero-duration tasks (#384)

What M0 of [the plan](./implementation-plan.md) ran, and what it found. Every figure here was
produced by a command named beside it; nothing in this file is a reading of the code.

## M0-T7: `check:engine-parity`

### The oracle for the row-lookup extraction

`NOT_ITEMS`, `rowNumber` and the two-level `sections` merge moved from `check-debt-status.mjs` into
`scripts/lib/doc-register.mjs` (`registerSections`, `detailedRows`, `openDetailedRow`, and
`statusToken`, which A2 and the new gate share). There is no `check-debt-status.test.mjs`, so the
oracle is two things, both run:

1. `node scripts/lib/doc-register.test.mjs` passes with its existing 28 cases **unedited** (the diff
   removes no line of that file; three new cases were added below them, 31 in all).
2. `node scripts/check-debt-status.mjs --report` prints byte-identical output before and after
   (`cmp` of the two captures), on two registers:
   - the real `docs/TECH_DEBT.md`: exit 0, identical;

     ```text
     check:debt-status — REPORT ONLY (not yet armed; see M4)
     158 detailed rows (158 with a status, 0 without), 43 compact-table rows, 180 ledgered, 3 section headings.

     check:debt-status: OK. 158 detailed rows (158 with a status, 0 without), 43 compact-table rows, 180 ledgered, 3 section headings.
     ```

   - a copy carrying five faults, one per assertion family (#384's status line removed, #385 at
     `##`, #388 renumbered to 387, #389's status `closed`, #390's heading annotated `RESOLVED`),
     run from a scratch tree holding the pre-change script and module and a scratch tree holding the
     post-change ones: exit 1 from both, identical. A clean register is a weak oracle for a parser
     that has to find faults, which is why the second run exists.

     ```text
     ✗ A9: the parser sees 158 numbered rows but the raw document declares 157 column-0 **Status:** lines. Some row has no declaration of its own — A1 names it.
     ✗ A10: "## 385. A cross-plan successor may start on the day its upstream finis" is not in the canonical row form. …
     ✗ A1: docs/TECH_DEBT.md:11712 "384. A zero-duration task and a finish milestone at the same" has no **Status:** line.
     ✗ A2: docs/TECH_DEBT.md:11758 status "closed" is not one of open / deferred / standing / unverified. …
     ✗ A3: docs/TECH_DEBT.md:11768 heading is annotated "RESOLVED". …
     ✗ A4: row number 387 is used twice — docs/TECH_DEBT.md:11736 and :11747. …
     check:debt-status: FAIL — 6 finding(s). 158 detailed rows (157 with a status, 1 without), …
     ```

### The gate's mutation sweep

`scripts/check-engine-parity.test.mjs` (14 cases) runs the real `runGate` against throwaway git
repositories. Each mutation below was applied to the gate or the shared module, the suite run, and
the file restored; the suite was green again afterwards.

| Mutation                                                  | Cases that went red                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| M1 limb 2 compares nothing (`normaliseSpec` returns `''`) | (1) `expect` changed beside a docblock edit                             |
| M2 limb 2 compares raw text (no `stripComments`)          | (2) docblock-only edit; both blind-spot pins                            |
| M2b limb 2 strips but keeps blank lines                   | (2) (its docblock grows by a line and a `//` line is added)             |
| M3 limb 1 removed                                         | (3) one character in `compute.ts`; the added-snapshot case              |
| M4 limb 3 removed                                         | (4) row absent; (6b) row `deferred`                                     |
| M5 new-spec exemption removed                             | (5) a new engine spec file                                              |
| M6 `registerSections` reads `sections(md, 2)` only        | (6) #384 in its real `###` form, and every case that needs limb 3 green |
| M6b `openDetailedRow` ignores the status                  | (6b)                                                                    |
| M7 "skipped" when the engine diff is empty                | the pinned positive case; (4); (6b)                                     |

M6 is the devops-reviewer O1 finding made concrete: under a level-2-only lookup the gate calls its
own declaration stale on a fixture holding #384 exactly as `docs/TECH_DEBT.md:11712` writes it.
The three new `doc-register` cases were also run against M6 and M6b and went red.

### Wiring

- `pnpm check:ci-roster` with the `package.json` script and no CI step:
  `✗ check:engine-parity is a root check:* script and runs in no CI step.` (exit 1). With the step
  after "Check the frontend-only boundary": `OK. 21 check:* gates, 20 in CI` (exit 0).
- `scripts/prepush.sh` derives its roster from `package.json`'s `check:*` keys, so the gate runs
  there with no edit to that file.
- On this branch: `check:engine-parity: OK. checked 44 engine files for "zero-duration-task"
(#384): 0 changed since origin/main, 0 existing spec(s) compared.`
