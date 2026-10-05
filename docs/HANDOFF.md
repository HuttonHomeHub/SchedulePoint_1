# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-05, after the **Dependabot batch** (#807–#816) that followed the reconciliation
pass (`docs/RECONCILE.md`, ADR-0058; findings in `docs/DECISIONS.md`, 2026-10-05).

## Where things stand

- `main` holds everything below. Latest releases: **web 0.170.4, api 0.87.1**.
- **No approved work is waiting.** The reconciliation pass is done; the next one is due at the next
  epic boundary (`pnpm check:reconcile-due` counts ADRs since 2026-10-05).
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What the pass shipped (2026-10-05)

| PR   | What                                                                                                                                                                                                                                                                                                                                                                 | Release     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| #832 | **#455**: `useSession()` refetched `/me` on every mount and focus (`staleTime: 0`), and #827 made each plan switch a remount; the base suite hit the 100/60 s bucket on CI (#821, #831). Observers now hold the session fresh for 30 s; the shared options keep `0` because sign-in `fetchQuery`s them. Census 65 → 31.                                              | web 0.170.4 |
| #834 | The pass itself: **#336/#338/#340 restored** (deleted by accident in #729), ledger pointers named, #405/#418/#429/#432/#435/#437/#438 corrected (#418 closed by running its seed), ADR-0169/0048/0146 statuses, four agent files taught ADR-0171/0172/0174/0175, RECONCILE §1/§6 counts. New rows **#453** (register completeness gate), **#454** (#827 follow-ups). | none        |

## The Dependabot batch (2026-10-05, approved)

**#807–#816 were taken as one change** (the combined PR; `docs/DECISIONS.md`, 2026-10-05), the way
#731 took the previous eight, and the ten were closed as superseded. The lockfile is held to **exactly
the versions Dependabot proposed**: a plain install resolved `nestjs-pino` 5.3.1, `lucide-react`
1.52.0, `react-query` 5.104.1 and `turbo` 2.11.7, none reviewed, so expect those as the next
Dependabot PRs. All 57 claims on the eight pinned packages were re-read (every cited block
byte-identical; seven `react-hook-form` line ranges moved). No changeset, so no release: the new
versions ship with the next release's images.

## Open rows that need a decision or a trigger

- **#449**: calendar and resource-limit edits do not mark plans "edited since calculated" (left out
  by decision); plus a small stamp race. Pick up only if the product owner asks.
- **#450**: a single `DELETE` carries no version, so undo's check-then-delete has a small window.
- **#435**: the e2e flake row. Its green-run count **reset to 0** on 2026-10-05 (the #831 429); #832
  removes the cause it named, so count again from #832.
- **#453**, **#454**: filed by the pass (above).
- **#440–#446** (filed with activity history) unchanged; **#446** is lighter after #832.
- **History row-rate count is owed around 1 November** (ADR-0174 / #443): re-measure on the live host.
- **Gantt hands-on readings** are still owed by the product owner.
- **#433**, **#432**, **#429**, **#419**, **#405** unchanged. (**#431** is closed — the previous
  hand-off listed its "remainder" as open; it was not.)

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. **#433**: measure plan refresh on the live server.
2. **#453**: the register completeness gate (small; touches a shared gate, so a short spec first).
3. Anything from `docs/BACKLOG.md`; a new feature starts with **feature-analyst**.

## Environment notes a new session would otherwise rediscover

- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate` — in **every git worktree** too (a symlinked
  `node_modules` is not enough: each app has its own).
- **Keep the main checkout detached at `origin/main`** and do branch work in worktrees. Push with
  `HEAD:refs/heads/<branch>`.
- **`.claude/worktrees/` is excluded via `.git/info/exclude`**, which a container restart clears.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only**, which
  stops turbo, so `pnpm prepush` reports `FAILED: test`; run `pnpm --filter @repo/web test` and
  `pnpm --filter @repo/api test` on their own afterwards. `check:reconcile-due` needs full history
  (`git fetch --unshallow origin main`) to count.
- **Playwright in the container:** set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`. No
  Firefox or WebKit here, but **CI runs the base suite on all three against one API**, so a
  chromium-only census understates CI's bucket, and CI runs faster than this container.
- **Local e2e shares one database.** Never run two Playwright or vitest jobs at once.
- **Rate limits in suites are measured ceilings** (ADR-0175 D3): remove a redundant read before
  raising one.
- **A seed run against a local API** needs `RATE_LIMIT_LIMIT` raised on that API, a user
  (`POST /api/auth/sign-up/email` with an `Origin` header), an organisation, a client and a project;
  then `pnpm --filter @repo/seed-cli seed -- --url … --org … --project … --tier scale --activities 2000`
  (about 3.5 minutes).
- **`gh pr list` is blocked (GraphQL 403)** — use `gh api repos/HuttonHomeHub/SchedulePoint_1/...`.
  The REST limit was hit again this session (agents share it); check `gh api rate_limit` before bursts.
- **`check:counts` re-derives the CLAUDE.md banner numbers.** Adding web source files fails it.
- **Commit bodies are limited to 100 characters per line** (commitlint); a failed hook leaves no
  commit, so check `git log` before pushing.
- **Never use the global `prettier`**; use `pnpm exec prettier`.
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then list
  that run's jobs for "Build & push api/web".
- **Re-reading dependency claims after a bump:** `npm pack <pkg>@<old version>` into the scratchpad
  works (the registry is reachable), so each cited block can be compared byte-for-byte with the
  installed new version. Other projects' GitHub release notes are **not** reachable (access is scoped
  to this repository).
