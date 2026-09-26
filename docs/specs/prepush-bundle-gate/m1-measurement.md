# M1-T1: what the root gate costs

- **Date:** 2026-09-26
- **Machine:** the Claude Code cloud container (4 cores, `nproc`), the same kind that took the
  spec's first readings.
- **Tree:** the M1-T2 commit (`41e554b7`), i.e. with `check:web-bundle` in the root
  `package.json` and `bundle-report.json` declared in `turbo.json`'s `build.outputs`.
- **Ceilings (committed in the spec before any reading):** FC-1 cold median ≤ 60 s; FC-2 warm
  median ≤ 10 s with a turbo cache hit.

## Readings

Each figure is the wall clock of the whole command, measured with `date +%s.%N` either side.

| Case                   | Command                                                                            | Samples (s)         | Median     | Verdict     |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------- | ---------- | ----------- |
| FC-1, cold             | `TURBO_FORCE=true pnpm -s check:web-bundle`                                        | 21.17, 16.59, 16.75 | **16.8 s** | PASS (60 s) |
| FC-2, warm             | `pnpm -s check:web-bundle`, after one untimed warm-up run, no edits between        | 1.55, 1.64, 1.52    | **1.5 s**  | PASS (10 s) |
| Reference (not judged) | `pnpm -s --filter @repo/web build && pnpm -s --filter @repo/web check:bundle-size` | 10.99, 11.69, 11.22 | 11.2 s     | —           |

The spread on FC-1 is 4.6 s against a 43 s margin to the ceiling, so the verdict is not
indeterminate (ADR-0128).

**FC-2 is a real cache hit, end to end.** Every warm run printed `Cached: 6 cached, 6 total` and
`>>> FULL TURBO`, and every one began by deleting `apps/web/bundle-report.json` (that is the
gate's first clause). The check then read a report, so the report came from turbo's cache. Before
M1-T2 the same warm run left no report and the check failed asking for a build (the spec's first
readings, 2026-09-26). Both states are therefore recorded: undeclared, a hit cannot feed the
check; declared, it does.

**The reference figure is lower than FC-1 and is not a cheaper option.** It runs `tsc --noEmit`
and `vite build` in `apps/web` only. It builds none of the `@repo/*` packages the bundle imports and
bypasses turbo, so it measures neither the cold case nor the warm case prepush will meet.

## What the gate adds to prepush

About **17 s cold** on a command measured at about **six minutes** (`docs/TESTING.md`, "Before you
push"), and about **1.5 s** when the web app and its packages are unchanged since the last build on
the machine.

`apps/web/bundle-budget.json` was byte-identical after every run (`git diff --exit-code`): the
gate reads the budget and never writes it.
