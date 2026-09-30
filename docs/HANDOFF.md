# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-09-30, after PR #737 (#413) and its release PR #738 merged: `api-v0.81.0` and
`web-v0.154.0`.

## Where things stand

- `main` holds everything below. The working branch `claude/schedulepoint-project-setup-naacjj` is
  reset onto it and carries only this file and the #420 register update.
- **No approved work is waiting.** Every item the product owner approved on 2026-09-30 has
  shipped. The next batch needs their choice (see "What could come next").
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What shipped on 2026-09-30

| PR   | What                                                                                                                                                                                                                                                                                                                                                     | Release                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| #731 | Eight Dependabot bumps in one lockfile regeneration: `better-auth` 1.7.6, `unplugin-swc` 2.0, `turbo` 2.11 (with `agentGuidance: false`, so it stops writing `AGENTS.md`), and others. Also: dependency claims re-verified, and the e2e throttler reset now also clears `@nestjs/throttler` 6.7.1's `hitExpirations` (`apps/api/test/throttle-reset.ts`) | none (no user-visible change) |
| #733 | #416: `/api/auth/*` bodies were unbounded (better-call 1.4.0 is called with no `bodySizeLimit`). `boundAuthBody` caps them at 64 KB. #417: the Late-overlay announcement moved to the toolbar host, so it speaks in the Gantt view too                                                                                                                   | api 0.80.2, web 0.153.4       |
| #735 | #421: Pass 2 drew a progressed predecessor's successor 5–8 working days late. The fix includes a comment-only marker migration and `ProgressedVisualRederiveService`, which recalculates affected plans, and their direct cross-plan downstreams, once at boot. ADR-0148 Amendment 1                                                                     | api 0.80.3                    |
| #737 | #413 (ADR-0166): the resource histogram, the canvas resource strip and levelling now work from the **placed** dates. Levelling anchors on the placed span, and metric 12 on the network span. The ghost is drawn only where levelling moved the bar. New seed plan `capability-levelling-placed`; #422 filed; `@types/nodemailer` 8.0.2                  | api 0.81.0, web 0.154.0       |

Product-owner decisions taken today and recorded in the specs:

- **#413 Q1 (c):** levelled ghost now. An **"Apply levelled dates" command later, under its own spec**.
- **#413 Q2:** metric 12 stays network-anchored.
- **#421:** fix it first. Correct every plan at once on release.

## Open rows that need a decision or a trigger

- **#420, now owed (its trigger fired today).** The csp suite's Arrange journey stalls waiting for a
  newly created client or project link. It has failed three times on CI, most recently all three
  attempts on #737, and passes locally. **Next:** download `playwright-report-web-shard-1` from run
  `36710871625` (attempt 1) on a machine that can reach the artifact host, and read the retry trace.
  The cloud container cannot.
- **Apply levelled dates (#413 Q1 c).** A new command. Needs feature-analyst and a spec before any
  code.
- **#422:** the Late overlay stays on after switching to a plan already opened in the session.
  Small; web.
- **#419:** selecting an activity costs about 220–300 ms at 2,000 activities (container-only). Needs
  a reading on real hardware first (ADR-0128).
- **#405 rename:** deferred until something else forces a breaking change.
- **Resource-view journey:** the placed-load test reloads after each placement. Live update after a
  canvas drag is not covered.
- **Histogram's last day** (found in #413 M0): the histogram spreads `[start, finish)` over the
  inclusive display finish, so a 5-day bar loads 4 days. It is not a register row yet. The first
  step is to decide whether it is a defect.

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. **#420 plus #422 as a small batch.** #420 needs the trace, and the product owner may be able to
   download it. #422 is about an hour.
2. **The "Apply levelled dates" command.** A real feature, so it starts with a spec.
3. **The histogram's last-day question.** A decision first, then maybe a small fix.

## Model switch points

- Start on **Opus** to frame the next batch's choices.
- Switch to **Sonnet** once a batch is approved.

## Environment notes a new session would otherwise rediscover

- **Setup.** A fresh checkout or worktree has no dependencies. Run `pnpm install --frozen-lockfile`
  (the offline store is empty in a fresh container), `pnpm --filter "./packages/*" build` and
  `pnpm --filter @repo/api exec prisma generate`.
  - Skipping `prisma generate` makes about 138 API unit tests fail with
    "PrismaClientKnownRequestError is not a constructor". It looks like a regression and is not one.
- **Playwright suite names have no `e2e-` prefix:** `scripts/e2e-local.sh web:resource-view`, not
  `web:e2e-resource-view`.
- **Linting single files:** run ESLint from inside the package (`cd apps/web && pnpm exec eslint …`).
  From the repo root it picks up a global ESLint 10 and crashes in `eslint-plugin-react`.
- **`pnpm prepush` did not catch `check:surface-contract`** on #737, though CI did. After an engine
  type change, run each `check:*` on its own before pushing.
- **The release run is not in the default `list_workflow_runs` listing.** Filter `release.yml` by
  `status: completed`, then `list_workflow_jobs` on the run to see "Build & push api/web".
- **The container restarted twice today.** Background subagents and runs die. Check
  `git worktree list` and re-brief a builder if its report was lost. Commits in worktrees survive.
- `git reset --hard` may be refused. Use `git checkout -B <branch> origin/main` instead.
- Agents must not run Playwright or `scripts/e2e-local.sh`. The orchestrator runs them centrally.
