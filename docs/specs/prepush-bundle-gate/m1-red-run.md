# M1-T3: the gate fails on the defects it names

- **Date:** 2026-09-26
- **Tree:** the M1-T2 commit (`41e554b7`). Every scratch change below was reverted before the
  next, and `git status` was clean afterwards.

A gate is finished when the defect it names has made it fail (ADR-0110 D5). Each run records what
the gate printed, not only its exit status.

## 1. FC-3: an inflated bundle fails prepush

Scratch change: `import 'jspdf';` as the first line of `apps/web/src/main.tsx`.

- **`pnpm prepush`** (the full gate): lint, typecheck, test and the 19 other `check:*` gates `ok`, then

  ```text
    FAIL  check:web-bundle
          check:bundle-size: FAIL — 2 finding(s). entry graph 564.81 kB of 457.00 kB gzip (+129.99 kB since the floor was measured), …
  FAILED: check:web-bundle
  ```

  and **exit 1**. The two findings are B1 and B2:

  ```text
  ✗ the entry graph is 564.81 kB gzip, over the 457.00 kB budget by 107.81 kB.
  ✗ jspdf is in the ENTRY GRAPH. It is an export-path library and must stay behind a dynamic import …
  ```

- **`scripts/prepush.sh --checks`**: the same `FAIL  check:web-bundle` with B1 and B2, exit 1.

`FAIL`, not `WARN`. **PASS.**

## 2. US-1: a type error fails, not warns

Scratch change: `export const __redRun: number = 'not a number';` appended to `main.tsx`.

`scripts/prepush.sh --checks` printed `FAIL  check:web-bundle` with
`src/main.tsx(22,14): error TS2322` and `run failed: command exited (2)`, and exited 1. The web
build runs `tsc --noEmit`, which exits 2 on a type error, and turbo propagated the 2. Because
`check:web-bundle` is not in `ADVISORY_GATES` (ADR-0124), exit 2 blocks. **PASS.**

## 3. US-2: a stale report cannot pass

**The plan's version of this run cannot show what it set out to show, and that is recorded rather
than smoothed.** It said: break the build, run the gate, then remove the deletion and re-run, "to
show the deletion is what prevents a pass over the old report". Both runs fail (exit 1, with the
type error), because the gate chains its steps with `&&`: a failing build stops the command before
the check reads anything, whether or not the report was deleted. So a broken build was never the
case the deletion protects.

The case it protects is a build that **succeeds without writing a report**, which is exactly what a
turbo cache hit does when the report is not a declared output. That was run instead, in four steps,
with a green report deliberately left on disk:

| Step | Protections in place                           | Tree                           | Result                                                                                                     |
| ---- | ---------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1    | none (no deletion, report not a turbo output)  | clean, forced build            | green report written (entry graph 449,701 bytes gzip)                                                      |
| 2    | none                                           | `import 'jspdf'` in `main.tsx` | `6 cached, 6 total`, then **`check:bundle-size: OK` … 439.16 kB, exit 0** — a false pass over jspdf        |
| 3    | deletion only                                  | same                           | `6 cached, 6 total`, then `FAIL — build first`, exit 1: safe, but a correct bundle would fail the same way |
| 4    | deletion **and** the turbo output (as shipped) | same                           | `6 cached, 6 total`, then B1 and B2 on 564.81 kB, exit 1: the right answer from a cache hit                |

Step 2 is the defect: an inflated bundle, a green gate, exit 0. Step 3 shows the deletion alone
turns a false pass into a failure. Step 4 shows the output declaration is what makes that failure
the correct one. An earlier order of the same experiment produced the mirror image, a **false fail**:
a clean tree hit the cache and the check read an inflated report left from the previous build.
**PASS**, with the plan's procedure corrected.

## 4. The roster refuses the gate without its CI step

Scratch change: the `Check the web bundle budget` step deleted from `.github/workflows/ci.yml`.

```text
✗ check:web-bundle is a root check:* script and runs in no CI step.
check:ci-roster: FAIL — 1 finding(s). 20 check:* gates, 18 in CI, 0 exempt by written reason.
```

Exit 1. **PASS.**

## The structural case

`scripts/check-bundle-size.test.mjs` gained one case pinning both protections from the files
themselves. It was verified red twice: once with `bundle-report.json` removed from `turbo.json`'s
outputs, once with the deletion moved after the build in the root script. Each produced
`13/14 passed`.
