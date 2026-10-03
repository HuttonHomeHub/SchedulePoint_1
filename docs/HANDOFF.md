# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-03, after the #431 diagram fix (#762, web 0.158.1) and the resource-group
dissolve epic (#764 api 0.84.0 / web 0.158.2; #766 web 0.159.0 (#767)).

## Where things stand

- `main` holds everything below. The working branch `claude/schedulepoint-project-setup-naacjj`
  carries only this file.
- **No approved work is waiting.** Both items the product owner chose on 2026-10-03 have shipped.
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What shipped on 2026-10-03

| PR   | What                                                                                                                                                                                                                                                   | Release                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| #762 | #431 start-edge half: the diagram withholds a started activity's start-edge resize (one shared `isStartEdgeFrozen` + reason with the Gantt, `features/tsld/render/hit-test.ts`); refusal is a non-refreshable banner                                   | web 0.158.1 (#763)                           |
| #764 | Dissolve a resource group, API (M1): `POST …/resources/:resourceId/dissolve`, `resource.dissolved` audit action, no schema change                                                                                                                      | api 0.84.0, web 0.158.2, types 0.40.0 (#765) |
| #766 | Dissolve a resource group, web (M2): row-menu item, dissolve dialog (count awaited before open), group-aware Delete copy, optimistic cache patch, `e2e-library` journey step; ADR-0053 §3 amended; BACKLOG entry closed; debt rows #434 and #435 filed | web 0.159.0 (#767)                           |

Spec and plan: `docs/specs/resource-group-dissolve/` (approved 2026-10-03; Q1 yes — no resource
restore). The spec headers still say **Approved**; flip them to the shipped form in the next docs
change that touches them.

## Open rows that need a decision or a trigger

- **#431** (narrowed): a **move** of a started activity still writes an inert placement in **both**
  views. Decide whether a move should mean something on a started activity.
- **#433**: re-measure the plan refresh path behind production cache headers (live host or nginx in
  the harness). Still the cheapest open item.
- **#434** (new, XS): the WBS dissolve copy says "its 1 activity move up".
- **#435** (new): two e2e shards failed once each after #760 (main's activity-editor shard; #762's
  Firefox `auth.spec.ts`), in code neither PR touched; a re-run passed. Read the trace on a recurrence.
- **#432**, **#429**, **#419**, **#405** unchanged.
- Deferred from the dissolve reviews: extracting `ResourcesTable`'s dialog state (component review
  S6), and the pre-existing focus loss on a **Delete** 404 in the resource library (needs a 404-only
  condition, because a 409 keeps the row).

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. **#433**: measure plan refresh on the live server.
2. **#434**: fix the WBS dissolve singular copy (tiny).
3. **#431 remainder**: decide what a move on a started activity should do.
4. Anything from `docs/BACKLOG.md`; a new feature starts with **feature-analyst**.

## Environment notes a new session would otherwise rediscover

- **This session could not arm wake-ups.** `send_later` refused with "lineage depth 8 (limit 8)".
  A fresh session from the product owner resets that; if it recurs, say so once and rely on GitHub
  events and agent completions.
- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate` — in **every git worktree** too.
- **The checkout may start detached with no `origin/main`.** `git fetch origin main <branch>` then
  `git checkout -B <branch> origin/<branch>`.
- **`.claude/worktrees/` is excluded via `.git/info/exclude`**, which a container restart clears;
  re-add it or the stop hook reports untracked files.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only.** It stops
  `pnpm prepush`'s turbo `test` early, so run `pnpm turbo run test --continue --filter=@repo/web
--filter=@repo/api` separately. `check:reconcile-due` warns on a shallow clone; that is expected.
- **`check:counts` re-derives the CLAUDE.md banner numbers.** Adding web source files fails it; the
  number sits on a wrapped line (`72 migrations, NNNN web`), so search for the number, not the phrase.
- **Commit bodies are limited to 100 characters per line** (commitlint), as well as PR title + " (#N)".
- **No Firefox in the container** — `/opt/pw-browsers` has Chromium only, so Firefox-only CI failures
  cannot be reproduced locally.
- **Building on an unmerged PR in a worktree works**: after the squash-merge, move the follow-on
  commits with `git rebase --onto origin/main <old-tip>`, then fast-forward-push to the designated branch.
- **Never use the global `prettier`**; use `pnpm exec prettier`.
- **Agents must never kill processes they did not start**, and must not run Playwright or
  `scripts/e2e-local.sh`. Never run two e2e jobs at once, and never change a checkout during one.
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then list
  that run's jobs for "Build & push api/web".
