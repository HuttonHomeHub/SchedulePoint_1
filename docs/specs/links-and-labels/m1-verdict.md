# M1 verdict: one text layout (dark)

**Status:** Judged 2026-09-25 against [`conditions.md`](./conditions.md). M1 ships dark: the canvas
draws exactly what it drew at M0, and nothing a user sees has changed, so there is no changeset.

`render/row-text-layout.ts` now places every name, date and centre item. The painter calls it once,
before the edge layer, and draws the result; the router reads the same result from M2.

## FC-W0: agreement — PASSED

`node scripts/measure-attachment.mjs` (from `apps/web`). `readAttachment` now runs the module on the
painter's own frame and throws unless every non-link text the painter drew is a module item at the
same text, x, y and alignment, and every item is drawn. It ran on all 48 readings (four fixtures,
zooms 1, 4 and 12, pans 0, 32, 200 and 500) with no disagreement. The text kinds in every reading now
come from the module and are cross-checked against M0's row-band classifier on every text; the two
classifiers share no code, and they agree.

The vacuity floor is pinned in the script, per fixture and zoom:

| Fixture            | Texts drawn (z1 / z4 / z12) |
| ------------------ | --------------------------- |
| brief              | 9 / 21 / 27                 |
| small-17           | 6 / 21 / 31                 |
| reference-netpoint | 58 / 136 / 136              |
| Unit 300           | 83 / 219 / 320              |

**No fixture produces a wrap** (0 taken, 0 fallen back, in every reading), so the wrap branch of the
agreement is not exercised by the fixtures. It is covered by the module's unit case and by
`paint.netpoint-text.test.ts`'s wrap cases, which pass unedited.

**The plan's red run could not work, and the red runs that can were taken instead.** M1-T3 said to
verify FC-W0 red by perturbing the module (dropping the halved gap). After M1-T2 the painter draws
the module's own items, so a change to the module changes both sides of the comparison identically
and the agreement still holds. What FC-W0 protects is narrower and was verified both ways:

- the painter drawing exactly the items (moving the reserved-row dates 1 px from their items: 28
  disagreements on small-17 at 12 px/day), and
- the probe computing the painter's layout (measuring at 7 px a character instead of the recording
  context's 6: 5 disagreements).

Perturbing the module's rules is what the module's own unit cases are for, and five of them were
verified red that way (below).

## FC-W1: the extraction moved nothing — PASSED

- **The golden log is byte-identical and was not edited** (`paint.golden.test.ts`, both scenes).
  Prediction written before the rewire: byte-identical, because the layout step makes no context call
  on a warm memo and the painter replays every text write in its old order.
- `paint.dates-budget.test.ts`, `paint.centre-item-budget.test.ts` and `lod-tier.structural.test.ts`
  pass **unedited**. All 230 test files under `src/features/tsld` pass (2,165 tests before M1-T3's
  additions).
- Every M0 count and every fingerprint re-reads equal (`measure-attachment.mjs --json` against M0's
  saved reading, all 48 rows).
- **Two structural tests were edited, and the plan said one of them would not be.**
  `paint.netpoint-text.test.ts`'s tier-gate case counted `lodTier(view.pxPerDay)` in `paint.ts`
  alone; two of those gates moved into the module, so it now reads both files, same bar (≥ 5).
  `node-sharing.structural.test.ts` read the date layer's `sharesNode` call from `paint.ts`; it now
  reads the module, and also holds the painter to having no inline gap test. Neither assertion was
  weakened; each follows the code it was written about. The plan's list of unedited suites was
  written before the move was built, and did not know these two read source text.

## New gates

- **`row-text-layout.structural.test.ts`** refuses `truncateToWidth`, `wrapTwoLines` and
  `dateLabelSlot` in `paint.ts`, with comments stripped first, a pinned positive case and a pinned
  comment case. Verified red by adding a `truncateToWidth` call to the name layer. **It departs from
  the spec, which refuses `truncateToWidth` outright**: two calls in `paint.ts` are not row text (the
  drag ghost's inside label, and the pinned WBS band's labels). They are pinned by the text they
  truncate and by count, so a third call, or a row-text call renamed to look like one of them,
  fails.
- **`paint.text-layout-memo.test.ts`** holds every `fillText`'s text, position and font equal on a
  cold memo and a warm one, with a check that the cold paint really measured. The layout step now
  measures before the edge layer, so a cold miss sets the font earlier in the frame than before.
- **`row-text-layout.test.ts`**, 19 cases, one per branch, each named for the comment that records
  why the branch exists. Five verified red against named mutations: the halved gap clamped at zero,
  the visible part ignored (#380), one date per node removed (#379), a lone ellipsis allowed, and a
  milestone measured under the regular key.
- **`text-index.test.ts`**: lane grouping, the binary-search bound, a query equal to a full scan on
  60 boxes, and touching-is-not-meeting.

One piece of code was written and then removed on its own test. The first rewire restored `ctx.font`
after the layout step in case a cold miss left a different font behind. Removing the restore left
the cold-memo case green, because every text layer sets its own font before drawing, so it guarded
nothing and was deleted. The comment at the call site now states the measured fact instead.

## FC-Q1, the paint limb: a move must not cost — PASSED

`node scripts/measure-route-cost.mjs`, one sitting, `paint.ts` swapped between the M0 tree
(`741893f7`) and M1 for each run, BASE → NEW → BASE → NEW:

| Build | Run | `paintScene` p95, two samples |
| ----- | --- | ----------------------------- |
| BASE  | 1   | 12.90, 13.90 ms               |
| NEW   | 1   | 13.50, 13.50 ms               |
| BASE  | 2   | 11.90, 14.90 ms               |
| NEW   | 2   | 13.30, 14.20 ms               |

BASE spans 11.90–14.90 ms (mean 13.40, spread 3.00); NEW spans 13.30–14.20 ms (mean 13.63). The bar
is BASE plus BASE's spread, 16.40 ms: NEW's worst sample is 14.20 ms. The difference in means,
0.23 ms, is well inside the spread, so the reading says the move costs nothing detectable, not that
it costs exactly nothing. Headless Chromium rasterises in software (`m0-baseline.md` T5).

## Journey and gate

- `scripts/e2e-local.sh web:netpoint-grammar`: **9 passed**, including `text.spec.ts` (part of
  FC-W1), against a real API and browser. The seed step reported one `LOCKED on recalculate` finding
  from the seed tool's own recalculation under pen enforcement; it was not caused by this change and
  did not stop the seed.
- `pnpm prepush`: every gate passed except `check:counts`, which caught the stage banner's web
  source file count (1,354) after M1 added six files; the banner now says 1,360.
