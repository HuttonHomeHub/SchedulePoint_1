# ADR-0185: The toolbar promotes what fits, and says what moved

- **Status:** Accepted — 2026-10-11. The product owner approved the whole plan to run to completion on 2026-10-09;
  the decisions in spec §0.2 (OD-1 to OD-3) were made after M0 and M4, and the visual brief's open choices
  (the closing action, the row mark) after the M6 review. Close-out is M7.
- **Spec:** [`docs/specs/toolbar-redesign/feature-spec.md`](../specs/toolbar-redesign/feature-spec.md)
  · **Plan:** [`implementation-plan.md`](../specs/toolbar-redesign/implementation-plan.md)
  · **Readings:** [`m0-measurement.md`](../specs/toolbar-redesign/m0-measurement.md) (the stop rule and the
  provisional ladder), [`m2`](../specs/toolbar-redesign/m2-measurement.md), [`m3`](../specs/toolbar-redesign/m3-measurement.md),
  [`m4`](../specs/toolbar-redesign/m4-measurement.md), [`m5`](../specs/toolbar-redesign/m5-measurement.md)
  (the ladder) and [`m6`](../specs/toolbar-redesign/m6-measurement.md) (the visual brief), with
  `promotion-widths.{fine,coarse}.json` as the committed inputs
- **Date:** 2026-10-11
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** ADR-0031 (the three prominence tiers and group 1's zoom controls), ADR-0091 D3 (where zoom sits),
  ADR-0100 (the minimap toggle leaves View ▾), ADR-0109 D1 (a command surface "never hides": width may now add
  commands to the bar, never remove one that is there). **Completes** ADR-0109's supersession of ADR-0090 D6 and
  ADR-0091 D3a by deleting their dead code, and overturns ADR-0110 M5's keep of it (`docs/TECH_DEBT.md` #193).
- **Builds on:** ADR-0179 (designed from a laptop up; D2's scrolling line below the floor), ADR-0181, ADR-0093 (an
  action belongs on its object), ADR-0082 (shade, never hide), ADR-0117 (an icon-only control names itself),
  ADR-0119 (a group of buttons says which are alternatives), ADR-0133 (rows are declared; the pen's colour),
  ADR-0135 (a container hands focus back), ADR-0118 and ADR-0183 (control heights, unchanged), ADR-0105 (why this was
  a spec), ADR-0110 (a gate is verified against the defect it names), ADR-0113 (measure first), ADR-0088 D1 (no flag;
  the rollback is the commit). ADR-0186 is the sibling that took the conflict reason off the toolbar. ADR-0111 was
  engaged (see Consequences).

## Context

The product is designed from a 1024 × 600 floor up and phones are unsupported (ADR-0179, ADR-0181). The command
surface was not. It was shaped when **width** was the scarce resource: ADR-0031 ranked every command into three
tiers and sent the losers into a `⋯`, "acceptable only as a mobile fallback"; ADR-0090 and ADR-0091 added a
demotion ladder and a density band; ADR-0109 then deleted the ladder and let the surface wrap, which moved the cost
into **height** and left every placement as it had been. Nobody had asked where each tool belongs.

Measured before any code (`m0-measurement.md`; `feature-spec.md` §0.1):

- At 1024 × 600 on a mouse the deck was four lines and the canvas 274 px; on touch, four lines and 234 px.
- Three different things decided whether a label showed (`Toolbar`, `Deck`'s `ICON_ONLY` list, and a `compact`
  prop whose condition could never be true), implemented four times.
- `ToolbarItem.tier` and `priority` were inert, and four toolbar exports had no production caller.
- Below the floor (a 1280 × 800 laptop at 200 % text is a 640 × 400 viewport) the header and wrapped deck took
  355 to 603 px, so the foot row could not be reached (`docs/TECH_DEBT.md` #471).
- Wide screens were the opposite problem: a 1912 px deck left 40 % of a row empty while Share…, Health check and
  Critical only sat in menus. "All commands visible when there is room" was being honoured only downwards.

## Decision

1. **D1 — Free space is used: a menu command is promoted onto the bar by a declared ladder, at fixed viewport
   stages.** Six rem thresholds (`PROMOTION_STAGES`, `lib/breakpoints.ts`): `PROMOTE_80`, `_90`, `_100`, `_119_5`,
   `_135` and `_160` (1280, 1440, 1600, 1912, 2160 and 2560 px at the default font size). Each promotable
   command declares its stage per pointer in one committed table, `promotion-ladder.ts`, which
   `computePromotionStages` derives from the measured widths in `promotion-widths.{fine,coarse}.json`
   (a unit test pins every entry to it). A promoted command is a plain registry item built by
   `derivePromotedItems` from a `PromotableEntry`; it is **absent from its menu, not shaded**, so one accessible
   name exists once in the tree. This is the mirror of what ADR-0109 D1 deleted (a mechanism that moved bar
   commands _into_ a `⋯` as width fell), and it is bounded so that defect class cannot return:
   (a) no command on today's bar ever leaves it — promotion only adds; (b) nothing measures its own content —
   stages are viewport media queries read once by `usePromotionStage` (one `useSyncExternalStore`, so a resize that
   crosses two thresholds never renders the stage between them); (c) the thresholds are committed constants,
   re-checked by a journey (SC-18); (d) the menu stays every promotable command's canonical home. The ladder is
   sized for the **worst state** of a row (a cycling conflict read-out on LOOK, a peer's pen on DO) plus 2 px, and
   skips an entry that does not fit to try the next, so Share… promotes at 1280 on a mouse though Health check,
   ranked ahead of it, does not.
2. **D2 — Every menu keeps an anchor row that never promotes, so its trigger is on the bar at every width.**
   Filter keeps Has constraint, Analysis keeps Baselines…, the deliverables menu keeps Print… and its file
   formats, Link keeps Start → Finish, and Add keeps Task and Level of effort. A menu can therefore never empty
   and a focused trigger can never disappear (E-3). Link's anchor is Start → Finish and not "Stop linking", and Add's
   is Task and not "Stop adding", because both of those render only while the tool is armed.
3. **D3 — Legend, Minimap, Baseline overlay and Resource view are always on the bar** (`at: 'always'`, never
   promoted or demoted), and Baseline overlay, Resource view, Comments and Settings… are **icon-only** at every
   width, each with a tooltip stating its purpose (a long press on touch). The ladder never touches them.
4. **D4 — Focus follows the command, and a move is announced.** (E-1) A resize that promotes the command a reader is
   on in a menu closes the menu, moves focus to the new button and says "‹name› is now on the toolbar."
   (E-1b) A resize that must close a menu or popover the reader is inside hands focus to its trigger and says
   "Menu closed because the toolbar changed." (E-2) A resize that demotes the command a reader is on hands focus to
   the source trigger, which is mounted in every state, and says "‹name› is no longer on the toolbar. Moved into the ‹menu› menu.
   Focus moved to ‹trigger›." — ADR-0135's hand-off gains a destination (`successorFor`) and a static `lostReason`.
   (E-3) is D2. The deliverables trigger is named **Export** while Share… is on the bar beside it and **Share &
   export** otherwise, because two adjacent "Share" labels read as one control. So Share…'s description says where
   it goes under both names ("Moves into the Export menu in a narrower window, where it is named Share & export"),
   and the hand-off message keeps "Share & export", the name the trigger has by the time focus lands on it.
   A flat set of promoted pressed buttons (Colour by, Link kinds) carries no `role="group"`: each member's name
   includes the set ("Colour by: Total float") and the printed text is shorter (`visibleLabel`, contained in the
   name for WCAG 2.5.3).
5. **D5 — Below 1024 the deck is one scrolling line (ADR-0179 D2), the editing row leads it, and a short window
   scrolls the band away.** Rows are **rendered** in the order for the width (`use-deck-row-order.ts`: DO then
   LOOK under 1024, LOOK then DO from 1024), never reordered with CSS `order`, so the Tab and arrow sequence is the
   order on screen (WCAG 1.3.2, 2.4.3). Keyboard focus scrolls the focused control into view clear of the fade;
   the `squat` variant (narrow and short) makes the shell scroll so the band scrolls away over a full-height
   `<main>`. This amends `DESIGN_SYSTEM.md`'s "never `overflow-x-auto`" for the one case below the floor; at 1024
   and up nothing scrolls sideways.
6. **D6 — A tool lives on its subject's surface.** Zoom out, Zoom in, Fit to plan and the Minimap toggle move to a
   "Diagram viewport" toolbar in the diagram's bottom-right corner (a fifth `ToolbarRow`, `canvas`), with the
   minimap stacked above it so opening it never moves the button under the pointer; in the Gantt it is absent and
   focus on it moves to the Gantt segment. Plan summary and Edit plan details are a "Plan details" toolbar in the
   identity row. Legend, Resource view and Comments form a trailing "Panels" group (registry group `help`, via the
   `DECK_GROUPS` remap, so the taxonomy is unchanged). Float paths moves to the selection bar and the Gantt row
   menu. The deck's conflict chip is count-only (ADR-0186). View ▾ is three columns with Structure, Markers and the
   Gantt's Columns folded, 366 px (fine) and 390 px (touch) tall at the floor against a 420 px target.
7. **D7 — One label rule, and the dead ladder is deleted.** A plain button declares `labelVisibility`
   (`'always'` | `'never'` | `'roomy'` | `'roomy-fine'`), resolved by one function
   (`resolveLabelVisibility`) against `--container-roomy` (79 rem, the deck's measured width at which every row is
   one line with every label visible). `Deck`'s `ICON_ONLY` list, `compact`, `resolveLayoutMode`, `priority`,
   `partitionByTier`, the layout-band types and, at close-out, `ToolbarItem.tier` and `ToolbarTier` are deleted.
   Nothing read the last two since ADR-0109 D1; the keep ADR-0110 M5 gave them is overturned as the ADR-0105
   contract change #193 said removal was.
8. **D8 — The visual brief (V1 to V7).** (V1) A quiet leading row mark, an eye for LOOK and a wrench for DO, from
   79 rem only because it costs 18 px of a row that has none to spare at 1024. (V2) Each group is a pill
   (`DECK_GROUP_PILL`, `--muted` at 50 % with a hairline, zero layout width), replacing the group seam and its
   leading-seam defect. (V3) A shaded control is quiet rather than dimmed (`--muted-foreground`, 7.98:1 on the
   band, `GrayText` in forced colours; a shaded lens that is on keeps an underline) and the Author pill goes hollow
   and dashed while the pen is not held. (V4) The row's closing action is **outlined**, never filled
   (`DECK_CLOSING_SECTION`: Export, and Share… beside it when promoted). (V5) The organisation switcher is a ghost
   button with the organisation glyph that opens a menu, a single organisation being plain text with a tooltip for
   its full name. (V6) View ▾ at the floor, D6. (V7) Balance: at each stage cell a row is at most 15 % empty or
   nothing left in a menu fits, and between stages at most 30 % (33 % under 80 rem), none wrapping (SC-17).
   Filter shows its count on the glyph (up to 9+).
9. **D9 — No flag.** The rollback is reverting the commit (ADR-0088 D1). Each milestone named its entry point and
   landed with a journey.

## Alternatives considered

- **Reach one line with more menus.** Rejected: against "all commands visible when there is room" (ADR-0109).
- **Promote by measuring the row in JavaScript.** Rejected: it is the defect class ADR-0109 D1 deleted (a surface
  measuring itself, then reshaping what it measured). Stages are viewport thresholds.
- **Promote with CSS container queries alone.** Rejected: impossible for the menu half, which must stop rendering
  the row the bar now shows.
- **CSS `order` to put the editing row first below 1024.** Rejected: the Tab and arrow sequence would then
  disagree with the screen (WCAG 1.3.2, 2.4.3). Rows are rendered in order instead.
- **`role="group"` on the flat promoted sets.** Rejected: ADR-0119 D2 refuses a partial partition of a taxonomy
  group, and View and Author hold other items; a named sub-group needs that decision amended. Each member's name
  carries the set, which meets 4.1.2 (a set of toggle buttons is a weaker description than a radiogroup, not an
  incorrect one).
- **Amber primary for Start editing while the pen is not held.** Rejected: `primary` is the held state and the amber
  slab (ADR-0133 D3, D4); amber on the other half needs a `ToolbarButton` prop (ADR-0105) and would make the pen look
  the same held and not held. The Author pill goes hollow instead.
- **Type-ahead in the organisation menu** (the native select had it). Not built: `Menu` has none, and adding it
  changes a shared primitive's key set, which ADR-0111 reviews before release. The arrow, Home and End limit is
  stated in `OrgSwitcher.tsx`, `UX_STANDARDS.md` and `COMPONENT_LIBRARY.md`.
- **Hide an emptied menu's trigger.** Rejected: breaks "commands stay in place"; anchors instead (D2).
- **Rows share one line on wide screens.** Withdrawn with the free-space requirement: each row fills its own
  spare width with promoted commands, which also keeps ADR-0133 D1 untouched.
- **A filled `closing` variant on `ToolbarButton`.** Rejected after the M6 review: it collided with the selected
  segment and a pressed toggle, needed a prop on three contracts, and its hover token measured 3.94:1.
- **Hanging the pill 2 px past its group.** Built first; it made the deck's `scrollWidth` exceed its `clientWidth`,
  which `Deck` reads as "this line scrolls". The pill fills the box exactly (`deck-seams.structural.test.tsx`).
- **Apply levelled dates… labelled on touch too (`'roomy'`).** Costs a deck line on touch at exactly 1280, so it
  is `'roomy-fine'`: a mouse only (owner, 2026-10-09).
- **Zoom presets in the diagram's corner (C1).** Not built: they stage on the stage's width, not the deck's, and
  the corner has nowhere to put a 430 px row (`docs/TECH_DEBT.md` #482).

## Consequences

- **The floor is two lines on a mouse in every state measured** (eleven states, 1/1 at 1024 through 2560), against
  four before; the canvas is 362 px at 1024 × 600 with nothing selected (`m4-measurement.md` §2–§3). A selection
  docks a 167 px foot row and leaves 246 px, set by the foot row and not by this work (#489).
- **Touch accepts four lines at exactly 1024** (OD-2) and two lines on the DO row up to 1160 (`m5-measurement.md`
  §9), because the 44 px targets stay (ADR-0183). 1280 on touch is two lines in the base state.
- **The gap between stages is bounded, not removed**: the widest row is 26.5 % empty at 1432 (fine, LOOK) and 27.4 % at
  1872 (touch, LOOK), just short of a stage (`m5-measurement.md` §3.1), the price of staging on viewport thresholds rather than a measured row.
  The ceilings are `CEILING_PCT` in `promotion.spec.ts`, a regression guard and not a target.
- **Menus change with the window.** A reader who learned "Share… is in Share & export" now finds it on the bar at
  1280 and the trigger renamed. Copy that pointed at a row by its route was found by grep and reworded ("Turn off
  Late-start overlay"); the anchors are why `Analysis → Baselines…` still stands.
- **Voice and assistive-technology names changed**: "Summary" is "Plan summary", "Edit plan" is "Edit plan
  details", and Minimap is a pressed button, not a checkbox in View ▾.
- **A CI step was added** (`playwright.promotion.config.ts`,
  `test:e2e:promotion`, on the lightest shard, with three steps moved to pay for it;
  `scripts/e2e-durations.json`). The web total is 2,393 s, over the 2,372 s re-open trigger ADR-0138 records, so the
  shard count is to be re-examined (`docs/TECH_DEBT.md` #491).
- **Shared primitives changed only by optional additions** (ADR-0111; the reviews at M4, M5 and M6 and their
  findings are in those records):
  `ToolbarItem.visibleLabel` and `successorId`, `useToolbarFocusHandoff`'s `successorFor`, `ToolbarPopover`'s
  `closeOnChangeOf`, `Toolbar`'s `ungrouped` and `tooltip`, `ToolbarButton`'s `tooltip`, the tooltip's `placement` and
  `dismissOnPress`, and `Deck`'s `onFocus` scroll. No key set, roving order or Tab stop changed
  (`m3-measurement.md` §5, `m4-measurement.md` §7–§8, `m5-measurement.md` §5). Nothing here was exercised on a
  real touch device or with a real screen reader; the records list what the reviewers were asked to execute.
- **Known gaps, filed:** the cluster is unreachable while a dock has taken the stage (#480); three components keep
  their own copy of the unmount hand-off (#481); the zoom presets are not in the corner and the search field does not
  grow at 2560 (#482); 200 % text collapses the breadcrumb (#483); the touch DO row at 1024 wraps its trailing group
  onto a line with an empty left side (#484); the foot row's outlet (#489); the header at 320 (#490). A reader
  crossing 1024 mid-keystroke with focus inside the deck lands on `<body>` (rows move in the DOM).
- **`docs/TECH_DEBT.md` #193 and #471 are closed by this record**; the second paragraph of #471 became #489.

## Evidence (ADR-0076)

- Stages and widths: `apps/web/src/lib/breakpoints.ts` (`PROMOTION_STAGES`), `promotion-ladder.ts`,
  `promotion-widths.{fine,coarse}.json`, `measure-toolbar/promotion-widths.mjs` (no figure typed by hand);
  `promotion-ladder.test.ts` fails when a stage is edited (verified red: P4's fine stage changed, the diff names P4).
- No tool is lost: `promotion-manifest.test.tsx` against `command-manifest.json` (a menu loses exactly the rows
  that are on the bar; verified red by removing Health check… from its menu without promoting it);
  `promotion-anchors.test.tsx` (verified red by making Start → Finish promotable).
- Focus: `use-promotion-focus.test.tsx`, and `e2e-workspace-fit/promotion.spec.ts` for E-1, E-1b, E-2 and E-3 at
  200 % text (verified red by dropping `button.focus()` and `restoreTo.current?.focus()`, `m5-measurement.md` §4).
- No spare width while something fits, and the sweep between stages: `promotion.spec.ts` SC-17/SC-18 on both
  pointers (verified red with the ceilings set to 0).
- Deck lines and the floor: `e2e-workspace-fit/command-surface.spec.ts` and `floor-states.spec.ts`
  (verified red by restoring a truncated conflict reason: three lines).
- The cluster: `e2e-minimap/viewport-cluster.spec.ts` and `diagram-viewport-cluster.test.tsx` (verified red with
  the reveal margin disabled, and with the unmount clean-up deleted).
- The scrolling line and `squat`: `e2e-narrow-shell`, `e2e-workspace-chrome/activities-panel-scroll.spec.ts`
  (verified red: with the overflow gate forced false the focus walk fails at Filter, −54.5 px).
- The visual brief: `deck-seams.structural.test.tsx` (verified red by hanging the pill 2 px out),
  `toolbar-styles.test.ts`, `OrgSwitcher.test.tsx`; contrast computed from the `--chrome-*` tokens in
  `m6-measurement.md` §3.
- Share…'s description: `promotion-share-name.test.tsx` (verified red by deleting `SHARE_ENTRY.description`: the
  default clause names "Share & export" alone).
- Close-out: `grep -rn 'ToolbarTier' apps/web` is empty and `tsc --noEmit` is clean without `ToolbarItem.tier`.

## References

- `docs/TECH_DEBT.md` #193 and #471 (closed; see Closed numbers), #480 to #484, #489 to #491
- `apps/web/src/components/ui/toolbar/` (`Deck.tsx`, `toolbar-registry.ts`, `toolbar-promotion.tsx`,
  `use-deck-row-order.ts`), `apps/web/src/features/tsld/toolbar/` (`promotion-entries.tsx`, `promotion-ladder.ts`,
  `diagram-viewport-cluster.tsx`, `use-promotion-focus.ts`), `apps/web/src/features/organizations/components/OrgSwitcher.tsx`
- `docs/DESIGN_SYSTEM.md` (command surface), `docs/UX_STANDARDS.md` (promotion), `docs/COMPONENT_LIBRARY.md`
  (promotion, the label API), `docs/TOOLBAR_ROADMAP.md`
