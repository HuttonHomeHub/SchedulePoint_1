# The typeface

> **Decided by the product owner, 2026-08-19, from four candidates rendered on real product
> chrome.** The choice is **Space Grotesk**, with the mandate _"something with more character"_
> — the option explicitly preferred over the safe engineering answer.

## 1. What was actually wrong

**The product had never chosen a typeface.** Not "chose a dull one" — never chose one. There was
no `@font-face` anywhere in the repository, no font file in `apps/web/public/` or `src/assets/`,
and `globals.css` merely **named** `'Inter'` first in a fallback stack. So the product's face was
whatever each reader's machine happened to have: Inter on a designer's laptop, Segoe UI on
Windows, Helvetica on a Mac without it, DejaVu Sans on a bare Linux box.

Two consequences, and the second is the one that matters here:

1. The product looked materially different on every platform, and nobody had seen the version most
   readers get.
2. **Every width measurement in this repository was taken in whichever face resolved on the CI
   runner.** The toolbar ladder, the four band floors, `CHROME_RESIDUAL_PX`, `e2e-toolbar-fit`'s
   thresholds — all of it is arithmetic over rendered text widths, and none of it had a stable
   face underneath. That is the ADR-0097 canvas finding one layer along: a value that looks
   decided, is cited by other decisions, and was never set.

Found the ADR-0058 way, by grepping for `@font-face` rather than by reading the token.

## 2. The candidates, and how they were judged

Four families, all **OFL** — free, self-hostable, no licensing cost, no per-seat question. Each was
rendered by `apps/web/scripts/shoot.mjs`'s sibling specimen against **real SchedulePoint chrome**
(the navy band, the amber mark, a page header) and a **real schedule table** (activity names,
ISO dates, durations, float, status pills), because a font poster answers a different question
than "what does our product look like in this".

|     | Family                     | Read                                                                                                                                                   |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | Archivo                    | Industrial, sturdy, slightly condensed. The most domain-appropriate — closest to how construction documents already look — and the strongest wordmark. |
| B   | IBM Plex Sans              | Drawn for engineering documentation; the most legible numerals at small sizes. The safe answer, and the one that least meets "more character".         |
| C   | **Space Grotesk** ✅       | The most distinctive: the `1`, `4` and `G` are unmistakable. Memorable on the login.                                                                   |
| D   | Manrope + Instrument Serif | A geometric sans with a serif for brand and page titles. The most deliberately "designed"; the serif is an editorial gesture on an operational tool.   |

**My recommendation was D and the product owner chose C.** Recorded because the reasoning against C
was real and is now a thing to watch rather than a thing to re-argue: distinctive numerals appear
in every date of a 2,000-row table, and character in a glyph is character you scan past a thousand
times. If a planner reports the tables feeling tiring, this is the first place to look — and the
remedy is a numeral-only fallback, not a re-litigation of the face.

## 3. The measured consequence: tabular figures are load-bearing

Checked with `fontTools` **before** the face was committed, because the specimen renders a table and
a table is where a typeface decision goes wrong quietly:

```
digit advance widths: 0:638  1:404  2:606  3:603  4:620  5:598  6:610  7:568  8:632  9:610
uniform by default: False
GSUB features: ccmp dnom frac liga locl numr pnum tnum
```

Space Grotesk's digits are **proportional by default, and dramatically so** — the `1` is 404 units
against the `0`'s 638, a **58% difference**. Left alone, a column of dates does not line up, and a
duration ticking from `9 d` to `10 d` shifts everything after it. That reads as a rendering bug
rather than a font setting, which is exactly why it needed measuring rather than assuming.

It does ship a real `tnum`, so the fix is one rule — but the rule is **load-bearing for this face**
in a way it would not have been for Archivo or Plex. It is therefore gated
(`token-architecture.test.ts`, four assertions, each verified red) rather than left as a line of
CSS somebody could tidy away.

**Scoped, not global.** `th`, `td` and an opt-in `.tabular-nums` get it; `body` deliberately does
not. The even spacing that aligns a column reads as gappy in a sentence, so a global rule would
pass the gate and be the wrong answer — there is an assertion for that too.

## 4. Delivery

- **Self-hosted, and that is a requirement rather than a preference.** The CSP is `font-src 'self'`
  (ADR-0074), so a Google Fonts URL fails **closed and silently** — before first paint, in enforce
  mode only, on the deployed origin only. The symptom would be the fallback stack, which looks like
  a design choice rather than a blocked request. Gated.
- **`src/assets/`, not `public/`** — Vite fingerprints the files so they cache immutably. `public/`
  is served verbatim and gets a short `max-age` (the `theme-boot.js` precedent, for the opposite
  reason: that file must keep a fixed path).
- **One variable file per subset**, weight axis 300–700: **41 kB for the entire family**, against
  roughly that per static weight. Latin and Latin-Extended split, so the common case never
  downloads the accented characters that European contractor names need.
- `font-display: swap`, deliberately: the fallback stack is metrically close enough that a swap
  costs a few pixels of reflow, and the alternative is invisible text on the coldest page in the
  product.

## 5. What this does NOT settle

**Every width measurement in this repository predates a stable typeface and is now suspect.** They
were taken in whatever the runner had; they are now taken in Space Grotesk, which is wider in some
places and narrower in others. The toolbar-fit gates pass today — checked — but "passes" is not
"was re-derived". The 40 → 36 control-height task (CQ-C) re-runs `measure:toolbar` at 1646 and
**re-derives the band floors from what it reports**, and that task is now also the first honest
measurement of this product's command surface in a face it actually ships.
