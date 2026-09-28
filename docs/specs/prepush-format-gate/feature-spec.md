# Feature Spec: The formatting check runs in `pnpm prepush`

- **Status:** Approved (product owner, 2026-09-28, as a quick win)
- **Author(s):** Claude (for the product owner)
- **Date:** 2026-09-28
- **Tracking issue / epic:** `docs/TECH_DEBT.md` #299 — repository tooling, one milestone
- **Roadmap link:** none (a tooling decision a planner cannot act on; ADR-0136 precedent)
- **Related ADR(s):** ADR-0160 (the decision this applies a second time), ADR-0136, ADR-0105

ADR-0105 makes a change to the shared pre-push gate a trigger for a spec, however small. This is
that spec. The decision is not new: ADR-0160 made the web bundle budget a root `check:*` gate so
`pnpm prepush` derives it and CI runs the same command. This does the same for the formatting
check, which is the instance ADR-0160 left open under #299.

## 0. Evidence

| #   | Claim                                                                 | Verdict                            | Established by                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | CI runs `pnpm format:check` and no local gate does.                   | True                               | `.github/workflows/ci.yml` "Format check" step; `grep -n format scripts/prepush.sh` returns nothing; `prepush.sh` derives its roster from root `check:*` scripts only.                                                                                                                                                                             |
| E2  | A root `check:*` script is picked up by `prepush` with no edit to it. | True                               | `scripts/prepush.sh`, the `mapfile … startsWith("check:")` block.                                                                                                                                                                                                                                                                                  |
| E3  | `check:ci-roster` then requires a CI step running the new gate.       | True                               | `scripts/check-ci-roster.mjs`; `scripts/ci-roster.json` `exempt` is empty.                                                                                                                                                                                                                                                                         |
| E4  | **A local `format:check` walks every agent worktree.**                | **True — found writing this spec** | Run 2026-09-28 with four worktrees under `.claude/worktrees/`: it flagged `.claude/worktrees/agent-…/packages/engine-conformance/fixtures/*`. Those are excluded from git by `.git/info/exclude`, which Prettier does not read, and `.prettierignore`'s fixture patterns are root-anchored. CI has no worktrees, so only a local run could see it. |
| E5  | Cost.                                                                 | **Measured under load, not quiet** | 191 s for one full `format:check` with the worktrees excluded, taken while three test-running agents shared the 4-core machine. #299 records ~19 s on a quiet one. The M1 sitting takes the figure that decides FC-1.                                                                                                                              |

E4 matters more than the cost. Adding the gate without the ignore line would make `pnpm prepush`
fail on this machine whenever an agent worktree exists, for files that are not in the repository.

## 1. What changes

- **D1.** A root script `check:format` runs `prettier --check` over the same glob as `format:check`,
  with `--cache --cache-strategy content`. `format:check` becomes an alias of it, so the glob has
  one home.
- **D2.** CI's "Format check" step runs `pnpm check:format`. `check:ci-roster` then sees it.
- **D3.** `.prettierignore` excludes `.claude/worktrees/` (E4).
- **D4.** `docs/TESTING.md`'s "run it separately" paragraph is replaced with a sentence saying the
  gate is now derived.

**Why `--cache`.** On a repeat run only changed files are re-read, which is the common case for
`prepush`. `content` keys the cache on file contents rather than modification times, so a checkout
or a rebase cannot make a stale entry pass; Prettier also drops the cache when its version or options
change. CI starts with no cache, so CI behaviour is unchanged.

**Out of scope.** The general rule #299 records — every CI command is a root gate or exempt with a
reason, asserted in the CI-to-prepush direction — is a change to `check:ci-roster` itself. The
product owner declined it inside ADR-0160, and this spec does not reopen it. #299 is rewritten down
to that rule.

## 2. Success criteria (committed before measuring)

- **FC-1:** a warm run (nothing changed since the last one) completes in **≤ 10 s**.
- **FC-2:** a cold run on a quiet machine completes in **≤ 60 s**. If it does not, `--cache` stays
  and the row records the figure; the gate still ships, because the full prepush is about six
  minutes (ADR-0160 E8).
- **FC-3 (red run):** a deliberately misformatted tracked file makes `pnpm prepush` report `FAIL
check:format` and exit non-zero, and reverting it makes it pass.
- **FC-4:** `check:ci-roster` passes with the CI step renamed and fails with it removed.
