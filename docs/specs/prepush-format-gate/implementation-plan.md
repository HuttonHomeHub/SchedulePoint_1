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

Measured 2026-09-28 on the 4-core session container, quiet (load ~1), `node_modules/.cache/prettier`
deleted before each cold run, with the agent worktrees removed so they could not be the cause.

| Run                    | Result                              | Condition         |
| ---------------------- | ----------------------------------- | ----------------- |
| Cold                   | **121 s, 125 s** (two runs)         | FC-2 ≤ 60 s: MISS |
| Warm (nothing changed) | **17 s, 18 s, 18 s** (three runs)   | FC-1 ≤ 10 s: MISS |
| Red run (FC-3)         | `FAIL check:format`, prepush exit 1 | PASS              |
| Roster (FC-4)          | refuses the old `format:check` step | PASS              |

**Both timing conditions missed, and the gate ships anyway, as FC-2 said it would.** The warm floor
is not the cache failing: the `metadata` strategy measured the same 16–18 s as `content`, and one
file takes 1.2 s of startup alone, so the remainder is Prettier's own per-file pass over ~3,360
files. Against a full `pnpm prepush` of about six minutes, 18 s is about 5%. The cold figure is paid
once per clone or cache wipe. #299 recorded "~19 s" for an uncached run; that figure does not
reproduce on this container and was taken on a machine this record cannot identify, so it is not
treated as a regression. CI runs cold every time, exactly as it did before, so CI time is unchanged.

Two earlier readings (191 s cold, 23 s warm) were taken while three test-running agents shared the
machine and are superseded by these.
