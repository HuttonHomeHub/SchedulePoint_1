# M1 — what broke, and how each was re-derived

M1's method is: apply the recovered derivation, run the matrix, **let it say what broke**. This is
that list. A failure here is the expected outcome for some fraction of the values — it means a value
derived against the pre-closure scope set does not hold under today's 31-name closure. Every entry
below was **re-derived, never re-floored**.

## The headline: the M1/M2 boundary does not hold at the token level

Re-valuing the page's ink dark broke **twelve** assertions, and **every one was in the canvas scope
and none in the page**. The cause is structural rather than incidental: the whole `--plot-*` family
aliases `--page-*` (23 of its 31 members are `var()` indirections), so the diagram's ink follows the
page's the instant the page moves, while `--plot-background` was still resolving through `--canvas`
to near-black.

The plan separated M1 (chrome and documents) from M2 (the diagram) as two derivations, which is
right. It also assumed they could be applied separately, which is not: **they are separable in what
they DERIVE and not in what they BREAK.** So the diagram's ground and its criticality ladder landed
in M1, and M2 keeps the links, the float tails, the drift lens, the WBS band and the legend.

## The re-derivations

| What failed                                    | Was                                 | Now                     | Why                                                                                                                                                                                                          |
| ---------------------------------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The 12 canvas-scope assertions                 | —                                   | —                       | Fixed as a class by giving the diagram a light ground (CQ-2), not one at a time.                                                                                                                             |
| `--plot-primary` / `-warning` / `-destructive` | dark-ground fills                   | a solved ladder         | See below — the constraint that binds is not the one the plan expected.                                                                                                                                      |
| `--canvas-grid-month` / `-year`                | 0.53 / 0.64 on a 0.177 ground       | 0.568 / 0.48            | Inverted: on a light ground a rule is darker than what it crosses. The year tier is the landmark and clears 3:1; the day tier stays deliberately weak (texture, reported-not-asserted).                      |
| `--plot-success`                               | 0.59 teal                           | 0.475                   | A white label on it was 3.77:1.                                                                                                                                                                              |
| `--plot-ring`                                  | 0.66 blue                           | 0.5                     | 2.74:1 on the new ground, floor is 3.                                                                                                                                                                        |
| `--chrome-secondary` / `--panel-secondary`     | 0.51 grey                           | `oklch(0.54 0.045 262)` | 2.78:1 on the recovered navy. **The clearest instance of the class this milestone exists to find**: the value was derived when that pair was not asserted at all, so it passed a genuinely different matrix. |
| The three `-hover` page members                | —                                   | derived                 | No recovered ancestor. They **invert**: on a light ground a hover walks darker, where the dark theme walked lighter.                                                                                         |
| 28 inline ratio comments in `chrome`/`panel`   | stale the moment the ground changed | recomputed              | Against the right partner for each token — a fill against its surface, a foreground against its fill.                                                                                                        |

## The criticality ladder, and the constraint that actually binds

Three fills, each ≥ 3:1 on the diagram ground, each ≥ 1.5:1 from the others, each carrying a legible
label. Searched rather than chosen — chain at 1.55:1 from a 3.15:1 base, then solve each hue for the
lightness that lands on its target:

```
on-schedule    oklch(0.624 0.115 249)   ground 3.15:1   band 3.33:1   dark label 4.86:1
near-critical  oklch(0.528 0.13  62)    ground 4.89:1   band 5.15:1   white label 5.52:1
critical       oklch(0.439 0.175 27)    ground 7.57:1   band 7.98:1   white label 8.55:1
pairwise: 1.55 / 1.55 / 2.40
```

**The binding constraint is the LABEL, not the ground.** White on the on-schedule blue is 3.56:1 — a
real 1.4.3 failure — which is exactly what the recovered reasoning meant when it recorded 1.70:1 as
the ceiling on criticality separation _"subject to a white inside-label at 4.5:1"_. Relaxing that for
the one fill that cannot carry it is what buys the whole ladder, and it costs nothing: the recovered
chrome already puts navy ink on its amber primary, so a light fill with dark ink is this design's own
pattern rather than an exception invented here.

Every fill inverts to darker-than-ground and **its label inverts with it, as one edit** —
`--plot-primary-foreground` white → dark while `--plot-destructive-foreground` and
`--plot-warning-foreground` went dark → white. That pairing flips as a unit or the picture breaks in
a way that reads as a bug rather than a colour.

## CQ-2's step, reported as a number

The answer to CQ-2 required the step between the diagram's ground and the page to be **reported as a
number, not eyeballed** (feature-spec.md §2.6). Measured with the repository's own
`parseColour`/`relativeLuminance` — the same functions `token-contrast.test.ts` uses:

| Pair                                                                                | Ratio       | ΔL (OKLCH) |
| ----------------------------------------------------------------------------------- | ----------- | ---------- |
| `--canvas` `oklch(0.958 0.004 250)` vs `--page-background` `oklch(0.982 0.002 248)` | **1.073:1** | **0.024**  |
| `--canvas` vs `--canvas-band` `oklch(0.976 0.003 250)`                              | 1.054:1     | 0.018      |
| `--canvas-band` vs `--page-background`                                              | 1.018:1     | 0.006      |

The threshold CQ-2 named is the ~0.02 OKLCH step `token-architecture.test.ts` already uses for "a
reader can see this", so **0.024 clears it** — deliberately not by much, because the diagram's ground
is meant to read as a working surface the page sits behind, not as a panel.

**What it replaces is the more useful figure.** Before this epic `--canvas` and `--page-background`
held the _same literal_, so the pair was **1.00:1** — the canvas surface scope was a rebind with no
value difference behind it at all. Two comments in `globals.css` described that state as "1.02:1
apart, two greys nobody can tell apart", which was wrong about the old state as well as the new one;
both are corrected in place.

## Two defects the green matrix was structurally incapable of reporting

Both were found by looking at a photograph, with all 216 assertions passing throughout.

1. **The weekend hatch.** ADR-0101 softened the dark value to 0.25 against a 0.212 wash — a 1.10:1
   step. Carried onto a 0.965 wash that same near-black ink is a **9:1** step: black diagonals over
   every weekend, dominating a picture whose bars they sit behind. The hatch is _reported rather than
   asserted_ by design, and a floor could never have caught "too loud" in any case. Restored to the
   dark theme's own step on the correct side (0.925 — 1.13:1 on the wash).

2. **The minimap frame.** Its gate is `max(stroke, halo) >= 3` — polarity-agnostic by design, and
   therefore green with a **white stroke on a near-white ground**. The dark halo was carrying every
   assertion while the line a reader actually sees had vanished into the ground on three sides; the
   screenshot showed a white rectangle visible only where it crossed the red bars. The two halves
   swap. **Nothing about the gate changes**, which is the part worth remembering: a correct gate,
   passing for a correct reason, cannot see this.

## What M1 leaves for M2

The links and their arrowheads, the float and drift tails, the link-slack cue, the WBS band, the
legend swatches, the progress overlay, the lens palette (`resolveLensPalette`, 23 token reads), the
month bands' step, and the categorical ramp CQ-3 put in scope. `m0-semantics.md` is the checklist.

## Gates run

`token-contrast.test.ts` 216/216 · the whole `src/styles/` suite 285/285 · web unit 4905/4905 ·
lint · typecheck · the base journey 17/17 (its axe scans run against the new values) ·
`e2e-designed-chrome` 4/4 · `e2e-overview` 4/4 · `e2e-designed-ui` 9/9.

## Two changes after the product owner saw the screens

Both answered from the pictures rather than from the plan, which is what M1-T4's review gate exists
for.

**The Project Explorer goes light; the icon rail stays navy.** CQ-1(a) said "navy chrome, light
working surfaces" and `panel` covered both the narrow rail and the wide Explorer, so both were navy —
800–900 px of flat colour carrying no information, opposite a light page. One scope could not express
both, so the **rail moves to `chrome`** (it is part of the frame, flush against the band it already
sits beside) and the `panel` family is re-valued light. Its 31 members take the page's values, with
its own ground at `oklch(0.968 0.003 250)` — one step below the page, so a sidebar reads as recessed
rather than as another card — and a slightly stronger border, because it is the edge between two
light regions rather than a divider inside one.

**The sign-in surround returns to the old app's own gradient.** `--ground`/`--ground-end` go back to
`linear-gradient(135deg, #f5f7fa, #c3cfe2)`, converted to OKLCH by solving for the closest match
(error < 0.0013 in sRGB) rather than eyeballed. The card, its navy panel, the photograph and the
amber accents are untouched. **The comment above those two tokens already claimed they were the old
app's values while holding Graphite's near-black** — re-valued for the dark theme with the prose left
behind, which is the third instance of that drift class this epic has found and the second inside
`globals.css`.

The accepted cost of the second change is stated rather than discovered later: a floating card gets
much of its drama from a dark surround, so the login reads calmer than it did.

**One journey broke and it was the right kind of break.** `e2e-designed-chrome` located the band as
`[data-surface="chrome"]`**`.first()`**, which was true while the band was the only chrome surface;
the rail now precedes it in the DOM, so `.first()` silently selected the wrong element. Re-pointed to
filter on the `<header>` the band contains — locate by what a thing _is_, not by where it happens to
sit. The suite's axe scan now covers both navy surfaces rather than one, which is a widening.
