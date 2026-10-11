# Toolbar redesign — M6 measurement record (the visual brief, V1–V7)

Taken 2026-10-10 on the M6 build by `apps/web/measure-toolbar/toolbar-redesign-m6.spec.ts` (a harness, not a gate;
ADR-0081 §3), fine and coarse pointers, the container's Chromium 1194, the M5 fixture (a plan with a long name,
three activities, one link, a peer who can hold the pen). `M6_TAG=before` was taken on `7578110`, `M6_TAG=after` on
this build. Photos: `photos/m6-before-*` and `photos/m6-after-*` — `<pointer>-<cell>-<state>`, states `pen` (the pen
held), `filtered` (Has constraint on), `shaded` (a peer holds the pen), `conflict` (a cycling conflict read-out),
`nopen` (the pen not held, fine and coarse, at 1280 and 1912 only), `header-plan`, `header-org`, `header-multi` and the
open organisation menu. Cells: 1024 × 600, 1280 × 800, 1440 × 900,
1912 × 1080 for the band; 320 × 720, 640 × 480, 1024 × 600, 1280 × 800, 1646 × 1097 for the header. Readings:
`apps/web/measure-output/toolbar-redesign-m6-{before,after}.{fine,coarse}.json` (not committed; the tables below are
the record).

**Product-owner sign-off (SC-16) is not recorded here.** The photos are the material for it; nothing in this file
claims it has been given.

## 0. What the brief or the plan got wrong, or left open

**Revised after the M6 review (2026-10-10).** Sections 2, 3, 4, 6 and 7 below describe the build **as revised**: the
review's findings changed the closing action, the pill, the Author dash, the DO row mark, the filter badge and the
single-organisation label, and `photos/m6-after-*` were all re-taken on the revised build. The table in §1 is
**unchanged to the pixel** by the revision (re-read from the re-taken JSON: every cell matches), because nothing in it
spends width — a ring, a hairline and a smaller badge are painted inside or outside the box, and a wrench is the same
14 px as the pencil-and-rule it replaced. The ladder (`promotion-widths.*.json`) was therefore **not** re-taken.

1. **V1 has no form beyond "a quiet leading row mark".** Built as a 14 px glyph (eye for LOOK, pencil-and-rule for
   DO) in `--muted-foreground`, `aria-hidden`, **only from 79 rem** (`@roomy/deck:`). It costs 18 px of a row, and
   the LOOK row at 1024 has 28.7 px with a conflict showing (§1): an unconditional mark would leave 10.7 px for a
   two-digit read-out that SC-1 asserts on two lines. Above 79 rem the ladder's free widths are read with it present.
   Whether a glyph is the mark the owner meant is a sign-off question.
2. **V2's pills are a zero-width pseudo-element, and the first build overflowed the deck.** Hung 2 px past each
   group, the pill made the deck's `scrollWidth` exceed its `clientWidth` by 2 px at every width, which `Deck`'s own
   `deckScrolls` reads as "the line scrolls": `narrow-shell.spec.ts` ("1280 x 600 does not scroll sideways") caught it.
   The pill now fills the box exactly.
3. **The plan sets no numeric target for the header (V5).** SC-4 (one line at ≥ 1024, both pointers) and SC-5 (band
   ≤ 40 % of height or scrolled away below 1024) are the only criteria, and both hold (§5). The numbers at 320 and
   640 are recorded and **unchanged by M6**; what could lower them is listed in §5 as options, not built.
4. **`Layers` is not only the Baseline overlay's icon.** `Baselines…` in Analysis wears it, so the overlay moved to
   `Diff` (a plus-and-minus square) rather than leaving two different things on one glyph. `GitCompare` was refused:
   it is a one-letter step from Compare revisions' `GitCompareArrows`, two controls away. `lucide-react` is already
   in `scripts/dependency-claims.json` and `check:claims` passes without a new entry.
5. **Three icon-only decisions moved the whole ladder.** Baseline overlay, Comments and Settings… went `'never'`
   (owner, 2026-10-10), which frees LOOK about 160 px and DO about 48 px at 1280. `promotion-widths.*.json` were
   re-taken (the M5 procedure, both harness runs) and `promotion-ladder.ts` re-derived; **Critical only now promotes at
   80 rem, Health check promotes before Share… at 1280 on a mouse (it was the other way round), and Compare revisions
   is on the bar at 1646.** Five journeys named 1280 as "nothing promoted" or opened Compare revisions from its menu
   and were updated (§6).
6. **Type-ahead on the organisation menu is not built.** `Menu` has none, and adding it changes a shared primitive's
   key set, which ADR-0111 reviews before release (and the brief said to stop if the contract must change). The
   arrow/Home/End-only limit is stated in `OrgSwitcher.tsx`, `UX_STANDARDS.md` and `COMPONENT_LIBRARY.md`.
7. **The first organisation-switcher build wrapped the header at 1024.** The 12 rem cap sat on the name, so the
   glyph, chevron and padding stood on top of it; with two organisations the header read 92 px (fine) / 108 px
   (coarse) at 1024. The cap is on the control now: 48 / 52 (§5).

## 1. Free gap per deck row, before and after (SC-1, SC-17)

Taken as the M5 harness's "unused" reading is, but from the gap between the last group and the trailing one, so a
`ml-auto` group does not read as full. **The 1024 cells are unchanged to the pixel** — the mark is `roomy` only and the
pill spends no width — which is what keeps SC-1 and the 28.7 px LOOK reserve intact. At and above 1280 the gaps move
because Baseline overlay, Comments and Settings… lost their words and the ladder spent the room.

**Fine pointer — free gap per row (px; lines in brackets when not 1)**

| State    | Cell      | LOOK before → after | DO before → after |
| -------- | --------- | ------------------- | ----------------- |
| pen      | 1024x600  | 154 → 154           | 60.3 → 60.3       |
| pen      | 1280x800  | 231.4 → 274         | 68.9 → 29.3       |
| pen      | 1440x900  | 273.4 → 278.4       | 103.2 → 14.5      |
| pen      | 1912x1080 | 213.4 → 224.7       | 59.8 → 151.8      |
| filtered | 1024x600  | 154 → 154           | 60.3 → 60.3       |
| filtered | 1280x800  | 231.4 → 274         | 68.9 → 29.3       |
| filtered | 1440x900  | 273.4 → 278.4       | 103.2 → 14.5      |
| filtered | 1912x1080 | 213.4 → 224.7       | 59.8 → 151.8      |
| shaded   | 1024x600  | 154 → 154           | 58.2 → 58.2       |
| shaded   | 1280x800  | 231.4 → 274         | 66.8 → 27.2       |
| shaded   | 1440x900  | 273.4 → 278.4       | 101.1 → 12.4      |
| shaded   | 1912x1080 | 213.4 → 224.7       | 57.7 → 149.7      |
| conflict | 1024x600  | 28.7 → 28.7         | 60.3 → 60.3       |
| conflict | 1280x800  | 106.1 → 148.7       | 68.9 → 29.3       |
| conflict | 1440x900  | 148.1 → 153.1       | 103.2 → 14.5      |
| conflict | 1912x1080 | 88.1 → 99.4         | 59.8 → 151.8      |

**Fine pointer — app header (px high / band px)**

| Screen | Cell      | before    | after     |
| ------ | --------- | --------- | --------- |
| plan   | 320x720   | 192 / 239 | 192 / 239 |
| plan   | 640x480   | 96 / 143  | 96 / 143  |
| plan   | 1024x600  | 48 / 139  | 48 / 139  |
| plan   | 1280x800  | 48 / 139  | 48 / 139  |
| plan   | 1646x1097 | 48 / 139  | 48 / 139  |
| org    | 320x720   | 96 / 99   | 96 / 99   |
| org    | 640x480   | 48 / 51   | 48 / 51   |
| org    | 1024x600  | 48 / 51   | 48 / 51   |
| org    | 1280x800  | 48 / 51   | 48 / 51   |
| org    | 1646x1097 | 48 / 51   | 48 / 51   |
| multi  | 320x720   | —         | 192 / 239 |
| multi  | 640x480   | —         | 96 / 143  |
| multi  | 1024x600  | —         | 48 / 139  |
| multi  | 1280x800  | —         | 48 / 139  |
| multi  | 1646x1097 | —         | 48 / 139  |

**Coarse pointer — free gap per row (px; lines in brackets when not 1)**

| State    | Cell      | LOOK before → after               | DO before → after                   |
| -------- | --------- | --------------------------------- | ----------------------------------- |
| pen      | 1024x600  | 46 → 46                           | -135.7 [2 lines] → -135.7 [2 lines] |
| pen      | 1280x800  | 123.4 → 158                       | 54 → 56.5                           |
| pen      | 1440x900  | 157.4 → 154.4                     | 34.5 → 82.8                         |
| pen      | 1912x1080 | 229 → 226                         | 135.9 → 15.4                        |
| filtered | 1024x600  | 46 → 46                           | -135.7 [2 lines] → -135.7 [2 lines] |
| filtered | 1280x800  | 123.4 → 158                       | 54 → 56.5                           |
| filtered | 1440x900  | 157.4 → 154.4                     | 34.5 → 82.8                         |
| filtered | 1912x1080 | 229 → 226                         | 135.9 → 15.4                        |
| shaded   | 1024x600  | 46 → 46                           | -137.8 [2 lines] → -137.8 [2 lines] |
| shaded   | 1280x800  | 123.4 → 158                       | 51.9 → 54.4                         |
| shaded   | 1440x900  | 157.4 → 154.4                     | 32.4 → 80.7                         |
| shaded   | 1912x1080 | 229 → 226                         | 133.8 → 13.3                        |
| conflict | 1024x600  | -87.3 [2 lines] → -87.3 [2 lines] | -135.7 [2 lines] → -135.7 [2 lines] |
| conflict | 1280x800  | -9.9 [2 lines] → 24.7             | 54 → 56.5                           |
| conflict | 1440x900  | 24.1 → 21.1                       | 34.5 → 82.8                         |
| conflict | 1912x1080 | 95.7 → 92.7                       | 135.9 → 15.4                        |

**Coarse pointer — app header (px high / band px)**

| Screen | Cell      | before    | after     |
| ------ | --------- | --------- | --------- |
| plan   | 320x720   | 220 / 275 | 220 / 275 |
| plan   | 640x480   | 108 / 163 | 108 / 163 |
| plan   | 1024x600  | 52 / 211  | 52 / 211  |
| plan   | 1280x800  | 52 / 159  | 52 / 159  |
| plan   | 1646x1097 | 52 / 159  | 52 / 159  |
| org    | 320x720   | 108 / 111 | 108 / 111 |
| org    | 640x480   | 52 / 55   | 52 / 55   |
| org    | 1024x600  | 52 / 55   | 52 / 55   |
| org    | 1280x800  | 52 / 55   | 52 / 55   |
| org    | 1646x1097 | 52 / 55   | 52 / 55   |
| multi  | 320x720   | —         | 220 / 275 |
| multi  | 640x480   | —         | 108 / 163 |
| multi  | 1024x600  | —         | 52 / 263  |
| multi  | 1280x800  | —         | 52 / 159  |
| multi  | 1646x1097 | —         | 52 / 159  |

## 2. The visual brief, item by item

| V   | Built                                                                                                                                                               | Where                                                         | Gate                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| V1  | Quiet leading row mark (an eye; a wrench, not a pencil), `roomy` only                                                                                               | `Deck.tsx`, `DECK_ROW_MARK`                                   | `Deck.test.tsx`; the ladder re-taken with it present                                      |
| V2  | Group pills (`DECK_GROUP_PILL`); the group seam and its leading-seam defect are gone                                                                                | `Deck.tsx`, `toolbar-styles.ts`                               | `deck-seams.structural.test.tsx` (rewritten)                                              |
| V3  | Quiet shaded ink; a shaded lens that is on keeps an underline; `GrayText` in forced colours; the Author pill is hollow with a 3.04:1 dash while the pen is not held | `toolbarControlVariants` `disabled`, `DECK_GROUP_PILL_LOCKED` | `toolbar-styles.test.ts`, `ToolbarSplitButton.test.tsx`, `deck-seams.structural.test.tsx` |
| V4  | Export and Share… outlined together, never filled (`DECK_CLOSING_SECTION`)                                                                                          | `Deck.tsx`, `toolbar-styles.ts`                               | `deck-seams.structural.test.tsx`, `command-surface.spec.ts`, the photos                   |
| V4a | `Filter ▾` count on the glyph, "n filters on" as the description                                                                                                    | `ToolbarPopover` `badge`                                      | `ToolbarPopover` suite, `filtered` photos                                                 |
| V5  | Organisation switcher: ghost button + menu                                                                                                                          | `OrgSwitcher.tsx`                                             | `OrgSwitcher.test.tsx`, `org-less-screens.spec.ts`, `auth.spec.ts`                        |
| V6  | Covered by M2-T3                                                                                                                                                    | —                                                             | —                                                                                         |
| V7  | Balance, covered by M5 and the re-take (§1; `promotion.spec.ts` SC-17/18 pass)                                                                                      | —                                                             | `promotion.spec.ts`                                                                       |

### 2.1 The shaded-control audit (V3)

Every control shaded in an ordinary editing state (a plan with activities, the pen held), by the `pen` photos:

| Control                                             | Why it is shut        | Reader can change it?       | Decision                                                                                        |
| --------------------------------------------------- | --------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| Baseline overlay                                    | no baseline captured  | yes (Analysis → Baselines…) | shaded with reason (ADR-0082)                                                                   |
| Next conflict                                       | no conflicts          | the plan can                | shaded with reason (ADR-0094)                                                                   |
| Apply levelled dates…                               | nothing is levelled   | yes (Settings)              | shaded with reason                                                                              |
| Undo / Redo                                         | nothing to undo       | by editing                  | shaded (`'never'` label, as before)                                                             |
| With a peer's pen: every Author control and the pen | someone else holds it | yes (ask for the pen)       | shaded with the pen's own reason; the **Author pill is hollow** so they read as one locked unit |

Nothing is omitted: each shut state is one the reader can change, which is ADR-0082's test for shading rather than
hiding. The remedy is the quieter style (§3), not fewer controls.

## 3. Contrast (V3 sign-off, for the accessibility reviewer)

Computed from the `--chrome-*` tokens in `globals.css` (OKLCH → linear sRGB → WCAG luminance; the pill composited as
`color-mix` in sRGB), not read from a screenshot:

| Pair                                                               | Ratio                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Foreground on the band                                             | 15.31:1                                                                                       |
| Foreground on a pill (`--muted` at 50 %)                           | 13.74:1                                                                                       |
| **Shaded ink (`--muted-foreground`) on the band**                  | **7.98:1**                                                                                    |
| **Shaded ink on a pill**                                           | **7.17:1**                                                                                    |
| Old shaded ink (`opacity-50` of the foreground) on the band        | 4.83:1 (and an alpha, so it moved with whatever sat behind it)                                |
| **Closing ring (`--muted-foreground` at 60 %) on a pill**          | **3.56:1** — over the 3:1 a component boundary needs (1.4.11)                                 |
| Foreground label on the hover wash (`--muted`)                     | 12.19:1; the wash is 1.13:1 against the pill, as any idle hover is                            |
| **Locked Author dash (`--muted-foreground` at 50 %) on the band**  | **3.04:1** (at 40 % it was 2.43:1, under 3; the first build's hairline was 1.53:1)            |
| Share & export label on `--secondary-hover`                        | 3.94:1 — no longer reachable: the closing action has no fill and no hover ring                |
| Filter badge (`--background` digit on `--foreground`)              | the foreground/band pair above, 15.31:1                                                       |
| Pill against the band / its hairline (`--border`) against the band | 1.11:1 / 1.53:1 — a decoration, not a state, and never the only mark of anything              |
| Raising the pill to 60 % instead                                   | hover wash against it falls from 1.13:1 to 1.10:1, which is why the hairline carries the rest |

A shaded control's contrast is exempt from 1.4.3 (inactive component); it is held ≥ 4.5 anyway because the plan asked.

## 4. Photographs for sign-off

`photos/m6-before-*` and `photos/m6-after-*` at the four cells, both pointers, in the states named above. Notes for the
reader: the leading row mark appears from 1280 (79 rem, 1264 px, deliberately); at 1024 the rows are as they were. The
Author pill's dashed outline is visible in every `shaded` photo and absent in every `pen` photo. **The pen-not-held
state, the one a reader meets first, is `photos/m6-after-{fine,coarse}-{1280x800,1912x1080}-nopen.png`** (taken at two
cells because the other two add no information: the rows are the same shape). All `m6-after-*` photos were re-taken on
the revised build; the `m6-before-*` set is unchanged.

## 5. The header (V5)

The tables in §1 end with the app header's height and the band's, on a plan, on an organisation screen, and with two
organisations. **M6 changes none of the plan-page or organisation-screen numbers** (a single organisation is a plain
label about as wide as the select was, and the header is one line at every cell ≥ 1024 on both pointers — SC-4 holds,
including with two organisations once the cap moved to the control). At 320 the header is four lines (192 px fine, 220
coarse; band 239 / 275 of 720, 33 % / 38 %) and at 640 two (96 / 108; band 143 / 163 of 480), the band being scrolled or
within 40 % as SC-5 requires. **No pixel is hit-test-missed and no control is off the window in any cell.**

_Options, not built, because the plan sets no target and each is a product call:_ (a) below `sm`, show the organisation
switcher as its glyph alone — saves a line at 320 only when the account chip and the switcher would otherwise wrap
together, at the cost of the visible name the spec requires; (b) move the switcher into the account menu below `sm`
(withdrawing it from the header), at the cost of a tool that is two taps away on a phone; (c) leave it. M6 does (c).

## 6. Journeys changed, and what is red

Updated for the re-taken ladder and the new icon-only items: `e2e-workspace-fit/promotion.spec.ts` (a `NARROW` width
of 1272 where 1280 meant "unpromoted", and its text-only 200 % twin), `e2e-workspace-fit/command-surface.spec.ts` (the
icon-only four are asserted never to paint a word; `'roomy'` is Apply levelled dates… alone),
`e2e-revision-compare` (Compare revisions through `pressPromotable`), `e2e/auth.spec.ts` and
`e2e-shell/org-less-screens.spec.ts` (the switcher).

**Re-run in full on the revised build (2026-10-10), serially, each suite on its own fresh random ports with its own
config's API and `VITE_` environment, against the real database — all green:** promotion 32, workspace-chrome 44
(the whole suite, including `placement-overlays`, which `fa10873` repaired for Feasible window being promoted to
the bar at 1646), workspace-fit 38, toolbar 3, narrow-shell 22 (the deck-overflow guard), minimap 15, float-paths 1,
gantt 16, shell 4, designed-chrome 4, designed-ui 9, share 2, revision-compare 2, resource-view 3, health-check 1, the
base `e2e` suite 23, account 2. The earlier record of this section listed `toolbar`, `placement-overlays`, seven `e2e`
journeys and `account` as red on `7578110` as well; none is red now, and this run did not establish why (the
placement journey was repaired by `fa10873`; the others were not investigated).

## 7. Bundle

CSS **17.48 KiB** gzip against the 18.00 KiB (18,432 B) ceiling, entry graph **177.00 KiB** of 185.00 (`vite build` then
`check:bundle-size`, on the revised build). The first record of this section said 17.41 and 176.99, and the review
measured 17.40 and 177.00; the revision adds 0.08 KiB of CSS (the ring, the hairline, the forced-colour branches). The
ceiling is not raised.

## 8. For the reviewers to execute

- **accessibility-reviewer:** the organisation menu with a screen reader (the name "Active organisation: ‹Name›", the
  radio rows, Escape and selection returning focus); the plain label for a single organisation; the Filter badge and
  its description; the shaded ink and the hollow Author pill at 200 % text and in forced colours; Share & export's
  hover ring; focus on a shaded pen (amber ring, not navy).
- **ux-reviewer:** the photos; whether the glyph row mark is the mark intended (V1); whether `Diff` reads as
  "compare with the baseline"; the loss of the visible word on Baseline overlay, Comments and Settings; Share &
  export's outline against the Diagram | Gantt segment's `--secondary` fill (resolved: the closing action is no longer
  filled).
- **component-reviewer:** `ToolbarPopover`'s `badge`, `toolbarControlVariants`' quieter `disabled` (the selection
  bar is a consumer and quiets too), the descendant selector `DECK_CLOSING_SECTION` (the alternative was a `closing`
  prop on three contracts), and that nothing outside `Deck` reads the four constants.

## 9. The review's findings, and what was done about each

| Finding | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1      | `closing` variant **removed**. Export and a promoted Share… are outlined together by `DECK_CLOSING_SECTION` (§3: 3.56:1); no fill, so nothing collides with the selected segment or a pressed toggle. Hover is the idle wash; focus is the amber ring (read in Chromium: rest `inset 1px` ring, hover adds `--muted`, focus shows `2px inset --ring`). The 3.94:1 hover token is no longer used.                                                                                                           |
| U2      | The Author dash is `--muted-foreground` at 50 % (3.04:1, was 1.53:1). A shaded lens that is on keeps a 2 px underline. **`Start editing` was NOT made the filled primary while the pen is not held**: `primary` is the held state and the amber slab (ADR-0133 D3/D4, and the ladder's own docblock), making the other half amber means a `ToolbarButton` prop (a public contract, ADR-0105), and it would leave the pen looking the same held and not held.                                               |
| U3      | The DO mark is `Wrench`. The mark's 79 rem floor is documented in `DESIGN_SYSTEM.md`, `UX_STANDARDS.md` and `DECK_ROW_MARK`'s docblock.                                                                                                                                                                                                                                                                                                                                                                    |
| U4      | Pill `--muted` 40 → 50 % plus a hairline `--border`. Not 60 %: that lowers the idle hover wash to 1.10:1 (§3). Zero width; the §1 tables re-read identical, and `narrow-shell.spec.ts` (the overflow guard) passes.                                                                                                                                                                                                                                                                                        |
| U5      | **Nothing changed, and that is the finding.** Baseline overlay stays icon-only on a touch pointer: it is a `ToolbarButton`, whose tooltip is the `Tooltip` primitive and opens on a **long-press** (500 ms) without firing the command (`tooltip.test.tsx` "long-press opens the tip and swallows the click"). A `'description'` tip is `role="tooltip"` and linked by `aria-describedby`; the accessible name is the control's own. So the ladder was not re-taken. Not exercised on a real touch device. |
| U6      | Badge `h-3.5 min-w-3.5 px-0.5` at `-top-2.5 -right-2`, count capped at `9+` (the description keeps the exact number). It still touches the funnel's top-right rim by about 2 px; fully clearing the glyph would put it over the label or outside the button.                                                                                                                                                                                                                                               |
| U7      | The single-organisation label has no glyph, no native `title` and no tab stop; the design-system tooltip carries the full name, the tree carries it whole. The truncated name is therefore not reachable by a **sighted keyboard-only** reader, accepted over a do-nothing tab stop. `className` deleted.                                                                                                                                                                                                  |
| A1      | `forced-colors:[color:GrayText]` on the `disabled` branch, on a shut split caret, and a `GrayText` dash on the locked pill. Read with CDP forced-colors emulation: a shaded `Add activity` computes `rgb(96, 0, 0)` against `rgb(0, 0, 0)` for a live control, and the locked pill's dash is `rgb(96, 0, 0)` and dashed. In forced colours the box-shadow outline of the closing action is dropped by the mode (`box-shadow: none`), so Export is then an ordinary control.                                |
| C1      | Shut caret: `cursor-default`, no `opacity-*`, no hover wash (a live one gains `hover:bg-muted`). The search field's exemption: a field is not a button; `opacity-50` there is its own, unchanged.                                                                                                                                                                                                                                                                                                          |
| C2      | `deck-seams.structural.test.tsx` refuses `before:-inset` (verified red by hanging the pill 2 px out).                                                                                                                                                                                                                                                                                                                                                                                                      |
| C3      | `OrgSwitcher`'s `className` prop deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| C4      | §7 corrected; `nopen` photos added; all `m6-after-*` re-taken.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| C6      | `docs/TECH_DEBT.md` #483 (200 % text breadcrumb) and #484 (touch 1024 × 600 DO row).                                                                                                                                                                                                                                                                                                                                                                                                                       |
