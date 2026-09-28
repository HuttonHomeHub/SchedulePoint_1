# Implementation Plan: The formatting check runs in `pnpm prepush`

- **Status:** Approved (product owner, 2026-09-28)
- **Spec:** [`feature-spec.md`](feature-spec.md)

One milestone, one pull request (shipped with the 2026-09-28 quick wins).

| Task | Change                                                                                      | Test                                        |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| T1   | `.prettierignore` excludes `.claude/worktrees/` (D3)                                        | a local check with worktrees present passes |
| T2   | root `check:format` with `--cache --cache-strategy content`; `format:check` aliases it (D1) | FC-1, FC-2 timed and recorded in §3         |
| T3   | CI "Format check" step runs `pnpm check:format` (D2)                                        | FC-4                                        |
| T4   | `docs/TESTING.md` paragraph (D4); `docs/TECH_DEBT.md` #299 rewritten to the general rule    | `check:doc-links`, `check:debt-status`      |
| T5   | red run (FC-3)                                                                              | recorded in §3                              |

**Risk.** The one way this goes wrong silently is the cache passing a file that is not formatted.
`content` strategy is the mitigation (D1), and CI never has a cache, so a stale local pass is still
caught one step later.

## 3. Record

Filled in at M1.
