# Toolbar redesign — M6 measurement record (the visual brief, V1–V7)

Taken 2026-10-10 on the M6 build by `apps/web/measure-toolbar/toolbar-redesign-m6.spec.ts` (a harness, not a gate;
ADR-0081 §3), fine and coarse pointers, the container's Chromium 1194, the M5 fixture (a plan with a long name,
three activities, one link, a peer who can hold the pen). `M6_TAG=before` was taken on `7578110`, `M6_TAG=after` on
this build. Photos: `photos/m6-before-*` and `photos/m6-after-*` — `<pointer>-<cell>-<state>`, states `pen` (the pen
held), `filtered` (Has constraint on), `shaded` (a peer holds the pen), `conflict` (a cycling conflict read-out),
`header-plan`, `header-org`, `header-multi` and the open organisation menu. Cells: 1024 × 600, 1280 × 800, 1440 × 900,
1912 × 1080 for the band; 320 × 720, 640 × 480, 1024 × 600, 1280 × 800, 1646 × 1097 for the header. Readings:
`apps/web/measure-output/toolbar-redesign-m6-{before,after}.{fine,coarse}.json` (not committed; the tables below are
the record).

**Product-owner sign-off (SC-16) is not recorded here.** The photos are the material for it; nothing in this file
claims it has been given.

## 0. What the brief or the plan got wrong, or left open

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

| V   | Built                                                                                | Where                                                         | Gate                                                               |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| V1  | Quiet leading row mark, `roomy` only                                                 | `Deck.tsx`, `DECK_ROW_MARK`                                   | `Deck.test.tsx`; the ladder re-taken with it present               |
| V2  | Group pills (`DECK_GROUP_PILL`); the group seam and its leading-seam defect are gone | `Deck.tsx`, `toolbar-styles.ts`                               | `deck-seams.structural.test.tsx` (rewritten)                       |
| V3  | Quiet shaded ink; the Author pill is hollow and dashed while the pen is not held     | `toolbarControlVariants` `disabled`, `DECK_GROUP_PILL_LOCKED` | `ToolbarSplitButton.test.tsx`, `deck-seams.structural.test.tsx`    |
| V4  | Share & export secondary-filled (`closing`); Share… promoted beside it already (M5)  | `toolbarControlVariants` `closing`                            | `command-surface.spec.ts`, the photos                              |
| V4a | `Filter ▾` count on the glyph, "n filters on" as the description                     | `ToolbarPopover` `badge`                                      | `ToolbarPopover` suite, `filtered` photos                          |
| V5  | Organisation switcher: ghost button + menu                                           | `OrgSwitcher.tsx`                                             | `OrgSwitcher.test.tsx`, `org-less-screens.spec.ts`, `auth.spec.ts` |
| V6  | Covered by M2-T3                                                                     | —                                                             | —                                                                  |
| V7  | Balance, covered by M5 and the re-take (§1; `promotion.spec.ts` SC-17/18 pass)       | —                                                             | `promotion.spec.ts`                                                |

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

| Pair                                                             | Ratio                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Foreground on the band                                           | 15.31:1                                                                 |
| Foreground on a pill (`--muted` at 40 %)                         | 14.06:1                                                                 |
| **Shaded ink (`--muted-foreground`) on the band**                | **7.98:1**                                                              |
| **Shaded ink on a pill**                                         | **7.33:1**                                                              |
| Old shaded ink (`opacity-50` of the foreground) on the band      | 4.83:1 (and an alpha, so it moved with whatever sat behind it)          |
| Share & export label (`--secondary-foreground` on `--secondary`) | 4.85:1                                                                  |
| Same label on `--secondary-hover`                                | 3.94:1 — **below 4.5, which is why hover is a ring and not that token** |
| Filter badge (`--background` digit on `--foreground`)            | the foreground/band pair above, 15.31:1                                 |
| Pill against the band                                            | 1.09:1 — a decoration, not a state, and never the only mark of anything |

A shaded control's contrast is exempt from 1.4.3 (inactive component); it is held ≥ 4.5 anyway because the plan asked.

## 4. Photographs for sign-off

`photos/m6-before-*` and `photos/m6-after-*` at the four cells, both pointers, in the states named above. Notes for the
reader: the leading row mark appears from 1280; at 1024 the rows are as they were. The Author pill's dashed outline is
visible in every `shaded` photo and absent in every `pen` photo.

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
`e2e-shell/org-less-screens.spec.ts` (the switcher). Serial run, each suite with its own flags and API env, on this
build: promotion 32, workspace-fit 38, workspace-chrome 36 of 37, narrow-shell 22, minimap 15, float-paths 1, gantt
16, health-check 1, revision-compare 2, share 2, resource-view 3, shell 4, designed-chrome 4, designed-ui 9, `e2e`
16 of 23. **Red, and not caused by M6** (each also fails on `7578110`, run with the same flags and API environment): `toolbar`
(the empty-canvas message is not found), `workspace-chrome` `placement-overlays` ("Feasible window" is not in View),
and the `e2e` journeys that cannot find "New activity" (base-checked on `activities.spec.ts`; the other six fail at the
same locator and were not each run against the base). `account` fails on a password-reset mail that never reaches
the sink in this container; nothing in that flow is touched by M6, and it was not run against the base.

## 7. Bundle

CSS 17.41 KiB gzip against the 18.00 KiB ceiling (17.20 before M6; +0.21 KiB). The ceiling is not raised. Entry graph
176.99 KiB of 185.00.

## 8. For the reviewers to execute

- **accessibility-reviewer:** the organisation menu with a screen reader (the name "Active organisation: ‹Name›", the
  radio rows, Escape and selection returning focus); the plain label for a single organisation; the Filter badge and
  its description; the shaded ink and the hollow Author pill at 200 % text and in forced colours; Share & export's
  hover ring; focus on a shaded pen (amber ring, not navy).
- **ux-reviewer:** the photos; whether the glyph row mark is the mark intended (V1); whether `Diff` reads as
  "compare with the baseline"; the loss of the visible word on Baseline overlay, Comments and Settings; Share &
  export's fill against the Diagram | Gantt segment's `--secondary` (the same fill means selected there).
- **component-reviewer:** `ToolbarPopover`'s `badge`, `toolbarControlVariants`' `closing` and quieter `disabled`
  (the selection bar is a consumer and quiets too), and that nothing outside `Deck` reads the three new constants.
