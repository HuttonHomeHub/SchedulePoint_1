# Diagram mark contrast: M0 solved values

Produced by `scripts/solve-mark-contrast.ts` (run from `apps/web` with `tsx`). It is reported, never
gated: `token-contrast.test.ts` is the gate. Today's tokens are read by the gate's own resolver. These
figures supersede the hand arithmetic in `spec.md` §4.2. The solver agrees with it on both values
(bar `oklch(0.616 0.13 150)`, link `oklch(0.645 0.13 295)`) and differs only in the driving link's
fallback hex (`#947cd4` here, `#947fd4` by hand).

How the two values were chosen, beyond the spec's floors: the bar is the darkest value that keeps the
ladder through the viewport tint 0.04 clear of its 1.5 floor. The link is the darkest value whose
contrast is at least 1.3 % below the bar's on every ground; the headroom stops an eight-bit fallback
hex flipping the order.

## Solved values

| Token           | Today                   | Solved                  | sRGB fallback |
| --------------- | ----------------------- | ----------------------- | ------------- |
| `--canvas-bar`  | `oklch(0.629 0.13 150)` | `oklch(0.616 0.13 150)` | `#409a59`     |
| `--canvas-link` | `oklch(0.592 0.13 295)` | `oklch(0.645 0.13 295)` | `#947cd4`     |

## Contrast on each ground (today to solved)

| Ink                               | On ground        | On band          | On print         |
| --------------------------------- | ---------------- | ---------------- | ---------------- |
| `--canvas-bar`                    | 3.27:1 to 3.45:1 | 3.21:1 to 3.38:1 | 3.32:1 to 3.5:1  |
| `--canvas-link`                   | 4.22:1 to 3.4:1  | 4.13:1 to 3.33:1 | 4.28:1 to 3.45:1 |
| `--canvas-link-minor` (unchanged) | 3.37:1 to 3.37:1 | 3.3:1 to 3.3:1   | 3.42:1 to 3.42:1 |

## Every pair that involves a changed token

| Pair                                           | Today  | Solved | Floor  |
| ---------------------------------------------- | ------ | ------ | ------ |
| bar vs near-critical                           | 1.66:1 | 1.58:1 | ≥ 1.50 |
| bar vs critical                                | 2.57:1 | 2.44:1 | ≥ 1.50 |
| bar vs near-critical through the viewport tint | 1.62:1 | 1.54:1 | ≥ 1.50 |
| bar vs critical through the viewport tint      | 2.48:1 | 2.36:1 | ≥ 1.50 |
| label `--primary-foreground` on the bar        | 5.21:1 | 4.95:1 | ≥ 4.50 |
| inset ring `--foreground` on the bar           | 3.81:1 | 3.62:1 | ≥ 3.00 |
| mark on the bar                                | 3.87:1 | 3.68:1 | ≥ 3.00 |
| mark on the driving line                       | 3.01:1 | 3.73:1 | ≥ 3.00 |
| mark on the minor line                         | 3.76:1 | 3.76:1 | ≥ 3.00 |

## The ordering (ratio on the ground, bar over link)

| Link                  | On ground today | On ground solved |
| --------------------- | --------------- | ---------------- |
| `--canvas-link`       | 0.777           | 1.014            |
| `--canvas-link-minor` | 0.971           | 1.022            |

## Hue separation (ΔE76, floor ≥ 5)

| Link ink              | vs solved bar | vs near-critical | vs critical |
| --------------------- | ------------- | ---------------- | ----------- |
| `--canvas-link`       | 97.8          | 96.2             | 89.0        |
| `--canvas-link-minor` | 82.0          | 84.0             | 81.6        |
| `--canvas-link-mark`  | 107.0         | 97.6             | 84.1        |

## Reported, not fixed here

- `--plot-warning` `oklch(0.528 0.13 62)` is **outside the sRGB gamut** (`oklchInGamut`, tolerance
  1e-4), so a browser clamps it. Confirmed; filed as its own register row. Its ratio on the ground
  is 5.44:1.
- `--muted-foreground` on the ground is 5.92:1 (the pin and the ghost outlines; not links).

## Gate mutations (`token-contrast.test.ts`, "diagram mark contrast" block)

| Mutation of the overlay                | Result                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| overlay empty (today's CSS)            | 6 red: bar 3.27 against driving link 4.22 and minor link 3.37, on three grounds |
| link back to `oklch(0.592 0.13 295)`   | 4 red                                                                           |
| bar back to `oklch(0.629 0.13 150)`    | 7 red                                                                           |
| bar darkened to `oklch(0.58 0.13 150)` | 2 red, the ladder pair among them                                               |
| the solved values                      | all 403 cases in the file green                                                 |

## Not measured here

The Gantt bar's `bg-canvas-bar/60` fill and `ring-canvas-bar/70` ring are composited over the Gantt
row's own ground, which is not necessarily `--canvas` and is only measurable in a browser. The
Chromium measurement was not taken in this pass (Playwright is run centrally), so the spec's ≈ 2.2:1
estimate is neither confirmed nor refuted, and no register row is filed for it.
