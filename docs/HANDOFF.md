# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-09-29, after `api-v0.80.0` / `web-v0.153.1` (PR #724, release #725) and
`web-v0.153.2` (PR #727, release #728).

## Where things stand

- `main` is released and published; the working branch `claude/schedulepoint-project-setup-naacjj`
  is reset onto it and carries only this file.
- Model routing is pinned in `.claude/agents/`: **builder** (Sonnet) implements, **explorer**
  (Haiku) searches, planners are Opus. Never send implementation to `general-purpose`.
- The **reconciliation pass ran on 2026-09-29** (record: `docs/DECISIONS.md`, same date). It filed
  `#412`–`#415` and corrected the docs and agents in place. `#412` and `#415` are small register
  rows (both need **security-reviewer**) and `#414` is a one-line script fix; none needs a decision.

## What shipped (2026-09-29)

| Row      | What                                                                                                                              | Where          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| #402     | Late overlay's spoken sentences read late dates                                                                                   | `web-v0.153.1` |
| #404     | "Project finish" states the placed finish (summary, guest view, recalculate response)                                             | `api-v0.80.0`  |
| #405 (a) | Revision comparison compares placed spans; new `datesBasis: PLACED \| NETWORK` on both routes                                     | `api-v0.80.0`  |
| #405 (b) | Landing "where each programme stands" compares placed finishes (no schema change; EXPLAIN in the row)                             | `api-v0.80.0`  |
| #405 (c) | Earned Value planned value phased on placed dates (spec `docs/specs/ev-placed-planned-value/`, ADR-0042/0044 amendments accepted) | `api-v0.80.0`  |
| #407     | Oversize body → 413 with the envelope; 512 KB on authenticated org routes (credential-presence guard), 64 KB elsewhere            | `api-v0.80.0`  |
| #334 M2  | Render isolation for the activities panel and its rows (PR #727)                                                                  | `web-v0.153.2` |

## Open decisions for the product owner

Written for the product owner in plain English. Each one says what the choice is, what each answer
costs, and what I'd recommend. Nothing below has been started.

### 1. Should the activities table use "windowing" to open faster on big plans? (#334 M3, "CQ-B")

**The problem.** The table of activities under the diagram is slow to open on large plans. On the
test machine, opening it took about **1.7 seconds on a 2,000-activity plan** and about half a
second on a 500-activity plan. The target is 0.2 seconds. Last night's fix (M2) made clicking and
ticking inside the table faster, but it does not touch the opening time.

**What windowing is.** Instead of building all 2,000 rows when the table opens, it builds only the
30 or so rows you can see, and swaps rows in and out as you scroll. It looks the same to a mouse
user, and opening should become fast whatever the plan's size. That is a prediction from the
measurements, not yet a measurement; it gets measured after it's built.

**What it costs.**

- **Ctrl+F (the browser's "find on page") can't find a row that is scrolled out of view**, because
  that row isn't really on the page until you scroll to it. The diagram's own search box still
  finds any activity by name.
- **Screen-reader users can't jump through the whole table** with their table-reading keys; they
  reach rows as the table scrolls. They still have a full, always-complete list of every activity
  in the diagram, which is the main way they read a plan today.
- It is a moderately big change to a shared building block, so it needs a written design record
  (an ADR) and careful testing before it ships.

**Your options.**

- **(a) Go ahead with windowing, accepting the two costs above.** _(My recommendation, if plans of
  1,000+ activities are normal for your users. It is the only option that fixes the slow opening.)_
- **(b) Windowing plus a "filter" box on the table**, so people who used Ctrl+F have a replacement.
  This is more work and is a new feature, so it would need its own short spec first.
- **(c) Don't window.** Accept that the table takes a second or two to open on very large plans. It
  may be the right call if plans that size are rare for your users.
- **(d) Measure on your own computer first** (the Surface Pro) before deciding. The test machine's
  speed compared to yours is unknown.

**Also owed either way:** re-running the speed measurements to confirm last night's fix worked
(about 40 minutes of loading test plans).

### 2. Should the resource-loading chart follow the bars as drawn? (#413, new)

As of yesterday, every date the product shows is based on where bars are actually drawn: the
finish date, baseline comparisons, earned value, and the "where each programme stands" page. The
**resource-loading chart is the one exception.** It still counts work on each activity's earliest
possible dates, so if you drag a bar later, the chart doesn't move with it.

- **(a) Move the chart to the drawn dates**, so it matches everything else. The catch: the
  automatic "levelling" (which spreads work out so no one is overloaded) also works from the
  earliest dates. After this change the chart and the levelling would disagree unless levelling
  moves too, and that is a larger decision.
- **(b) Leave it, and label the chart** "based on earliest dates", so nobody is misled.
- _My recommendation: (b) now, and decide (a) together with levelling later._

### 3. Accessibility wording for the "Late" view (#402, from the accessibility review; none urgent)

When the "Late" overlay is switched on, the screen-reader descriptions now read the late dates.
Three small choices remain:

- should each row say it is describing late dates;
- should the float and drift wording switch to "late" too (today it stays on the drawn dates while
  the dates themselves are late);
- should switching the overlay on or off be announced.

_My recommendation: yes to the first and third, since they're cheap and remove ambiguity. The
second changes what the numbers mean, so leave it unless someone asks._

### 4. Renaming some fields in the revision-comparison data (#405)

Some fields in the data behind the revision comparison are still named "early…" but now carry the
drawn dates (there's a separate label saying which). Renaming them would be tidier, but anything
outside the app that reads that data would break. _My recommendation: leave the names until
something else forces a breaking change, and do both together._

### 5. The size limit on large saves (#407; just confirm)

The brief said about 256 KB. A real 2,000-row save measured up to about 356 KB, so the limit was set
to **512 KB** for signed-in users. It stays 64 KB for anyone not signed in. _No action needed
unless you want a different figure._

## Model switch points

1. Stay on **Opus** to write #334 M3's ADR once decision 1 is answered (if it's (a) or (b)).
2. Switch to **Sonnet** for build, reviews, sweep and release once a brief is approved. The next
   build batch that needs no decision is `#412` + `#415` (together) and `#414`.

## Environment notes a new session would otherwise rediscover

- **A fresh checkout or worktree has no dependencies.** Run `pnpm install --frozen-lockfile
--offline`, `pnpm --filter "./packages/*" build` and `pnpm --filter @repo/api exec prisma
generate` before lint/typecheck/tests. **Turbo and ESLint caches replay stale results** (14
  spurious "unsafe type" lint errors) until `apps/*/.eslintcache` is deleted — do that before
  believing an api lint failure.
- **Builders' worktrees start from an old `main`, not your branch.** Tell every builder to begin
  with `git fetch origin <branch> && git reset --hard FETCH_HEAD`, or it will not see your briefs,
  specs or helpers. Cherry-pick their commits back; `docs/TECH_DEBT.md` and `CLAUDE.md` counts
  conflict routinely — resolve, don't discard.
- The machine has **4 cores**; three concurrent `pnpm prepush` runs take 17+ minutes and produce a
  no-detail `test` failure that passes alone. Run at most two builders at once.
- **The container can restart mid-run** and kills background subagents; check `git worktree list`
  and re-brief a fresh builder rather than waiting.
- `df -h /` before a sweep; clear per-run build caches in `/tmp` above ~85%.
- `e2e-library` fails locally on a strict-mode `getByText('Crew A')` and passes in CI — an
  environment difference.
- Agents must not run Playwright or `scripts/e2e-local.sh`: they share one database and fixed
  ports. The orchestrator runs them centrally (`scripts/e2e-local.sh api`, then `web` and named
  `web:<suite>` targets).
- Release: merge the Version Packages PR despite having no check runs (`CLAUDE.md` §11), then
  confirm the `api-v*` / `web-v*` tags and the Release run's two publish jobs
  (`actions_get list_workflow_jobs` on the run; do **not** list the workflow's runs — the payload is
  huge).
