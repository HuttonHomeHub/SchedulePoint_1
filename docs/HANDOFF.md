# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-01, after PR #746 (Apply levelled dates M2+M3) and its release (#747, web 0.155.0).

## Where things stand

- `main` holds everything below. The working branch `claude/schedulepoint-project-setup-naacjj`
  carries only this file (and the #428 register row).
- **No approved work is waiting.** Every item the product owner approved on 2026-09-30 has shipped.
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.

## What shipped on 2026-09-30 (second session)

| PR   | What                                                                                                                                                                                                                                                                                                                                                                             | Release                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| #740 | #422 view toggles per plan; #423 histogram counts a bar's last day; #420 client/project/plan forms seeded at mount (the CI trace showed a wiped Name field, not a server fault)                                                                                                                                                                                                  | api 0.81.1, web 0.154.1               |
| #742 | #424 plan-specific canvas state (overlays, cursors, isolate, armed tool) resets on a plan switch; filter/colour/compare kept as preferences; #425 Earned Value PV counts an activity's last day                                                                                                                                                                                  | api 0.81.2, web 0.154.2               |
| #744 | Apply levelled dates M0+M1: premises measured (#426, #427 filed), `GET …/schedule/levelling-application` preview read, test set hardened (P1–P19, A1–A4 + A1b)                                                                                                                                                                                                                   | api 0.82.0, types 0.38.0, web 0.154.3 |
| #746 | Apply levelled dates M2+M3: the command, dialog, one-batch apply and one Undo, stale-list refusal on confirm, a11y fixes, ADR-0167, part-day seed plan (verified live). The toolbar item is **icon-only** (Lucide `Scale`, accessible name "Apply levelled dates…") because a labelled button pushed the deck to 4 rows at 1280 px (`e2e-workspace-fit/command-surface.spec.ts`) | web 0.155.0 (#747)                    |

Product-owner decisions taken today:

- Histogram and EV "last day" are defects (fixed, #423/#425).
- View state that belongs to a plan resets on a plan switch; personal preferences stay (#424).
- Apply levelled dates: CQ-1 to CQ-4 all (a) — move like a drag, all at once, one step then report
  what is left, next working day. Recorded in ADR-0167.

## Open rows that need a decision or a trigger

- **#420 stays open for what is left.** CI passed the csp suite first-attempt on five consecutive
  runs after the fix, and the sibling forms were converted 2026-10-01; the editor, the create dialog
  and the Progress panels are not (they need a spec — see the row).
- **#426** part-day levelling delay counted but never drawn; **#427** `leveledProjectFinish`
  ignores the push to followers. Both found by the M0 measurement.
- **#428** (new) seed catalogue: `capability-levelling-placed` re-declares a PROJECT calendar that
  `capability-levelling` also creates (409 when both seed into one project), and the seeder sends
  the resource archive (204) through `client.post`, reporting a false UNKNOWN. Catalogue only;
  the product is unaffected. Both reproduced on main in a fresh org.
- **#419** selection cost at 2,000 activities (needs a real-hardware reading); **#405** rename
  (deferred until a breaking change).
- **Levelling ignores logic** (ADR-0167 context): on chain-heavy plans most ghosts are dropped as
  earlier than their links allow, so one press may leave much to resolve. The case for
  logic-aware levelling is a candidate epic, not a row.
- **HTTP measurement of the preview is owed** (engine-only figures: p50 ≈ 0.65 s, p95 ≈ 0.78 s
  at 2,160 activities; an apply costs two reads). The throttle of 10/60 s is a judgement.

## What could come next

Nothing below is approved. Put these to the product owner in plain English:

1. **#428** — fix the two seed-catalogue faults (small).
2. **#426 / #427** — the two levelling defects M0 found.
3. **#420's remainder** — the activity editor and create dialog's `useScopeForm` reset needs a spec
   first (the unsaved-work guard sits outside the forms' lifetime).
4. **Logic-aware levelling** — a real feature; starts with a spec.

## Model switch points

- Start on **Opus** to frame the next batch's choices.
- Switch to **Sonnet** once a batch is approved.

## Environment notes a new session would otherwise rediscover

- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build` and
  `pnpm --filter @repo/api exec prisma generate`. Skipping `prisma generate` fails ~138 API unit
  tests with "PrismaClientKnownRequestError is not a constructor".
- **Never run two e2e jobs at once, and never change the checkout during one.** They share one
  Postgres. A rebase during an API e2e run produced four false 500s ("planLevellingApplication is
  not a function") that a clean re-run cleared.
- **Firefox is not installed in the container.** Two Firefox-only base-suite failures on #740 were
  cleared by one re-run and could not be reproduced locally.
- **A PR title plus " (#N)" must be ≤ 100 chars** (`pr-title.yml`); #742's first title was 101.
- **Playwright suite names have no `e2e-` prefix** (`web:workspace-chrome`).
- **Lint single files from inside the package** (`cd apps/web && pnpm exec eslint …`).
- **After an engine change, run each `check:*` on its own**; `pnpm prepush` has missed one before.
- **The release run is not in the default workflow listing.** Filter `release.yml`, then
  `list_workflow_jobs` on the run for "Build & push api/web".
- **The container restarted three times today.** Background agents die; their commits survive in
  `.claude/worktrees/*`. Recover a lost report from its output file or `git log`, and re-brief.
- `git reset --hard` may be refused; use `git checkout -B <branch> origin/main`.
- Agents must not run Playwright or `scripts/e2e-local.sh`; the orchestrator runs them centrally.
