# NetPoint grammar — M0-T2 solved values

**Status:** reported, not gated. Produced by `apps/web/scripts/solve-netpoint-grammar.ts`
(`pnpm exec tsx scripts/solve-netpoint-grammar.ts` from `apps/web`). The gate that holds these values
is `token-contrast.test.ts`'s NetPoint block (M0-T3), which was verified red before it was relied on.

Every value is solved against the near-white ground CQ-2 chose, and every candidate outside the sRGB
gamut was refused rather than clamped (`oklchInGamut`, `apps/web/src/test/colour.ts`).

## How each value was chosen

- **Quiet surfaces** (the band, the non-working wash and the lane rule) keep today's separation from
  the ground. They are taken darker, because nothing can be lighter than near-white (spec §4.13 A-n3).
- **Grid tiers** sit inside FC-G2's ceilings, and a coarser tier stays darker (ADR-0056 §2):
  - day: 1.15:1;
  - month: 1.50:1, against a ceiling of 1.80;
  - year: 2.00:1, against a ceiling of 2.50.
- **`--canvas-bar`** is the lightest green (C 0.13, H 150) that clears 3:1 on both the ground and the
  band, with a 0.1 margin. Its ladder and label conditions are checked, not assumed.
- **`--canvas-link-minor`** is the lightest violet (C 0.09, H 295) that clears 3:1 on the ground, the
  band and print, with a 0.2 margin. Quietness comes from weight (spec R10).
- **`--canvas-link`** (driving) clears 4.0:1 on all three grounds.
- **`--canvas-link-mark`** is the lightest violet that clears 3:1 on the minor line, the driving line
  and the ground.

## Two findings that change the design

1. **The gap label's text is `--canvas-link-mark`, not the minor ink.** The minor ink is 3.37:1 on the
   ground chip, against FC-G2's 4.5:1 for text. The mark ink is 12.67:1, and it keeps the label in the
   link's own hue family.
2. **A darker mark on a critical link is impossible.** Black on the critical line is 2.46:1, so FC-G2's
   "mark ≥ 3:1 on its line" cannot hold for the critical rung whatever value is chosen. That is
   amended in [`conditions.md`](./conditions.md), quoting commit `c5136616`.

## M0-T2 — solved values (ground `oklch(0.995 0.002 250)`)

| Token                 | Value                    | On ground | On band | On print |
| --------------------- | ------------------------ | --------- | ------- | -------- |
| `--canvas`            | `oklch(0.995 0.002 250)` | 1:1       | 1.05:1  | 1.01:1   |
| `--canvas-band`       | `oklch(0.977 0.003 250)` | 1.05:1    | 1:1     | 1.07:1   |
| `--canvas-nonworking` | `oklch(0.984 0.004 250)` | 1.03:1    | 1.02:1  | 1.05:1   |
| `--canvas-lane-rule`  | `oklch(0.972 0.003 250)` | 1.07:1    | 1.01:1  | 1.08:1   |
| `--canvas-grid-day`   | `oklch(0.947 0.003 250)` | 1.15:1    | 1.09:1  | 1.17:1   |
| `--canvas-grid-month` | `oklch(0.862 0.005 250)` | 1.5:1     | 1.42:1  | 1.52:1   |
| `--canvas-grid-year`  | `oklch(0.776 0.008 250)` | 2:1       | 1.9:1   | 2.03:1   |
| `--canvas-bar`        | `oklch(0.629 0.13 150)`  | 3.27:1    | 3.11:1  | 3.32:1   |
| `--canvas-link`       | `oklch(0.592 0.13 295)`  | 4.22:1    | 4:1     | 4.28:1   |
| `--canvas-link-minor` | `oklch(0.643 0.09 295)`  | 3.37:1    | 3.2:1   | 3.42:1   |
| `--canvas-link-mark`  | `oklch(0.331 0.13 295)`  | 12.67:1   | 12.03:1 | 12.85:1  |

## M0-T2 — the constraints, checked

| Check                                            | Value   | Bar      |
| ------------------------------------------------ | ------- | -------- |
| bar vs near-critical (neighbour floor ≥ 1.50)    | 1.66:1  | ≥ 1.50   |
| near-critical vs critical (unchanged)            | 1.55:1  | ≥ 1.50   |
| near-critical on the new ground                  | 5.44:1  | ≥ 3.00   |
| critical on the new ground                       | 8.43:1  | ≥ 3.00   |
| label ink `--primary-foreground` on the bar      | 5.21:1  | ≥ 4.50   |
| mark on the minor line                           | 3.76:1  | ≥ 3.00   |
| mark on the driving line                         | 3.01:1  | ≥ 3.00   |
| mark on the ground                               | 12.67:1 | ≥ 3.00   |
| critical mark on the critical line (darker step) | —       | see note |
| month rule vs minor link                         | 2.25:1  | reported |
| bar vs minor link (luminance)                    | 1.03:1  | reported |
| gap-label text (minor ink) on the ground chip    | 3.37:1  | ≥ 4.50   |
| gap-label text (mark ink) on the ground chip     | 12.67:1 | ≥ 4.50   |

Black on the critical line: 2.46:1. Black on the near-critical line: 3.8:1.

## FC-G3 — hue separation (ΔE76, floor ≥ 5)

| Link ink              | vs bar | vs near-critical | vs critical |
| --------------------- | ------ | ---------------- | ----------- |
| `--canvas-link`       | 98.2   | 95.4             | 87.2        |
| `--canvas-link-minor` | 81.9   | 84.0             | 81.6        |
| `--canvas-link-mark`  | 107.5  | 97.6             | 84.1        |

## M0-T3 — the pairs, verified red

The FC-G2 and FC-G3 pairs are in `apps/web/src/styles/token-contrast.test.ts` as the block "NetPoint
grammar — FC-G2/FC-G3 pairs, on the proposed canvas scope". That is 29 cases, over today's canvas
scope with the solved values laid over it (`NETPOINT_PROPOSED`). Each milestone deletes its entries
from the overlay as its values ship. The last case fails if an entry is left behind after its value
has shipped.

Seven mutations were run with
`pnpm exec vitest run src/styles/token-contrast.test.ts -t "NetPoint grammar"`, restoring the file
after each. Every one went red:

| Mutation                              | Failed                                       |
| ------------------------------------- | -------------------------------------------- |
| minor link lightened to L 0.72        | 3 (link on each ground)                      |
| mark lightened to L 0.45              | 2 (mark on the driving line, gap-label text) |
| month rule darkened to L 0.70         | 2 (month ceiling on the ground and the band) |
| bar darkened to L 0.56                | 2 (ladder neighbour floor, label on the bar) |
| minor link set to the bar's value     | 1 (ΔE)                                       |
| lane rule set to its shipped value    | 1 (stale overlay entry)                      |
| day rule darkened past the month rule | 1 (tier order)                               |

## M0-T3 — the `--primary` consumers in the canvas scope

Each consumer is classified by what its colour **means** (spec §4.13 A-n1). Those that mean "the
activity bar" move to `--canvas-bar` at M2. Those that mean interface keep `--primary`.

| Consumer                                                                  | Meaning                       | At M2                                     |
| ------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------- |
| `palette.ts:166` `resolveTsldPalette` `bar`                               | activity bar                  | `--canvas-bar`                            |
| `palette.ts:264` `PRINT_TOKEN_SOURCES.bar`                                | activity bar (paper)          | `--canvas-bar`                            |
| `palette.ts:376` `resolveLensPalette` `bar`                               | activity bar (Colour-by lens) | `--canvas-bar`                            |
| `palette.ts:422` `lensLegendVarPalette` `bar`                             | activity bar (lens legend)    | `--canvas-bar`                            |
| `palette.ts:479` `resolveWbsBandPalette` `bar`                            | activity bar (WBS summary)    | `--canvas-bar`                            |
| `TsldLegend.tsx:51,369,373,377,386,390,394,401,432,473`                   | activity bar swatches         | `--canvas-bar`                            |
| `GanttPanel.tsx:1860` `bg-primary/60 ring-primary/70`                     | activity bar (Gantt)          | `bg-canvas-bar/60`, through the new alias |
| `palette.ts:164,262` `linkDriving`                                        | driving link                  | `--canvas-link` at M3                     |
| `TsldLegend.tsx:103` "Driving link" swatch                                | driving link                  | `--canvas-link` at M3                     |
| `TsldLegend.tsx:489` slack-chip swatch                                    | the selection-only slack chip | retired with the chip at M3 (G6)          |
| `palette.ts:347` `resolveResourceStripPalette` `bar`                      | resource demand               | keeps `--primary` (A-n1)                  |
| `TsldMinimap.tsx:400` `border-primary`                                    | interface (panel edge)        | keeps `--primary`                         |
| `TsldCanvas.tsx:762` cursor date readout `bg-primary`                     | interface (a readout)         | keeps `--primary`                         |
| DOM buttons in the canvas container (dock, create popover, selection bar) | interface                     | keep `--primary`                          |

The cursor readout is the one judgement call. ADR-0106 records that it shipped using "the bar
colour", but it is a date readout that follows the pointer, not an activity. Painting it green would
make it read as a bar under the cursor, so it stays interface blue.
