# Landing C M0 — the menu band, measured

**Date:** 2026-08-19 · **Harness:** `apps/web/measure-toolbar/menu-band.spec.ts` ·
**Raw:** `apps/web/measure-output/landing-c-m0-menu-band.json` ·
**Verdict: WITHDRAWN.**

`command-surface.md` §6 set the falsification condition **before** the measurement:

> If the band does not fit at 1646 with **≥ 120 px of slack**, this proposal is withdrawn and the
> fourth-fitting option returns.

It does not fit, and it is not close.

## The result

| width | container | band total | slack (median chrome) | at widest chrome | at narrowest |
| ----- | --------- | ---------- | --------------------- | ---------------- | ------------ |
| 1920  | 1920      | 1619       | **+301**              | +281             | +311         |
| 1646  | 1646      | 1619       | **+27**               | **+7**           | +37          |
| 1440  | 1440      | 1619       | **−179**              | −199             | −169         |
| 1280  | 1280      | 1619       | **−339**              | −359             | −329         |
| 1024  | 1024      | 1619       | **−595**              | −615             | −585         |

**27 px against 120.** The verdict is judged on the worst case the measurement supports — **7 px** —
because a gate answered from the middle of a spread is a gate that passes on average. It fails at
every point in that spread, and it fails by an order of magnitude rather than marginally. It fits
only at 1920, which is not the width this product is judged at (ADR-0091's retrospective).

## Where §3.1's arithmetic went wrong

| term                             | §3.1 estimate | measured | delta    |
| -------------------------------- | ------------- | -------- | -------- |
| five labelled menu triggers      | ~425          | **472**  | +47      |
| eight icon-only + gaps           | ~285          | **284**  | −1       |
| identity (reduced) + modes + pen | ~695          | **795**  | +100     |
| group rules and gaps             | ~60           | 68       | +8       |
| **total**                        | **~1465**     | **1619** | **+154** |
| **slack at 1646**                | **~165**      | **27**   | **−138** |

The strip estimate was **almost exactly right** — 284 against ~285. Both of the others were
optimistic, and one of them is the whole story.

**The plan name is the finding.** "Identity, reduced" was derived in §3.1 by subtracting the
breadcrumb path and the pen cluster from a measured identity line. Measured directly by what
**stays**, it is 273 px — a 227 px plan name plus a 46 px `Draft` badge — and the modes (412) and pen
(110) that survive alongside it bring the cluster to 795. §5 risk 2 says, in its own words, _"165 px
of slack is thin, and a long plan name eats it"_. It does. It eats all of it.

**And the first run of this harness measured that term at its most favourable possible value.** The
plan was called `Logic` — five characters, 37 px — and the harness reported **307 px of slack and a
PROCEED**. Renaming the fixture to `Riverside — Phase 2 Substructure`, which is an ordinary
construction plan name and shorter than many, moved the answer by 190 px and reversed the verdict.
A measurement of the term a risk is about, taken at that term's best case, answers a question nobody
asked.

## What is trustworthy here, and what is not

**The trigger derivation is sound**, and it corroborates the spec's own comparator. Five real
`aria-haspopup` triggers were priced — `view` 89, `filter` 92, `summary` 121, `analysis` 114,
`export` 158 — giving a chrome spread of **59–65 px, a range of 6**. §3.1 cited `view` at 91 px from
`m2-item-widths.md`; this harness reads 89. Two independent measurements two days apart agreeing
inside 2 px is the strongest signal in this document.

**The first corrected run identified triggers as "anything painting text"** and got a 40–65 spread
across 24 samples, because that set includes both halves of two segmented controls and the
`finish-chip` read-out. Pricing a menu from a segment prices the wrong control. The discriminator is
`aria-haspopup`, which is what a trigger structurally is.

**Two things remain estimates and are labelled so in the report itself:**

- **Eight strip commands is the proposal's count**, not a measurement — only four icon-only controls
  exist to price today. The unit width (32 px) and the gap (4 px) are measured; the multiplier is
  §3's. The term is 284 px and would have to be wrong by 400 % to change the verdict.
- **The container is read as the toolbar row's own box**, 1646 at a 1646 viewport.
  `m7-ladder-measurement.md` reports 1630 for a comparable measure. The verdict does not turn on
  16 px: at 1630 the three slacks are 11 / −9 / 21.

## What this does NOT withdraw

The **diagnosis** stands on the two symptoms that survived verification (§2, corrected the same day
after two of the four turned out to describe behaviour ADR-0091 M7 had already fixed):

- every width decision on this surface is a subtraction — `computeLadder`, four band floors, a 48 px
  hysteresis, `CHROME_RESIDUAL_PX`, the `⋯` costing;
- two rows of chrome sit above the diagram, and their vertical cost is what buys the horizontal.

And `TOOLBAR_GROUPS` really is a closed seven-member tuple of nouns, verified exactly as cited. **The
menu structure is still there; a single band is not where it can go.** A menu bar on a _second_ row,
or menus replacing the ladder without the identity and mode clusters joining them, are different
proposals with different arithmetic, and neither is costed here.

## The pattern this is the fourth instance of

ADR-0091 D4 was withdrawn on its own measurement. ADR-0092 M5 was withdrawn on its own measurement.
ADR-0093's width argument was withdrawn on its own measurement. This is the fourth, and the fourth
in the same direction: **an estimate of what a row can hold, made without a browser, came out
optimistic.** The falsification condition written before the work is what makes that a result rather
than an embarrassment.
