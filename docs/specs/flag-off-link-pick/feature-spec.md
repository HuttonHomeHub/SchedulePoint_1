# Feature Spec: A flag-off journey for the pointer two-click link pick

- **Status:** Accepted — product owner, 2026-10-19: Option A, build it.
- **Author(s):** Claude, for the product owner
- **Date:** 2026-10-19
- **Tracking issue / epic:** `docs/TECH_DEBT.md` #76, its last open bullet.
- **Roadmap link:** none. A test-harness change a planner cannot see.
- **Related ADR(s):** ADR-0032 (the two-click Link tool), ADR-0064 (the authoring flow),
  ADR-0084 and ADR-0088 (what a flag-off suite is for), ADR-0105 (why this is a spec).

ADR-0105 makes a new Playwright config and a new CI step spec triggers, however small. This is that
spec. It is short because the change is.

## 1. The problem, re-verified 2026-10-19

The Link tool's two-click pick predates the authoring-flow epic (ADR-0032 M5). The epic (ADR-0064)
added echo plumbing on top of it — `onLinkPickStep`, `linkPickPredecessorId` and
`dropLinkPickSignal` — and wired that plumbing **unconditionally**: `grep -rn onLinkPickStep
apps/web/src` finds it in `TsldCanvas.tsx`, `TsldPanel.tsx`, `use-plan-workspace-model.ts`,
`plan-workspace-toolbar.tsx` and `use-plan-auto-recalc.ts`, none of them behind the flag. Only some of
what it drives is gated on `CANVAS_AUTHORING_FLOW_ENABLED`: the recalculation hold while a pick is
open (`TsldPanel.tsx:1034`), the mode band (`:1047`) and the keyboard Enter link (`:2224`).

So with `VITE_CANVAS_AUTHORING_FLOW=false` the pointer pick still runs through the new plumbing, and
nothing proves it still works. Every Playwright config that names the flag pins it **on**
(`playwright.authoring-flow.config.ts`, `playwright.multi-select.config.ts`,
`playwright.search-nav.config.ts`); every other config takes the default, which is also on
(`env.ts:936-937`). Unit tests cannot reach it: a pointer pick needs a hit test against a canvas with
real layout, which jsdom does not have (`TsldCanvas.test.tsx` defers the same case for the same
reason).

## 2. What changes

1. **A new config, `apps/web/playwright.authoring-flow-off.config.ts`**, a copy of
   `playwright.authoring-flow.config.ts` with one difference: `VITE_CANVAS_AUTHORING_FLOW: 'false'`.
   The pen stays enforced at the API (`PLAN_EDIT_LOCK_ENFORCED: 'true'`), so the run checks the same
   write path as the flag-on suite.
2. **A new suite folder, `apps/web/e2e-authoring-flow-off/`**, with one spec file and one journey. It
   reuses the flag-on suite's helpers (`e2e-authoring-flow/support.ts`) rather than copying them.
3. **A script `test:e2e:authoring-flow-off`** in `apps/web/package.json`, **a CI step** in
   `.github/workflows/ci.yml` on the lightest shard, and **an entry in `scripts/e2e-durations.json`**
   (estimated ~25 s until a real CI run is harvested). `check:e2e-roster` derives its roster from the
   scripts, so it will ask for the last two.
4. **`docs/TECH_DEBT.md` #76 closes**, and `docs/TESTING.md`'s suite list gains the new config.

No product code changes. No schema, no endpoint, no component contract.

## 3. What the journey proves

With the authoring-flow flag **off** and canvas authoring **on**, on a plan with two unlinked
activities A and B:

- **The pick still links, the right way round.** Arm Link, click A's bar, click B's bar. The API then
  holds **exactly one** dependency, with A as predecessor and B as successor. This is the epic's
  founding defect (a link whose ends came back reversed), checked on the path the epic did not test.
- **Nothing the flag gates shows up.** No mode band while the pick is open, and pressing Enter with
  Link armed and an activity focused does **not** create a link (it opens the Logic tab, as before the
  epic).
- **Escape still drops an open pick.** Arm Link, click A, press Escape, click B: no dependency is
  created.

It does **not** retest the flag-on behaviours (`e2e-authoring-flow` owns those), the recalculation
hold (gated off by design here), or the keyboard path.

## 4. Cost

One journey of three short steps; the flag-on suite runs 80 s for nine tests, so this should be about
25 s. Shard sums after the 2026-10-13 re-pack differ by 18 s, so it lands on the lightest shard with no
re-pack. The `VITE_` flag bakes at `webServer` start, which is why it cannot be a second project inside
the existing config.

## 5. The one question for the product owner

**Is a test for a build nobody receives worth its ~25 s on every CI run?** The register itself
recorded on 2026-09-13 that no published image can turn this flag off: `apps/web/Dockerfile` takes
only `VITE_API_URL`, `docker-publish.yml` passes no build arguments, and `.dockerignore` strips `.env`
files. So the flag-off product exists only in a developer's local build, and `scripts/flag-retirement.json`
classes the flag as "guard-only, formally kept" (ADR-0088 D4).

- **Option A — build it (recommended, because you asked for it and it is cheap).** It protects the
  rollback the flag's own docblock still promises (`env.ts:929`, "set `VITE_CANVAS_AUTHORING_FLOW=false`
  and rebuild the web image"), at about 25 s per run.
- **Option B — close #76 without building**, recording that the rollback it would protect can only be
  produced by a hand-built image, and that ADR-0088 already judges such tests poor value.

Either way #76 closes in this session. **Answered 2026-10-19: Option A.**

## 6. Plan (one milestone)

| Step | What                                                                                 | Check                                                         |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1    | Config, script, folder, journey                                                      | Journey passes locally with the flag off                      |
| 2    | Prove it can fail: temporarily swap the click order in the journey's expectation     | It goes red, then back to green                               |
| 3    | CI step on the lightest shard; duration entry; `TESTING.md`; close #76; banner count | `pnpm prepush` (`check:e2e-roster`, `check:counts`) all green |
