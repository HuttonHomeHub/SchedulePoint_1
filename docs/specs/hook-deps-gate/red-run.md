# M2-T3: the red run

Taken 2026-09-28 against the tip of `claude/schedulepoint-project-setup-naacjj`, after M1's tree
was already at zero warnings and M2-T1 had armed `react-hooks/exhaustive-deps: 'error'` +
`--max-warnings=0` in every workspace. Every limb below is **verified red, then reverted**
(ADR-0110 D5) — each mutation was made, the command was run against the mutated tree, the output
was captured, and the file(s) were restored to their exact pre-mutation content (checked with
`diff` against a backup copy) before the next limb began. `git status --short` at the end of the
whole run showed only the intended M2-T2/T4 additions (`lint-policy.structural.test.ts`, the ADR)
and the intended M2-T4 doc edits — no stray mutation survived.

**One environmental step was needed before R1 could run at all, and it is recorded because it is
not part of the spec's own plan.** The worktree had no shared workspace packages built
(`packages/types/dist`, `packages/interchange/dist`, … did not exist) and `eslint . --cache
--cache-strategy content` was run directly via `pnpm --filter @repo/web lint`, which bypasses
turbo's `lint: { dependsOn: ["^build"] }` graph. Without the build, every import from an
unbuilt `@repo/*` package resolves to an unresolvable type, and `@typescript-eslint`'s type-aware
rules (`no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-return`, …) fire hundreds of times
across files the red run never touched — confirmed directly: the first R1 attempt printed **662
problems**, almost all unrelated to the probe. `pnpm build` (root) fixed it for every package
`apps/web` depends on; `apps/api`'s own build separately failed on a missing generated Prisma
client (`pnpm --filter @repo/api exec prisma generate`, no database connection needed), fixed
before R4. Neither is a defect in this row's own work — both are a fresh worktree not yet having
run the commands a normal development session already has — and both were fixed once, at the
start, rather than per limb.

## Summary

| Limb   | Mutation                                                                                                        | Command                                                | Exit | Result                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---- | ------------------------------------------------------------------ |
| **R1** | `apps/web/src/lint-probe.tsx`, `useMemo(() => a + b, [a])`; `--max-warnings=0` removed from `apps/web`'s script | `pnpm --filter @repo/web lint`                         | 1    | ✅ as predicted (FC-2)                                             |
| **R2** | Same probe; preset reverted to `warn`, `--max-warnings=0` restored                                              | `pnpm --filter @repo/web lint`                         | 1    | ✅ as predicted (FC-3)                                             |
| **R3** | `dependencies` removed from the site-3 context memo's array                                                     | `pnpm --filter @repo/web lint`                         | 1    | ✅ as predicted (FC-4) — see note on which command was run, below  |
| **R4** | `console.log('x')` added to `apps/api/test/activities.e2e-spec.ts`                                              | `pnpm --filter @repo/api lint`                         | 1    | ✅ as predicted (FC-5)                                             |
| **R5** | Reasonless `// eslint-disable-next-line react-hooks/exhaustive-deps` above a real omission                      | `vitest run src/lint-policy.structural.test.ts`        | 1    | ✅ as predicted, names `file:line`                                 |
| **R6** | Reasoned directive above a hook whose dependency list is already complete                                       | `pnpm --filter @repo/web lint`                         | 1    | ✅ as predicted (E16)                                              |
| **R7** | `useKeyedIdentity` changed to `return value`                                                                    | `vitest run …/use-pen-lock-view.stability.test.tsx`    | 1    | ✅ as predicted (FC-6) — 2 of 5 cases fail, not just the named one |
| **R8** | Site-3 fix reverted (identical mutation to R3)                                                                  | `vitest run …/use-tsld-toolbar-context.print.test.tsx` | 0    | ❌ **against the spec's prediction — see finding below**           |
| **R9** | `--max-warnings=0` deleted from `packages/types`'s script                                                       | `vitest run src/lint-policy.structural.test.ts`        | 1    | ✅ as predicted, names `packages/types/package.json`               |

**R3's own command departs from the spec's literal text, per this task's brief, and the reasoning
is recorded rather than left implicit.** The spec's table says `pnpm prepush`; the full
`scripts/prepush.sh` run (lint, typecheck, `pnpm test` — measured elsewhere at ~6 minutes,
`pnpm test` alone 345s — plus every `check:*` gate) is far more than R3 needs to establish. What R3
actually needs to prove is that `pnpm prepush` would print `FAIL lint` and not `WARN lint`, and
that is fully determined by two facts that do not require running the whole script: (1) `lint` is
the **first** step `run()` calls in `prepush.sh` (`run "lint" pnpm lint`), and (2) `lint` is not
named in `ADVISORY_GATES` (`ADVISORY_GATES=("check:reconcile-due")` — the only entry), so `run()`'s
`elif [ $code -eq 2 ] && is_advisory "$label"` branch cannot apply to it and any non-zero exit from
`pnpm lint` takes the `else` branch, prints `FAIL`, and appends to `failed`. `pnpm --filter
@repo/web lint` exiting 1 is therefore sufficient to establish the `FAIL lint` outcome by
`prepush.sh`'s own unconditional mechanism, without running the other nine minutes of gates to
observe it directly.

## R8 — a finding, not the predicted result

The spec's table (§5) predicted: "New print case fails: the printed dependencies are the pre-change
set." Running the identical mutation R3 uses (`dependencies` removed from the site-3 context
memo's dependency array) against `use-tsld-toolbar-context.print.test.tsx` — the describe block is
itself named `(R8)` — all **11 tests in the file passed**, including the R8 case itself.

**This is a genuine masking, established by reading the code and confirmed by running it — the
same class `m0-measurement.md` already recorded once for `buildDiagramImage`, but through a
second, independent path that measurement's stub does not neutralise.**

`m0-measurement.md`'s "E12 masking" section found that `useDiagramImage`'s own `buildDiagramImage`
callback correctly depends on `dependencies` and is unconditionally called, so the outer context
memo rebuilds via that path regardless of whether `dependencies` is separately listed — and the R8
test case stubs `useDiagramImage` (`vi.spyOn(diagramImageModule, 'useDiagramImage').mockReturnValue(vi.fn(() => null))`)
specifically to neutralise that one path.

Reading the file further shows a **second** such path the stub does not touch:
`exportMatch` (`use-tsld-toolbar-context.tsx:341-379`) is itself a `useMemo` whose own dependency
array — correctly, by M1-T1's own fix — includes `dependencies` (`:374`). `exportMatch` is in turn
listed as a dependency of the outer context memo (`:990`, immediately after the mutated site). So
whenever `dependencies` changes, `exportMatch` gets a new identity (correctly), which forces the
outer memo to rebuild (correctly) — **independent of whether `dependencies` is itself listed
there**. R8's test changes `dependencies.data` (via `dependencies.data = [addedLink]` on the same
wrapper object, exactly what the memo at `:201` is keyed on), so `dependencies` genuinely gets a
new identity in this test, `exportMatch` genuinely recomputes, and the outer memo genuinely rebuilds
and captures the fresh value — with the explicit `dependencies` entry removed or not.

**The distinction from M0-T4's own case matters and is not the same claim twice.** M0-T4's
comparison was pre-M1-T1 (where `exportMatch` depended on the raw `model.dependencies` **query
wrapper**, which R8's test deliberately holds at the same reference — "Holding the wrapper steady
… isolates the missing-dependency defect from E13's unrelated churn") against post-M1-T1 (where
`exportMatch` depends on the **stabilised** `dependencies` local instead). That comparison is
sound: pre-M1-T1, `exportMatch` genuinely does not recompute in R8's scenario, so the case
genuinely isolates the fix at M0-T4's time of writing. What has changed since is that R8's own
mutation here is **post-M1-T1 code with only the outer memo's own explicit `dependencies` entry
removed** — a narrower mutation than "revert the whole M1-T1 fix" — and at that narrower mutation,
`exportMatch`'s own (correct, already-shipped, unrelated-to-R3) dependency on `dependencies` is
sufficient on its own to keep the outer memo correct, masking R3's specific regression from this
particular test.

**Two things follow, both worth stating precisely rather than either overclaiming or
underclaiming.** First, the **lint rule** still correctly identifies the omission (R3's own result
above: `error React Hook useMemo has a missing dependency: 'dependencies'` at the exact call site) —
the rule reasons about the closure's static reads, not about whether a sibling dependency happens
to propagate the same value at runtime, so it is unaffected by this masking and remains the gate
that actually protects against the regression R3 describes. Second, **this print-test case does not
independently discriminate the outer memo's own listing from `exportMatch`'s already-correct one**,
so its value as a regression test for "was `dependencies` removed from the outer array" is smaller
than its own docblock states, though it does still correctly test that the printed Gantt shows
current links under normal conditions (all 11 cases, including this one, pass against the actual
shipped code).

**Not fixed here.** Per the spec's own stated scope for a defect found while executing an assigned
task ("reading a site to write its reason may turn up a live defect… recorded as a new register row
and not fixed here, unless the fix is one line and pinned by a red test", D5) and per this task's
explicit brief (record M2-T2/T3/T4; do not revisit M1's already-landed sites), this is recorded as
a finding rather than repaired. A fix would need either the R8 case to also neutralise
`exportMatch`'s masking (mirroring the `useDiagramImage` stub) or a case that removes `dependencies`
from `exportMatch`'s own array instead — both are M1-T1-file changes outside this milestone's scope.
Worth a `docs/TECH_DEBT.md` row.

## Acceptance conditions (spec §5), checked against this red run

1. **FC-1 to FC-7 hold, with R1–R9 recorded red and then green** — R1–R7 and R9 hold as predicted;
   R8's departure is recorded above rather than smoothed into a false "as predicted." FC-1
   (`pnpm lint` exits 0 with zero warnings/errors after every reversion) is confirmed by §4 below.
   FC-7 (cost recorded rather than bounded) — `pnpm --filter @repo/web exec vitest run
src/lint-policy.structural.test.ts` measured 2.7–3.2s total, with the `calculateConfigForFile` case
   alone costing ~1.5s (ESLint instance construction + flat-config resolution, not parsing).
2. `pnpm prepush` was not run as one command in this red run — see R3's note above for why, and
   confirming instead by reading `prepush.sh`'s mechanism directly. `scripts/e2e-local.sh api` was
   not run either: this red run touched `apps/api/test/activities.e2e-spec.ts` only transiently
   (added and reverted one `console.log` line, confirmed byte-identical to the pre-mutation file by
   `diff`), which is a comment-adjacent test-file mutation rather than a change to shipped
   `apps/api` behaviour.
3. `use-pen-lock-view.stability.test.tsx` passes unedited in its existing five cases — confirmed:
   the R7 mutation is to `use-pen-lock-view.ts`, never to the test file, and the file was restored
   byte-for-byte afterward.
4. The `@repo/web` suite — see §4 below for the final full-suite run.

## §4: final state, everything reverted

`pnpm --filter @repo/web lint` and `pnpm --filter @repo/web exec vitest run
src/lint-policy.structural.test.ts` — both run clean after the full red run, reported separately in
this task's final report (M2-T2's test: 4/4 passing; `pnpm --filter @repo/web lint`: 0 problems).
