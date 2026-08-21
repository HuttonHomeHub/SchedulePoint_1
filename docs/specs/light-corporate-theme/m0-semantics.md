# M0-T3 — The diagram's semantics, and the grounds they must hold on

Derived **mechanically** from the resolvers' own `token(` calls rather than from the spec's
table, per the task's risk note. This is the checklist M2's acceptance runs against.

## The count, reconciled

`palette.ts` resolves **88** tokens across six resolvers. Its docblock claimed **86**, which was
accurate when ADR-0097 wrote it and drifted by two: `canvasGround: token('--color-canvas')` and
`dataDateInk: token('--color-background')` were added afterwards. Docblock corrected in place.

| Resolver                      | Reads  |
| ----------------------------- | ------ |
| `resolveTsldPalette`          | 27     |
| `resolvePrintPalette`         | 30     |
| `resolveResourceStripPalette` | 3      |
| `resolveLensPalette`          | 23     |
| `resolveWbsBandPalette`       | 5      |
| `resolvePrintWbsBandPalette`  | 0      |
| **Total**                     | **88** |

Plus **three components that read `--color-*` directly**, outside every resolver — so a re-derivation
that only walks `palette.ts` misses them:

| Component         | Tokens read directly                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TsldMinimap.tsx` | `--color-canvas-minimap-frame`, `--color-canvas-minimap-frame-halo`, `--color-destructive`                                                                                                     |
| `TsldLegend.tsx`  | `--color-border`, `--color-card`, `--color-destructive`, `--color-foreground`, `--color-muted`, `--color-muted-foreground`, `--color-primary`, `--color-primary-foreground`, `--color-warning` |
| `GanttPanel.tsx`  | `--color-primary`                                                                                                                                                                              |

The minimap's frame pair is the sharpest of these: it exists in **no** resolver, has no ancestor in
the recovered `.corporate` block (ADR-0100 landed it 2026-08-21), and its two-tone frame was derived
against a dark ground. A white stroke on paper is the single most likely visible defect in M2.

## The distinctions, by resolver

Each row is one semantic the diagram must carry. **The token is not the semantic** — see the
overloads below.

### `resolveTsldPalette` — 27 named fields

| Field                     | Token                             | Dark fallback |
| ------------------------- | --------------------------------- | ------------- |
| `canvasGround`            | `--color-canvas`                  | `#14161c`     |
| `gridLine`                | `--color-border`                  | `#2a2f3a`     |
| `gridLineDay`             | `--color-canvas-grid-day`         | `#565c6a`     |
| `gridLineMonth`           | `--color-canvas-grid-month`       | `#2a2f3a`     |
| `gridLineYear`            | `--color-canvas-grid-year`        | `#9098ab`     |
| `edge`                    | `--color-muted-foreground`        | `#7a8090`     |
| `bar`                     | `--color-primary`                 | `#3b6fbf`     |
| `critical`                | `--color-destructive`             | `#c83c3c`     |
| `nearCritical`            | `--color-warning`                 | `#d29628`     |
| `outline`                 | `--color-foreground`              | `#e6e8ee`     |
| `selection`               | `--color-ring`                    | `#6ea8fe`     |
| `nonWorking`              | `--color-muted`                   | `#20242d`     |
| `nonWorkingHatch`         | `--color-canvas-nonworking-hatch` | `#454b58`     |
| `today`                   | `--color-destructive`             | `#c83c3c`     |
| `todayInk`                | `--color-destructive-foreground`  | `#ffffff`     |
| `dataDate`                | `--color-foreground`              | `#e6e8ee`     |
| `dataDateInk`             | `--color-background`              | `#161a22`     |
| `conflict`                | `--color-warning`                 | `#d29628`     |
| `laneOverlap`             | `--color-warning`                 | `#d29628`     |
| `labelInside`             | `--color-primary-foreground`      | `#ffffff`     |
| `labelInsideCritical`     | `--color-destructive-foreground`  | `#ffffff`     |
| `labelInsideNearCritical` | `--color-warning-foreground`      | `#1a1a1a`     |
| `labelBeside`             | `--color-foreground`              | `#e6e8ee`     |
| `barStroke`               | `--color-border`                  | `#2a2f3a`     |
| `hoverRing`               | `--color-muted-foreground`        | `#7a8090`     |
| `handleHalo`              | `--color-canvas`                  | `#161a22`     |
| `monthBand`               | `--color-canvas-band`             | `#1b202a`     |

### `resolvePrintPalette` — 30 named fields

| Field                     | Token                             | Dark fallback |
| ------------------------- | --------------------------------- | ------------- |
| `ground`                  | `--color-background`              | `#ffffff`     |
| `ink`                     | `--color-foreground`              | `#1a1a1a`     |
| `mutedInk`                | `--color-muted-foreground`        | `#6b7280`     |
| `canvasGround`            | `--color-background`              | `#ffffff`     |
| `gridLine`                | `--color-border`                  | `#e5e7eb`     |
| `gridLineDay`             | `--color-canvas-grid-day`         | `#f5f6f8`     |
| `gridLineMonth`           | `--color-canvas-grid-month`       | `#bcc2ca`     |
| `gridLineYear`            | `--color-canvas-grid-year`        | `#8b93a1`     |
| `edge`                    | `--color-muted-foreground`        | `#6b7280`     |
| `bar`                     | `--color-primary`                 | `#2f62c4`     |
| `critical`                | `--color-destructive`             | `#c2331f`     |
| `nearCritical`            | `--color-warning`                 | `#b58900`     |
| `outline`                 | `--color-foreground`              | `#1a1a1a`     |
| `selection`               | `--color-ring`                    | `#3b6fbf`     |
| `nonWorking`              | `--color-muted`                   | `#f0f0f0`     |
| `nonWorkingHatch`         | `--color-canvas-nonworking-hatch` | `#c7c7c7`     |
| `today`                   | `--color-destructive`             | `#c2331f`     |
| `todayInk`                | `--color-destructive-foreground`  | `#ffffff`     |
| `dataDate`                | `--color-foreground`              | `#1a1a1a`     |
| `dataDateInk`             | `--color-background`              | `#ffffff`     |
| `conflict`                | `--color-warning`                 | `#b58900`     |
| `laneOverlap`             | `--color-warning`                 | `#b58900`     |
| `labelInside`             | `--color-primary-foreground`      | `#ffffff`     |
| `labelInsideCritical`     | `--color-destructive-foreground`  | `#ffffff`     |
| `labelInsideNearCritical` | `--color-warning-foreground`      | `#1a1a1a`     |
| `labelBeside`             | `--color-foreground`              | `#1a1a1a`     |
| `barStroke`               | `--color-border`                  | `#e5e7eb`     |
| `hoverRing`               | `--color-muted-foreground`        | `#6b7280`     |
| `handleHalo`              | `--color-canvas`                  | `#ffffff`     |
| `monthBand`               | `--color-canvas-band`             | `#f7f7f7`     |

### `resolveResourceStripPalette` — 3 named fields

| Field  | Token                      | Dark fallback |
| ------ | -------------------------- | ------------- |
| `bar`  | `--color-primary`          | `#3b6fbf`     |
| `axis` | `--color-border`           | `#2a2f3a`     |
| `tick` | `--color-muted-foreground` | `#7a8090`     |

### `resolveLensPalette` — 13 named fields

| Field              | Token                            | Dark fallback |
| ------------------ | -------------------------------- | ------------- |
| `critical`         | `--color-destructive`            | `#c83c3c`     |
| `nearCritical`     | `--color-warning`                | `#d29628`     |
| `bar`              | `--color-primary`                | `#3b6fbf`     |
| `neutral`          | `--color-muted-foreground`       | `#7a8090`     |
| `floatCritical`    | `--color-destructive`            | `#c83c3c`     |
| `floatLow`         | `--color-warning`                | `#d29628`     |
| `floatMedium`      | `--color-info`                   | `#3b6fbf`     |
| `floatHigh`        | `--color-success`                | `#2f9e44`     |
| `neutralInk`       | `--color-background`             | `#ffffff`     |
| `floatCriticalInk` | `--color-destructive-foreground` | `#ffffff`     |
| `floatLowInk`      | `--color-warning-foreground`     | `#1a1a1a`     |
| `floatMediumInk`   | `--color-info-foreground`        | `#ffffff`     |
| `floatHighInk`     | `--color-success-foreground`     | `#ffffff`     |

### `resolveWbsBandPalette` — 5 named fields

| Field       | Token                        | Dark fallback |
| ----------- | ---------------------------- | ------------- |
| `bar`       | `--color-primary`            | `#3b6fbf`     |
| `derived`   | `--color-muted-foreground`   | `#7a8090`     |
| `rule`      | `--color-border`             | `#2a2f3a`     |
| `label`     | `--color-primary-foreground` | `#ffffff`     |
| `selection` | `--color-ring`               | `#8ab4f8`     |

## The over-loaded tokens — where one value carries several meanings

These are the entries most likely to want a **new name** in M2, and the standing rule is values only,
so each one is a decision to make deliberately rather than a change to slip in.

| Token                            | Fields that share it                                          |
| -------------------------------- | ------------------------------------------------------------- |
| `--color-background`             | `canvasGround`, `dataDateInk`, `ground`, `neutralInk`         |
| `--color-border`                 | `axis`, `barStroke`, `gridLine`, `rule`                       |
| `--color-canvas`                 | `canvasGround`, `handleHalo`                                  |
| `--color-destructive`            | `critical`, `floatCritical`, `today`                          |
| `--color-destructive-foreground` | `floatCriticalInk`, `labelInsideCritical`, `todayInk`         |
| `--color-foreground`             | `dataDate`, `ink`, `labelBeside`, `outline`                   |
| `--color-muted-foreground`       | `derived`, `edge`, `hoverRing`, `mutedInk`, `neutral`, `tick` |
| `--color-primary-foreground`     | `label`, `labelInside`                                        |
| `--color-warning`                | `conflict`, `floatLow`, `laneOverlap`, `nearCritical`         |
| `--color-warning-foreground`     | `floatLowInk`, `labelInsideNearCritical`                      |

**Read that table with one caveat.** It is built across all six resolvers, so a row can mean either
of two different things, and the difference matters for whether M2 can separate them:

- **Within one resolver** — `--color-warning` carrying `conflict`, `laneOverlap` and `nearCritical`
  inside `resolveTsldPalette`. These are three meanings painted in one picture at the same time, so
  a planner genuinely cannot tell them apart, and separating them needs a **new token name**.
- **Across resolvers** — `--color-background` carrying `ground` in the print resolver and
  `neutralInk` in the lens resolver. These never appear in the same picture; the token is reused, not
  overloaded, and re-valuing it is enough.

The first kind is a design decision for M2; the second is not. Do not let the table's shape imply
otherwise.

## The lightness inversions — the flip that must happen as a unit

On a dark ground every bar fill is **lighter** than what it sits on. On a light ground every one must
become **darker**, and the inks on them invert with them. Three pairings flip together or the picture
breaks in a way that reads as a bug rather than a colour:

1. **Every bar fill against its ground.** `critical`, `nearCritical`, `neutral`, `summary`,
   `milestone` and the three `float*` fills all currently sit lighter-than-ground. All must end
   darker-than-ground, and the ordering among them is what carries criticality.
2. **`handleHalo` is deliberately the inverse of `outline`.** A handle is drawn as a stroke with a
   halo behind it so it reads on any fill; today the halo is `--color-canvas` (the ground) and the
   stroke is `--color-foreground` (the ink). That pairing is correct in both polarities **only if
   both move**, so it is one change and not two.
3. **`labelInside*` vs `labelBeside`.** Inside-labels sit on a bar fill and beside-labels on the
   ground. These have different grounds and therefore different answers; the recovered `.corporate`
   reasoning already records that a white inside-label at 4.5:1 is what caps criticality separation
   at **1.70:1 on a near-white ground** — which is CQ-2's live constraint, and the reason relaxing
   the inside-label requirement is the lever that buys separation back.

## What this sheet does not cover

The **non-working hatch, the month bands and the weekend wash** are pattern-and-value decisions
rather than single token reads, and two of the three were named in the original complaint. They are
M2's, and they are the part where "quiet" is the requirement rather than a ratio.
