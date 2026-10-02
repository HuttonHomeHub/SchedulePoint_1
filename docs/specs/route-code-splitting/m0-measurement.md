# M0 — Measure, and decide whether to build

**Status:** Complete as a record of 2026-09-12 — **figures stale, re-measure per §8 (refreshed
2026-10-02)** · **Taken:** 2026-09-12 · **Machine:** the CI-class container this session runs
in (not the product owner's hardware — see §5 for what that disqualifies)

> **2026-10-02: do not quote this document's numbers as current.** The entry graph it measured
> (404,797) has since grown to ≥ 445,254 gzip bytes. The budget was re-floored on 2026-09-16 and
> again on 2026-09-25 (`apps/web/bundle-budget.json:6-7`), and a week of work has landed on top of
> that. Every figure below (floor, shell cost, `paint`, chunk counts) describes the 2026-09-12 tree
> and is kept as taken. **§8 is the exact procedure to re-take them.** It also closes a
> composition gap in §3 that makes the 43,878 figure ambiguous. The P1 verdict (PASS) is very
> unlikely to flip, since the margin was ~142 kB, but it is re-confirmed rather than assumed.

The spec for this epic was written with Bash disabled, so **every figure in it is read rather than
measured** and it says so. This document is what makes them measurements. Read this, not the spec's
§0 table, for the numbers.

---

## 1. The headline: P1 PASSES, decisively

`feature-spec.md` committed P1 **before any work**: the probe's entry graph must come in at
**≤ 300,000 gzip bytes**, or the epic stops here and `docs/TECH_DEBT.md` #292 is rewritten as
floor-dominated.

| quantity                 | today   | all routes lazy | delta        |
| ------------------------ | ------- | --------------- | ------------ |
| entry graph (gzip bytes) | 404,797 | **157,483**     | **−247,314** |
| entry graph (chunks)     | 3       | 6               | +3           |
| total chunks             | 10      | 80              | +70          |
| CSS (gzip bytes)         | 15,141  | 15,424          | +283         |

**−61.1%.** The bar was 300,000 and the probe reports 157,483, so this is not a marginal pass and
the epic proceeds. The number is a **probe**, not a shipped result: it was produced on a throwaway
edit to `apps/web/src/app/router.tsx` that was reverted (`git diff` clean, verified) and never
committed. Nothing here describes an artefact anyone can download yet.

## 2. The floor is measured rather than estimated — 157,483 gzip bytes

The spec **deliberately refused to name a floor**, on the grounds that an estimated floor is exactly
the "~200 kB that predates any build being looked at" which `docs/FRONTEND_QUALITY.md` carried for
years. That refusal was right and is now discharged: with **every** route component lazy, including
the authenticated shell, what remains in the entry graph is the router, the vendor closure, the
shared primitives and the boot path — **157,483 gzip bytes**.

That is the floor for this splitting technique. Going below it needs a different lever (trimming the
vendor closure), not more route boundaries.

## 3. CQ-1 answered by measurement: the shell costs 43,878 gzip bytes

The spec's CQ-1 asked whether the authenticated shell should stay eager, and set eager as the
default with this measurement as the tiebreak. Both variants pass P1, so this is a real trade rather
than a constraint:

| variant                           | entry graph | chunks in graph | total chunks |
| --------------------------------- | ----------- | --------------- | ------------ |
| shell **lazy** (every route lazy) | **157,483** | 6               | 80           |
| shell **eager** (19 routes lazy)  | **201,361** | 18              | 66           |
| difference                        | **43,878**  | +12             | −14          |

> **Composition gap, found 2026-10-02.** "19 routes lazy" does not reconcile with the router. There
> are 22 screen-bearing routes (20 static imports + 2 already lazy), so "everything but the shell"
> is 21 lazy and "everything but the shell and sign-in" is 20. The probe edit was never committed,
> so which routes each variant actually converted is unrecoverable. In particular, nothing here
> says whether **sign-in** was lazy in the 157,483 variant. The design keeps sign-in eager, so if it
> was lazy, the design's real floor is above 157,483 and the 43,878 is shell + sign-in rather than
> shell alone. §8 fixes this by naming the routes in each variant.

So the spec's stated default — eager — is the **more expensive** option by ~44 kB gzip on the
coldest page in the product, which is the page a stranger meets. What it buys is one fewer
sequential wave before the authenticated app paints for a signed-in returning user.

**This is the product owner's call and is left open.** It is not a pixel-count question with an
obvious answer: 44 kB on first paint for every visitor, against one round trip for someone who has
already signed in. Recorded rather than decided, in the shape `#294`'s costing was left.

## 4. `paint` is in the entry graph, and the spec's correction to the brief holds

`docs/TECH_DEBT.md` #292 says `jspdf`, `html2canvas` and `paint` are "already lazy … and are NOT the
problem". Two of the three are; **`paint` is not**, and this was established three ways rather than
read off a filename:

- `bundle-report.json` records `paint` with `inEntryGraph: true`, and
  `apps/web/scripts/bundle-report-plugin.ts:37-38` (was `:37`, corrected 2026-10-02) defines that
  field as _"reachable from the entry through STATIC imports only"_.
- The static path is real: `apps/web/src/features/tsld/components/TsldCanvas.tsx:46` is
  `} from '../render/paint';` — a plain static import.
- In the all-lazy probe `paint` **leaves** the graph (`inEntryGraph: false`) and shrinks 33,478 →
  8,124 gzip bytes, which is what a chunk does when it stops being everybody's problem.

So **33,478 gzip bytes — 8.3% of today's entry graph — is TSLD painter code downloaded by every
stranger who loads a login form.** It is a separate chunk because the lazy staff probe also reaches
it, which is why "its own chunk" reads as "already lazy" and is not.

`docs/FRONTEND_QUALITY.md:85-88` already had this right. #292 did not. _(That bullet is now
`:80-89`, and #292 was corrected the same day. Line drift recorded 2026-10-02.)_

## 5. What this does NOT establish, stated rather than implied

- **No LCP or frame figure.** P2 is untaken. (2026-10-02: it will be taken in the container, not on
  the product owner's hardware — spec CQ-4.)
  The container this ran in is the same class of machine ADR-0127 D8 recorded reporting a no-change
  baseline that moved 0.56 → 1.85 pp and 0.93 → 10.00 pp between two runs an hour apart. A timing
  number from here would carry a date and a verdict and mean nothing.
- **P3 (waterfall depth) is unanswered and the probe raises it rather than settling it.** Total
  chunks go 10 → 80. That is the "Rolldown derives unhelpful chunking" risk M0-T3 named, now
  observed. 80 chunks does not mean 80 requests on any one navigation, and this document does not
  claim it does — but it is why P3 exists and it must be measured before M3 ships, not after.
- **P4 (total cold bytes) is unanswered.** The sharpest gap the spec names is a chunk that is lazy
  but every route imports on mount: it shrinks the reported entry graph, moves the same bytes one
  round trip later, and is green on every assertion. Note `share` grows 304 → 75,038 in the probe,
  which is this shape appearing benignly (its dependencies were previously paid for by the entry
  chunk) and is exactly why the gate's number alone is not the answer.

## 6. A correction to the spec's own provenance

The spec calls `apps/web/bundle-report.json` "the **committed** report" and reads every baseline
figure from it. **It is not committed** — `.gitignore:93` lists it, and `git ls-files` returns
nothing for it. It is a local build artefact, so its `measuredAt: 2026-09-11T14:04:54.760Z` records
whenever this container last built rather than a repository state anybody can reproduce.

The substance survives: a fresh build on 2026-09-12 reproduces the entry graph within **53 bytes**
(404,744 → 404,797, attributable to the day's merged work), so the spec's arithmetic stands. But the
provenance claim is wrong, and "read from a file git does not track" is a materially weaker basis
than "read from the committed report" — which is the distinction this repository keeps having to
relearn.

## 7. Two unit conventions, and the gate uses the wrong label

M0-T2 was scoped to `docs/FRONTEND_QUALITY.md:95-98`, which says "Quote bytes here" and then quotes
KiB. There is a third instance, in the gate's own output: `check:bundle-size` prints
`entry graph 395.31 kB of 416.00 kB gzip` for 404,797 bytes — 404,797 / 1024 = 395.31, so it divides
by 1024 and labels the result `kB`. Since #292's whole units paragraph exists because Vite's
reporter uses kB = 1000 bytes, a gate that prints KiB as kB is the same confusion in the one place a
reader trusts most. Folded into M0-T2.

_2026-10-02: the `FRONTEND_QUALITY.md` instance is fixed (it now quotes 128,584 / 46,603 bytes and
records this finding at `:97-102`). The gate's instance is **not**: `check-bundle-size.mjs:64` is
still `(n / 1024).toFixed(2) + ' kB'`. It moves to M1-T3, which edits that file anyway._

---

## 8. Re-measuring (added 2026-10-02) — the exact procedure

Run by the orchestrator or a builder agent with Bash. **Not by the product owner**: this part is
bytes, not timings, and the container is a fine instrument for bytes. Timings are CQ-4. Every
command is from the repository root, on a clean checkout of `origin/main`.

**Step 0 — record the tree.** `git fetch origin main && git checkout --detach origin/main &&
git rev-parse HEAD && git status --porcelain`. Record the SHA. The status must print nothing.

**Step 1 — today's baseline, through the real gate.** `pnpm install --frozen-lockfile`, then
`pnpm check:web-bundle`. It deletes `apps/web/bundle-report.json`, builds `@repo/web` through
Turbo, and runs the gate, so the report cannot be stale (ADR-0160). Record the gate's one-line
summary, then extract the figures with:

```bash
node -e "const r=require('./apps/web/bundle-report.json');const lazy=r.chunks.filter(c=>!c.inEntryGraph).sort((a,b)=>b.gzip-a.gzip);console.log(JSON.stringify({measuredAt:r.measuredAt,entryGraph:r.entryGraph,totalChunks:r.chunks.length,css:r.css.gzip,paint:r.chunks.filter(c=>/paint/.test(c.file)).map(c=>({file:c.file,gzip:c.gzip,inEntryGraph:c.inEntryGraph})),largestLazy:lazy[0]&&{file:lazy[0].file,gzip:lazy[0].gzip},lazyOver135168:lazy.filter(c=>c.gzip>135168).map(c=>c.file),lazyUnder15000:lazy.filter(c=>c.gzip<15000).length},null,2))"
```

Save the output as the baseline. **This replaces 404,797 / 33,478 as "today".**

**Step 2 — three probe variants, named route by route.** On a local throwaway branch
(`git checkout -b probe/m0-refresh`, **never pushed**), edit only `apps/web/src/app/router.tsx`.
In each variant, a converted screen's static import line is replaced by
`const XScreen = lazyRouteComponent(() => import('@/routes/x'), 'XScreen');`, with
`lazyRouteComponent` added to the `@tanstack/react-router` import. `/share` and `/staff` stay as
they are (`lazy()`) in every variant, so the variants differ from today only in the routes named:

| variant | lazy (in addition to `/share`, `/staff`)                           | eager                          | answers                                    |
| ------- | ------------------------------------------------------------------ | ------------------------------ | ------------------------------------------ |
| **A**   | the 18 screens other than `SignInScreen` (list them in the record) | `SignInScreen`, `AuthedLayout` | the design with an **eager** shell         |
| **B**   | A + `AuthedLayout`                                                 | `SignInScreen`                 | the design with a **lazy** shell (CQ-1)    |
| **C**   | B + `SignInScreen`                                                 | none                           | reproduces 2026-09-12's "every route lazy" |

After each edit, run `pnpm --filter @repo/web exec vite build`. That is the same command
`bundle-budget.json:4`'s `measuredBy` names. It skips `tsc` and Turbo, so the report is written
fresh. Run the Step 1 `node -e` extraction and save its output per variant.

**Step 3 — derive and record**, in a new dated section of this file. Do not edit §1–§4:

- **P1** for variant A and variant B: entry graph ≤ 300,000? PASS/FAIL, with the population
  (chunk count) stated. **If both fail, the epic stops here**, per the spec.
- **Shell cost** = B − A on the entry graph. **That is CQ-1's number**, replacing 43,878.
- **Sign-in cost** = C − B. Comparing C with 157,483 tells you how much of the change since
  2026-09-12 is floor growth and how much is route code.
- **`paint`**: `inEntryGraph` in A and B (must be `false`) and its gzip size in each.
- **Ceiling**: any lazy chunk over 135,168 in A or B, with its file name. That is the M4-T1
  `raisedBecause` decision, made early.
- **Fragmentation**: count of lazy chunks under 15,000 in A and B, against today's.

**Step 4 — leave nothing behind.** `git checkout -- apps/web/src/app/router.tsx`,
`git checkout -` to return, `git branch -D probe/m0-refresh`, then `git status --porcelain` must
print nothing. Then re-run `pnpm check:web-bundle`, so the report on disk is `main`'s and not the
last probe's. A probe report left on disk is exactly the stale-report failure ADR-0160 closed.

**What this does not measure:** P2 (timings, CQ-4), P3 (waves) and P4 (total cold bytes). P3 and
P4 need a browser against `vite preview` and are the M1-T4 journey's job. Nothing here may be
quoted as a P2/P3/P4 result.

---

## 9. Re-measurement of 2026-10-02 — bytes only, taken per §8

**Tree:** `origin/main` = `d3b9dbf147cc975aec2f6842423c839ddff8e472` (`web` 0.156.2). The probes ran
on a throwaway branch off the approval commit `28c05e8`, which is docs-only: `git diff --stat
origin/main -- apps packages` printed nothing, so the measured code tree equals `origin/main`'s.
Container, `pnpm install --frozen-lockfile`, `vite build` per §8 Step 2, figures from the §8
extraction. Bytes only: nothing here is a P2, P3 or P4 result. A single build per variant, which is
enough for bytes (the build is deterministic).

**Today's baseline** came through the gate (`pnpm check:web-bundle`): `entry graph 450.38 kB of
457.00 kB gzip` (the gate's `kB` is KiB, see §7). The report says **461,186 gzip bytes**, 3 chunks,
10 chunks in total, CSS 15,919. This replaces 404,797.

**Variants.** The 18 screens other than sign-in are `AcceptInvite`, `Account`, `AuditLog`,
`Calendars`, `ClientDetail`, `Clients`, `ForgotPassword`, `Members`, `MyActivity`, `Onboarding`,
`OrgHome`, `PlanDetail`, `ProjectDetail`, `RecentlyDeleted`, `ResetPassword`, `Resources`, `SignUp`
and `VerifyEmail` (all `...Screen`). All converted with `lazyRouteComponent` (exported by the
installed `@tanstack/react-router`). `/share` and `/staff` unchanged.

| variant                                          | lazy routes added | entry graph (gzip) | chunks in graph | total chunks | CSS    | `paint` in graph (gzip) | lazy < 15,000 |
| ------------------------------------------------ | ----------------- | ------------------ | --------------- | ------------ | ------ | ----------------------- | ------------- |
| today (nothing converted)                        | 0                 | **461,186**        | 3               | 10           | 15,919 | **yes** (55,647)        | 3             |
| **A** eager shell and sign-in                    | 18                | **228,960**        | 25              | 68           | 16,207 | no (22,559)             | 36            |
| **B** lazy shell, eager sign-in (**the design**) | 19                | **178,259**        | 8               | 76           | 16,207 | no (22,569)             | 61            |
| **C** every route lazy                           | 20                | **175,424**        | 7               | 84           | 16,207 | no (22,569)             | 70            |

**Derived (§8 Step 3).**

- **P1: PASS for both A and B.** A is 228,960 (25 chunks in the graph) and B is 178,259 (8 chunks),
  against the absolute 300,000. Today's 461,186 falls by 232,226 (50.4%) to A and by 282,927
  (61.3%) to B. The epic proceeds.
- **Shell cost (B − A on the entry graph), CQ-1's number: 50,701 gzip bytes**, replacing 43,878.
  Putting the shell behind a lazy boundary is the larger of the two wins, by a wider margin than
  2026-09-12 recorded. Graph chunks 25 → 8.
- **Sign-in cost (C − B): 2,835 gzip bytes.** So 2026-09-12's 43,878 was shell plus little else:
  sign-in is small. C is 175,424 against 157,483 on 2026-09-12, **17,941 bytes of floor growth** in
  three weeks (router, vendor closure, shared primitives, boot path), none of it route code.
- **`paint` is out of the entry graph in A and B** (`inEntryGraph: false`, 22,559 and 22,569 gzip).
  It is **in** today's graph at **55,647**, up from 33,478: 12.1% of the 461,186. Every stranger
  who loads a login form downloads it today.
- **Ceiling:** no lazy chunk is over 135,168 in A, B or C. The largest is `jspdf.es.min` at 128,582
  (today 128,581). It is the export library, not a route chunk. So the plan-workspace tripping the
  ceiling, which the spec rated likely, did **not** happen in these probes. The probe has no
  per-group chunks, so this is the result for one-chunk-per-route-component, not for the grouped
  design M3 builds.
- **Fragmentation:** lazy chunks under 15,000 gzip bytes: today 3, A 36, B 61, C 70.

**Against the plan's predictions.** The spec's "~288 kB above the floor" holds: 461,186 − 175,424 =
285,762. Nothing contradicts a prediction. Two things were not predicted and move the case for
**B over A**: A's entry graph is 25 chunks, so an eager shell drags the shell's whole static closure
into the first wave, and B costs 50,701 bytes less than A (more than the 43,878 recorded). Total
chunks of 76 to 84 revisit P3's fragmentation concern; the figures say nothing about waves.

**Cleaned up per §8 Step 4:** `router.tsx` restored, the probe branch deleted, status clean, and
`pnpm check:web-bundle` re-run on the restored tree (same 450.38 kB line as above).

**M0-T5 (container timing baseline) NOT taken in this run; taken later, see §10.** Its instrument is a Playwright `measure-*` harness
over CDP throttling, which this run may not execute (the database and fixed ports are shared). It
is still owed, before M1 merges.

## 10. The pre-split timing baseline (M0-T5), 2026-10-02

**Build:** `31f59954b9ffe3792474ae98f55b0fda7ca8f0d9`, taken 2026-10-02T10:20:26Z, working tree clean.
That tree is `origin/main` `d3b9dbf` plus the measurement harness (`31f5995`), so the application
code is the **pre-split** code. Command: `ROUTE_SPLIT_LABEL=before scripts/e2e-local.sh
measure:route-splitting` (1 passed, 3.4 min). Raw output is `apps/web/measure-output/
route-splitting-before.{json,md}`, gitignored; the table below is the committed copy.

**Environment:** 4 x Intel(R) Xeon(R) Processor @ 2.80GHz, 16 GiB, Chromium 141.0.7390.37, viewport
1646x1080, 7 runs per path. Throttle (CDP): 1638 kbps down, 150 ms RTT. A container reading, not a
planner machine (CQ-4); the verdict is INDETERMINATE whenever the spread is >= the effect judged.

| path               | ready ms, median (min-max, spread) | LCP ms, median (min-max, spread) | JS requests (median) |
| ------------------ | ---------------------------------- | -------------------------------- | -------------------- |
| `signInCold`       | 2903 (2860-2967, 3.7%)             | 3720 (3660-3756, 2.6%)           | 4                    |
| `planDeepLinkCold` | 3772 (3698-4145, 11.8%)            | 3576 (3548-3648, 2.8%)           | 4                    |
| `planDeepLinkWarm` | 1278 (1246-1316, 5.5%)             | 1076 (948-1096, 13.8%)           | 4                    |
| `planInApp`        | 2294 (2257-2412, 6.8%)             | n/a                              | 0                    |

**Read against P2.** CQ-2's thresholds are 10% on a deep link or reload and 5% in-app. The cold
deep link's ready-time spread is 11.8% and the in-app spread is 6.8%, both **at or above** the
effect sizes, so a ready-time verdict on those two paths will be INDETERMINATE unless the effect is
larger than the spread. LCP spreads on the cold paths (2.6%, 2.8%) are tight. The warm path's LCP
spread (13.8%) is wide. Every one of the seven runs of each path was byte-identical in JS transfer:
**463,933 bytes over 4 requests** on both cold paths, 1,200 on the warm path, 0 in-app. That
463,933 is the **P4 baseline** (total cold JS bytes, pre-split) that M1-T4's journey compares
against; P4 asks for a fall of at least 100,000.
