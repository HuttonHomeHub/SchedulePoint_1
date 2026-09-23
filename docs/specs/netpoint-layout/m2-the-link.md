# NetPoint-layout M2: the link

**Status:** Landed 2026-09-23. Spec §4.7; plan "Milestone M2: The link"; ADR-0154.

This file records what M2 changed, what was measured, and where the build departed from the plan.

## What shipped

- **`--canvas-link-minor`**, the non-driving link's own token, beside `--canvas-lane-rule`. Its
  contrast pairs against both grounds landed first and were red with a too-light value (1.40:1 and
  1.47:1). `oklch(0.61 0.008 252)` clears 3:1 on both. It closes `docs/TECH_DEBT.md` #367: the link
  is no longer drawn in the page's secondary text colour.
- **`linkDriving`**, a palette key reading `--primary`, so an ordinary driving link can be told from
  a bar by colour in a measurement harness.
- **The link language** (`link-marks.ts`, painter layer 2 on the refreshed path): rung inks for
  driving links, a 1 px solid non-driving link, a dash for waiting time only, filled chevrons, lag
  plates, and bucketed passes. Flag-off keeps the legacy passes byte for byte.
- **The legend** keys every mark and drops "Non-driving link — dashed". The lag run on a bar is
  renamed "Lag run (on the bar)" so it cannot be read as waiting time on a link.
- **The spoken slack** already equalled the drawn gap: PR #663 fixed it as the seventh site of the
  drawn-span defect. M2-T4 is therefore the legend and the ADR only.

## What was measured

| Reading                                          | Result                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contrast pairs                                   | Red at `oklch(0.85)` (1.40 / 1.47:1); green at `oklch(0.61)`.                                                                                                                                                                                                                                                            |
| Golden log                                       | One contiguous changed block, the edge layer (214 lines before and 306 after unchanged). Checked by script against a written prediction: 0 violations. Deltas: +8 `moveTo` / +24 `lineTo` (8 chevrons), +2 `fillRect` / `strokeRect` / `fillText` (2 plates), −1 `stroke` / `beginPath` / `setLineDash` (bucket passes). |
| Recorder controls (FC-N7)                        | `visibleLinks === edges`: 188 against 188. Verified red against stroked chevrons: 956 polylines and 1,536 non-axis-aligned segments.                                                                                                                                                                                     |
| Draw budget                                      | Strokes and fills are per bucket at 2,000 activities / 4,000 links. Verified red with a stroke per link.                                                                                                                                                                                                                 |
| Continuity (`measure-ink.mjs`, `WAITING_DASH=1`) | Before M2, all 104 non-driving links on Unit 300 were dashed end to end. After, 61 waiting runs carry 43% of link ink at 4 px/day (28,827 of 66,588 px²) and 56% at 12 px/day. Everything else is solid.                                                                                                                 |
| Link weight (`measure-ink.mjs`)                  | Link ink is 60–127% of bar ink, unchanged by M2: the language changes marks, not routes.                                                                                                                                                                                                                                 |

**Paint cost is not claimed.** It belongs on the product owner's hardware (ADR-0128), with M0-T6's.

## Departures from the plan

- **The recorder is not taught to stitch.** The spec said waiting runs would be drawn under a
  harness-visible key so a recorder could stitch them back to their link. That was built, and the
  recorder's own control rejected it: 76 polylines against 188 links. Links converge on node glyphs
  by design, so a run ending at a bar's finish could belong to either of two links. Harnesses now set
  `scene.solidWaiting`, because a link's geometry does not depend on its dash. `WAITING_DASH=1` turns
  the dash back on for the ink harness's continuity count only.
- **A driving link is never dashed.** The spec's rule dashes "the part of the route inside the
  relationship's drawn gap". Before the exclusion, driving links on Unit 300 drew dashed runs (14 in
  the first framing the crossings harness paints), because calendar days put a weekend between their
  ends. A driving link has no waiting by definition, so it
  is excluded.
- **The waiting extent is read from the frame's cached rects.** The first version re-parsed four
  dates per link, and `paint.rect-cache-budget.test.ts` refused it: adding links must add no date
  parsing. `waitingSpanX` reads the rects, and its length in days is `edgeGapDays` exactly.

## The accessibility review (§19.13)

The review passed with nits. It checked by derivation, not by assertion, that the waiting dash's length equals the spoken slack for all four link types. It also checked that a driving link's rung can be recovered from its two endpoints' node shapes. Two findings were folded in:

- **The legend's list roles are now explicit.** It is a `<ul>` under Preflight's `list-style: none`, which WebKit/VoiceOver treats as no list at all (ADR-0122). This defect predates M2, but M2 adds seven rows to that list. The fix follows `TsldPanel`'s band lists. The test asserts the attribute, not the role: jsdom infers the role from the tag, so a role query passes either way. Verified red without the fix.
- **The three driving-link inks are gated at 3:1 on both grounds.** `--canvas-link-minor` already had this gate. A link has no outline, so its stroke is the whole mark. `--primary` is 3.15:1 against the ground, with little margin, and nothing pinned it in the link role. Verified red at a 3.2 floor.

## The journey

`e2e-arrange/link-language.spec.ts` reads `--canvas-link-minor` on the scene canvas, where the
painter reads it, and asserts it is not the page's secondary text colour. It then opens the legend
and asserts the swatch's computed colour equals the token resolved in the canvas scope, and that the
retired row is gone. That covers the ADR-0102 and ADR-0100 M4 traps. The ADR-0121 trap (a `var()`
handed to Canvas 2D) cannot occur, because `resolveTsldPalette` returns computed values.
