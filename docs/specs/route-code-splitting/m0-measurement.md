# M0 — Measure, and decide whether to build

**Status:** Complete · **Taken:** 2026-09-12 · **Machine:** the CI-class container this session runs
in (not the product owner's hardware — see §5 for what that disqualifies)

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
  `apps/web/scripts/bundle-report-plugin.ts:37` defines that field as _"reachable from the entry
  through STATIC imports only"_.
- The static path is real: `apps/web/src/features/tsld/components/TsldCanvas.tsx:46` is
  `} from '../render/paint';` — a plain static import.
- In the all-lazy probe `paint` **leaves** the graph (`inEntryGraph: false`) and shrinks 33,478 →
  8,124 gzip bytes, which is what a chunk does when it stops being everybody's problem.

So **33,478 gzip bytes — 8.3% of today's entry graph — is TSLD painter code downloaded by every
stranger who loads a login form.** It is a separate chunk because the lazy staff probe also reaches
it, which is why "its own chunk" reads as "already lazy" and is not.

`docs/FRONTEND_QUALITY.md:85-88` already had this right. #292 did not.

## 5. What this does NOT establish, stated rather than implied

- **No LCP or frame figure.** P2 is a measurement on the product owner's hardware and is untaken.
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
