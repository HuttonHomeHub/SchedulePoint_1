# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-02, after PR #753 (the activity editor seeding epic, ADR-0169) and its release (#754, web 0.156.1).

## Where things stand

- `main` holds everything below. The working branch `claude/schedulepoint-project-setup-naacjj`
  carries only this file.
- **No approved work is waiting.** All four items the product owner chose on 2026-10-01 have shipped.
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What shipped on 2026-10-01 and 2026-10-02

| PR   | What                                                                                                                                                                                                                                                                                                            | Release                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| #749 | #428 seed-catalogue faults; #426 explained in the summary ("N under a day, not drawn"); eight more forms seeded at mount (the part of #420 that needed no spec)                                                                                                                                                 | web 0.155.1 (#750)             |
| #751 | Logic-aware levelling (ADR-0168): levelling moves followers by their links (hand-placed ones too, CQ-1 a), one count of moved activities (CQ-2 a), the levelled finish counts placed bars (closes #427). The hot-resource case was 1.97× slower and is 1.32× after the M2.5 speed-up the product owner chose    | api 0.83.0, web 0.156.0 (#752) |
| #753 | Activity editor seeding (ADR-0169): the editor and New activity build their forms per opening, so typed text is kept, no stale "Saved." or armed discard prompt, Progress drafts survive a tab visit, overlapping saves each record undo and announce, the drawer shell and subject guard are gone. Closes #420 | web 0.156.1 (#754)             |

## Open rows that need a decision or a trigger

- **#430** (new, S): a scope's save success resets the form to the submitted values, so text typed
  while a save is in flight is replaced. Read in the code (`ActivityEditorSession.tsx`), not yet
  reproduced in a test. The fix would follow the late-seed path's `keepDirtyValues`. A good small
  next item: write the red test first.
- **#429**: the plan-calendar picker's popup closed between "visible" and the click, once on CI.
  Trigger is a second occurrence; read the trace before changing anything.
- **#419** selection cost at 2,000 activities (needs a real-hardware reading); **#405** rename
  (deferred until a breaking change).
- **HTTP measurement of the levelling preview** is still owed (engine-only figures so far).

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. **#430**: keep text typed while a save is in flight (small; red test first).
2. **#419**: measure selection cost on real hardware (needs the product owner's machine).
3. **The levelling preview's real request time**: measure it, then decide whether the throttle stands.
4. Anything from `docs/BACKLOG.md` the product owner wants next. A new feature starts with
   **feature-analyst** and a spec.

## Model switch points

- Start on **Opus** to frame the next batch's choices.
- Switch to **Sonnet** once a batch is approved.

## Environment notes a new session would otherwise rediscover

- **Setup.** Run `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build` and
  `pnpm --filter @repo/api exec prisma generate`. Skipping `prisma generate` fails about 138 API
  unit tests with "PrismaClientKnownRequestError is not a constructor".
- **The `@repo/interchange` test "decodes CP1252 high bytes" fails in the cloud container only.**
  It passes on CI. Report it and move on.
- **Agents must never kill processes they did not start** (no `pkill vitest`). One did, and it
  killed the orchestrator's e2e run.
- **GitHub runners sometimes spend about 20 minutes installing Playwright**, so a web shard can hit
  its 30-minute timeout before any test runs. One re-run of the failed jobs is the right response
  (§19.9); a second failure is real.
- **Never run two e2e jobs at once, and never change the checkout during one.** They share one
  Postgres.
- **Strict-mode locators:** text that appears in both an sr-only status and a visible line, or in
  two "Close" buttons, needs `{ exact: true }`.
- **react-hook-form 7.88:**
  - `resetField` does nothing on an unregistered field.
  - Omitted optional seed keys made a form dirty on mount under StrictMode; seed them as
    explicit `undefined`.
  - `useFieldArray` regenerates its keys on reset.
- **react-query v5:** per-call `mutate` callbacks fire only for the latest call on an observer. Use
  `mutateAsync(...).then(ok, fail)` when overlapping calls each need their callback.
- **A PR title plus " (#N)" must be ≤ 100 chars** (`pr-title.yml`).
- **Playwright suite names have no `e2e-` prefix** (`web:workspace-chrome`).
- **Lint single files from inside the package** (`cd apps/web && pnpm exec eslint …`).
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then run
  `list_workflow_jobs` on that run to find "Build & push api/web".
- **The container restarts.** Background agents die; their commits survive in
  `.claude/worktrees/*`. If an agent cherry-pick leaves state behind, `git cherry-pick --quit`.
- `git reset --hard` may be refused; use `git checkout -B <branch> origin/main`.
- **Agents must not run Playwright or `scripts/e2e-local.sh`**; the orchestrator runs them centrally.
