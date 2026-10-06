# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-10-06, after the batch approved the same day: TECH_DEBT #457 (nginx security
headers) and the **staff console redesign** (spec #848, milestones M0–M4).

## Where things stand

- `main` holds everything below. Latest releases: **web 0.176.0, api 0.88.0** (check the tags).
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.
- The previous hand-off was accurate when checked (main ended with #847; web 0.173.0, api 0.88.0).

## What this batch shipped

| PR   | What                                                                                                                                                                                                             | Release     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| #849 | **#457** closed: one shared nginx security-header snippet, included at server level and in `/assets/`, `/theme-boot.js`, `/favicon.svg`; `check:nginx` gate + fixtures; CI smoke boot reads them.                | web 0.173.1 |
| #848 | Staff console redesign spec + plan (`docs/specs/staff-console-redesign/`), approved 2026-10-06.                                                                                                                  | none        |
| #851 | **M0**: route → `StaffConsoleScreen`, one file per panel; `StatusSection` moved to shared; `QueryPanel`; baselines at 1368×912. Filed **#459**.                                                                  | none        |
| #852 | **M1**: accessibility fixes (Show older keeps focus and appends; resting shading without `pointer-events-none`; probe announcements outside inert `main`; overlay Stop/Escape). Closed **#458**, filed **#460**. | web 0.173.2 |
| #854 | **M2**: shared primitives (heading context, `SectionGroup`, `SubSection`, `Disclosure`, `ConditionStrip`, `KeyValueList`, `CopyButton`, Badge `outline`); **ADR-0178**.                                          | web 0.174.0 |
| #856 | **M3**: the visible layout — Status with values → jump list → Conditions / This installation / Tools / Record; Refresh with its note; plain copy and the copy gate.                                              | web 0.175.0 |
| #858 | **M4**: Performance folded by default; probe panel split; ADR-0178 **Accepted**. Page at rest 4,664 → 2,905 px at 1368×912. Filed **#461**.                                                                      | web 0.176.0 |

## Waiting on the product owner

- **The Surface test sheet is still PARKED** (`docs/specs/gantt-coarse-pointer/device-checklist.md`).
  Standing instruction unchanged: a change to anything it tests updates the sheet in the same PR. Its
  answers decide **Gantt M2**. Nothing in this batch touched the Gantt.
- **The history count on or after 1 November** (ADR-0174 / #443): staff console → Tools →
  **Run diagnostics** → **Copy results**. Record it in #443 and the activity-history plan's M3-T2.
- **Gantt hands-on readings** are still owed (unchanged).

## Decisions to put to the product owner (none approved)

1. **#459 — one "Page not found" screen.** A non-staff `/staff` shows a styled "Not found" while an
   unknown URL shows the router's bare default, so the two are distinguishable (ADR-0086 no-tell).
   Security review (2026-10-06): **Low** — the route name is in the public bundle anyway. The fix is
   a shared `NotFoundScreen` used by the router's `defaultNotFoundComponent` and the staff gate,
   which changes every unknown URL's page, so it **needs a short spec** (ADR-0105). Also: verify the
   API 404 message parity (`Not found` vs Nest's `Cannot GET …`) and add an e2e parity test.
2. **Muting box announcements during a Refresh.** After a Refresh, a box whose sentence changed
   speaks beside the page sentence. Fixing it adds a prop to `StatusSection`/`QueryPanel` (a
   shared-contract change), so it is recorded in the plan's M4 record, not built.
3. **#460 + #461** — the fifteen non-staff buttons that rest pointer-inert, and moving the resting
   `aria-disabled` look into `Button`'s CVA. One change, component-reviewer before release.
4. **Gantt M2** (after the Surface sheet), and anything from `docs/BACKLOG.md`.

## Open rows unchanged this batch

**#456**, **#454**, **#449**, **#450**, **#440–#446**, **#435** (e2e flake count — the runs on
#849–#858 are candidates), **#432**, **#429**, **#419**, **#405**. ADR-0177 stays Proposed until
D4 at Gantt M2. `wip/history-numerator-preaggregate` (`64ff45d4`) is still the first remedy to
measure when the 250,000 trigger fires.

## Environment notes a new session would otherwise rediscover

- **Setup.** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build`,
  `pnpm --filter @repo/api exec prisma generate` — in **every git worktree** too.
- **Keep the main checkout detached at `origin/main`** and do branch work in worktrees.
  **Brief every builder to work only inside its worktree path** and to check
  `git -C <main checkout> status --short` is empty before editing: on 2026-10-06 one builder used
  `cd /home/user/SchedulePoint_1/apps/...` and wrote M2 into the shared checkout.
- **`.claude/worktrees/` is excluded via `.git/info/exclude`**, which a container restart clears.
- **A container restart ends background tasks and agents** (wake-ups survive). After a restart, run
  `list_triggers` and re-arm if empty, and check worktrees and the main checkout for half-finished
  builder work.
- **Chaining milestones on unmerged branches works**: base the next builder on the previous branch,
  then after the squash-merge `git rebase --onto origin/main <old tip>` and force-push with lease.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only**, which
  stops turbo, so `pnpm prepush` reports `FAILED: test`; run `pnpm --filter @repo/web test` and
  `pnpm --filter @repo/api test` on their own afterwards.
- **Local e2e shares one database and one browser.** Never run two Playwright or DB-backed jobs at
  once. Read-only reviewers can run meanwhile; a full web unit run is slow while a builder is busy.
- **Parallel branches collide on register numbers and the `CLAUDE.md` banner count.**
- **A PR title over ~93 characters fails `pr-title.yml`** once GitHub appends ` (#NNN)`.
- **CodeQL flags incomplete regex escaping even in tests** — escape the full metacharacter set.
- **`gh pr list` is blocked (GraphQL 403)** — use `gh api repos/HuttonHomeHub/SchedulePoint_1/...`.
- **Playwright in the container:** Chromium binary `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **Commit bodies are limited to 100 characters per line** (commitlint).
- **Never use the global `prettier`**; use `pnpm exec prettier`.
- **The release run is not in the default workflow listing.** Filter on `release.yml`, then list
  that run's jobs for "Build & push api/web".
