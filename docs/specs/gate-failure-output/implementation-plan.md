# Implementation Plan: A failing gate shows its finding

- **Feature spec:** [`feature-spec.md`](feature-spec.md)
- **Status:** Approved — by the product owner, 2026-10-22, with all defaults
- **Owner:** repo (builder agent, after approval)

**Size: S.** One milestone, one commit, leaves `main` releasable. Every step runs in the session
container; nothing asks the owner to test or measure anything.

## Milestone M1 — `prepush` prints the finding (S)

Depends on nothing.

- **T1 — red-first test.** New `scripts/prepush-output.test.mjs`, built on the
  `prepush-push.test.mjs:41-95` shape but with no git remote (`prepush.sh` without `--push` calls no
  git). Each case copies the real `scripts/prepush.sh` into a temp root with a stub `package.json`
  (`lint`/`typecheck`/`test` as `node -e 0`) and an `emit.mjs` that prints a given line list and
  exits with a given code. Cases:
  1. **The row's case:** `check:chain` prints 30 `✓ case-n` lines, a `✗ the-failing-case` at line
     5 followed by `    expected 1, got 0`, then a `FAIL — 29/30 passed` summary, exits 1. Output
     contains both the `✗` line and its error line.
  2. **E6's case:** a 500-line log with a finding at line 10 and markers nowhere else. Output
     contains line 10 with its number, the log's last line, and the footer naming
     `pnpm check:big` and `500`; output for that gate is ≤ 120 lines.
  3. **Marker flood:** 1,000 `✗` lines — output bounded (≤ 120 lines for the gate).
  4. **WARN path:** a `check:reconcile-due` stub (the one name in `ADVISORY_GATES`) exiting 2 with
     its finding 20 lines from the end — shown, run still exits 0.
  5. **Pass path:** a passing gate that prints 50 lines — only `ok    check:pass` appears.
  6. **Exit status:** case 1's run exits 1 and prints `FAILED: check:chain`.
- **T2 — verify red** (ADR-0110 D5) against today's `prepush.sh`: cases 1, 2 and 4 must fail (the
  finding is outside `tail -12`). Then against a "print the whole log" variant: cases 2 and 3 must
  fail (the bound). Record both outcomes in the commit body.
- **T3 — the change.** `scripts/prepush.sh`: add `show_log` and its three constants; replace `:168`
  and `:172`; extend the docblock near `:45-51` with two sentences citing #276 (what a failing gate
  prints and why the cap).
- **T4 — wire the test** into `check:doc-register` after `prepush-push.test.mjs` (`package.json:21`).
- **T5 — docs.** `docs/TESTING.md` "Before you push" gains one sentence on what a FAIL prints. Close
  #276 in `docs/TECH_DEBT.md` in the form `check:debt-status` accepts, citing this spec.

**Risks.** `awk` regex over multibyte `✗`/`×` behaves differently under a C locale → T1 case 1 runs
under the CI default and the test sets no locale, so it exercises what CI exercises. Test cost:
stub gates are `node -e`, so seconds, but each case spawns `pnpm` several times — keep to six cases.

**Testing requirements.** T1 green, T2 recorded red, `pnpm prepush` green (it runs the new test via
`check:doc-register`). No `apps/api` change and no Playwright suite, so no e2e half.

**Change impact.** No ADR (spec §4). No changeset: the root package is private (`package.json:4`)
and nothing in `apps/*` or `packages/*` changes. Review: **devops-reviewer** (shell) and
**test-engineer** (fixture design and the red verification).
