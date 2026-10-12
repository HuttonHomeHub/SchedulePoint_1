import { cva, type VariantProps } from 'class-variance-authority';

import type { ToolbarLabelState, ToolbarLabelVisibility } from './toolbar-registry';

/**
 * The **one** control-surface style for every {@link Toolbar} and {@link Deck} control (ADR-0031):
 * the plain {@link ToolbarButton}, the {@link ToolbarPopover} trigger, the deck's group captions,
 * and the pinned Project-finish chip.
 *
 * This line named `ToolbarOverflow`'s `⋯` trigger until the 2026-08-25 reconciliation pass —
 * ADR-0109 D1 deleted that component with the width ladder, so the `{@link}` pointed at nothing. Declared once as a CVA so a change to the toolbar's
 * hover/focus/active/disabled treatment happens in a single place — never hand-copied per control
 * (design-system "variants declared once; no one-off styling"; component review).
 *
 * - `tone: 'control'` — the interactive default (buttons, popover/overflow triggers): medium weight,
 *   foreground text, hover wash when idle.
 * - `tone: 'info'` — a non-interactive read-out chip (Project-finish): muted, no hover.
 * - `state` — one of `rest` / `open` / `selected` / `armed` / `primary`. It replaced a boolean
 *   `active` at
 *   the console epic's M3, because that boolean painted ONE 1.34:1 wash for three different facts;
 *   see the variant's own docblock for the ladder and why each state looks as it does.
 * - `disabled` — quiet ink + inert cursor (the control stays focusable via `aria-disabled`, so this is
 *   presentation only).
 */
/**
 * The **split-button caret** treatment: a hairline divider before the caret, so a control that
 * both acts and opens a menu *reads* as two halves.
 *
 * Originally the **look only** (ADR-0055 §3 / spec §4.7 D11): a true split button is two focusable
 * halves, which inside a toolbar risks two roving-tabindex stops in one item — the a11y gate
 * ADR-0031 closed.
 *
 * **That is no longer what its consumers do.** ADR-0064 made the Add and Link controls real split
 * buttons: two `<button>`s, the primary carrying the roving `itemProps` and the caret held out of
 * the sequence with `tabIndex={-1}` and reached by `ArrowDown`. The pair is still exactly **one**
 * roving stop — `Toolbar.test.tsx` and `tsld-toolbar-authoring.test.tsx` both assert that — so the
 * gate stayed closed; what changed is that the affordance is now operable rather than decorative.
 *
 * Two rules for the next consumer, both learnt the hard way. `restoreFocusRef` must point at the
 * **primary**, never the caret: the caret is outside the tab order, so restoring focus there strands
 * a keyboard user (WCAG 2.4.3 — shipped, and caught by the ADR-0064 enablement review). And a
 * consumer composes {@link ToolbarSplitButton} rather than rebuilding the pair.
 *
 * **That second sentence used to say the opposite** — "a third should extract it rather than copy
 * it" — and by the time a design pass read it the extraction had already happened, in the very
 * component whose docblock names the merge it was written for. A stale instruction is worse than no
 * instruction: it tells the next author to do work that is done, in a file they will then edit.
 */
/**
 * The **24 px pointer-target floor** for a split button's caret (WCAG 2.2 §2.5.8 Target Size
 * (Minimum), AA). One constant rather than a literal at each caret, because there are **three** of
 * them and the third is how this was found.
 *
 * **Measured, not reasoned** (ADR-0090 M3): the two shared carets rendered **23 × 36** and
 * `IsolateControl`'s bespoke one **22 × 36** — a `size-3.5` chevron (14 px) inside `px-1` (8 px),
 * plus this variant's 1 px divider. The M3 plan disputed ≈22 vs 24 px and called for the real box to
 * be captured before deciding; `e2e-toolbar-fit`'s S7 sweep captured it, and both were failing.
 *
 * **None of §2.5.8's exceptions apply, which is why this is a fix rather than a waiver.** *Spacing*
 * fails because a 24 px circle centred on the caret intersects the primary it sits flush against.
 * *Equivalent* fails because the only other route to the menu is `ArrowDown`/`ArrowUp` on the
 * primary — a keyboard affordance, and 2.5.8 is about pointer targets. *Inline* and *Essential* are
 * not in play.
 *
 * `justify-center` goes with it: the floor adds width the icon would otherwise sit left of.
 */
/**
 * **The card the canvas selection bar sits in** — and, until the console epic's M1, the card each
 * of the deck's groups sat in too.
 *
 * **Superseded in place rather than prepended to.** This block used to be followed by a second
 * `/**` recording M1's deletion, which left the text below attached to nothing and reading in the
 * present tense about a deck that has neither cards nor captions. The M7 architecture review found
 * two such orphans; the convention this file now follows is that a docblock is edited where it is
 * wrong, and the wrong version is quoted only where the correction teaches something.
 *
 * ## What M1 removed, and what survives
 *
 * The deck's group box — a `border` plus `px-2 py-1.5` at ≈ 1.2:1 against the band it sat in — cost
 * 14 px per deck line and 18 px per group to draw a boundary a 175 %-scaled screen cannot see
 * (`m0-measurement.md` §1). It went, and the `chrome` variant with it. A group is now a bare row of
 * controls, separated from its neighbour by a divider (`DECK_GROUP_DIVIDER`) rather than by a box.
 * The base survives for the **selection bar**, which is not that epic's subject and keeps it.
 *
 * **A style, not a component**, and that remains right for the reason it always was: the two
 * consumers wanted different behaviour, so a shared `<DeckCard>` would recouple things that should
 * stay apart. ADR-0062 is about not reimplementing behaviour, a different hazard from this one.
 *
 * ## What the variants share, and why they share exactly that
 *
 * **The card treatment — background and radius — plus the flex layout every toolbar row needs.**
 * (This said "background and radius only" for one commit, and the base declares
 * `flex items-stretch gap-2` beside them: a sentence inaccurate about the four classes below it,
 * caught by the architecture gate.) Everything else was measured, three times, and each attempt
 * cost a line of the canvas the foot-row epic exists to give back:
 *
 * | selection bar's card | row at 1920 | row at 1646 |
 * | -------------------- | ----------- | ----------- |
 * | none (before M6)     | 41 (1 line) | 77 (2)      |
 * | deck's own geometry  | **79 (2)**  | **119 (3)** |
 * | border, no padding   | 41 (1)      | **119 (3)** |
 * | background + radius  | **41 (1)**  | **77 (2)**  |
 *
 * The middle two are the interesting ones. The deck's `px-2` consumed exactly the 15 px of margin
 * M3 had left at 1920 and pushed the row back to two lines; dropping the padding recovered that and
 * still cost a line at 1646, because content there sits at the container width and a **2 px border**
 * is enough to wrap it. So the border is `comfortable`'s, not the shared base.
 *
 * This is the epic's own rule applied to its own styling: the treatment that reads as shared is
 * shared, and the geometry that costs canvas is not.
 */
export const toolbarCardVariants = cva('bg-foreground/5 flex items-stretch gap-2 rounded-md');

/**
 * **One seam vocabulary across the three bands** (console epic, S7 / M1-T3). A seam WITHIN a
 * surface is an inset hairline — a 1 px rule that stops short of the control row's top and bottom
 * — drawn as a `::before` on the element that follows it, in `--border` (a decoration, 1.4.11-
 * exempt, ADR-0055). It replaced three idioms that each said "these are related" differently: the
 * deck's `border-l` between sections, the split caret's `border-l`, and the header's full-height
 * hairline (ADR-0119). Declared once so the three consumers cannot drift (the
 * `TOOLBAR_CARET_TARGET` precedent). The height is `inset-y-1/4` — 50 % of the box — rather than
 * the study's 44 %, because the ratchet on arbitrary values (ADR-0099) is worth more than 6 %
 * of a hairline.
 *
 * **There are two marks now, and the second is not this one.** This rule is the section mark: a
 * short, quiet line between the registry sections inside a group. A boundary between two groups
 * is `DECK_GROUP_DIVIDER` — full height, in the gap, and the stronger of the two (2.43:1 against
 * this rule's 1.54:1, asserted). "One seam vocabulary" described the three bands sharing this rule
 * and stays true of them; the deck's group boundary was never one of its uses.
 *
 * A pseudo-element rather than a `border-l` because a border is part of the box: it widens the
 * element, it moves with padding, and it is the same 1 px whether the row is 36 or 44 tall. The
 * rule below is positioned against the box and never changes its size.
 */
export const TOOLBAR_INSET_RULE =
  'relative before:absolute before:inset-y-1/4 before:left-0 before:w-px before:bg-border';

/**
 * A split button's caret is a pointer target in its own right and **not** a `[data-toolbar-item]`
 * — the item attribute sits on the PRIMARY button, and its sibling caret is exactly the control
 * ADR-0110 D5 records shipping at **23 × 36** past a sweep that descended per-item and could not
 * see it. So its coarse floor is stated here rather than inherited: `min-w-(--control-h)` makes it
 * 44 wide under a coarse pointer, matching the height the same token gives it.
 */
export const TOOLBAR_CARET_TARGET =
  'min-w-6 justify-center pointer-coarse:px-2 pointer-coarse:min-w-(--control-h)';

/**
 * **The deck's row geometry, in CSS px, in one place** (toolbar-grid M1). The Tailwind classes below and
 * `deck-row-clip` in `globals.css` are literal, so `deck-seams.structural.test.tsx` derives what they
 * must say from these numbers and fails when they drift.
 *
 * - `gap`: the space between groups. 8 below 79 rem, where the 1024 floor has about 5 px spare on DO and
 *   the gap must not widen; 24 from it (`@roomy/deck:`). The spacer's negative margin equals it.
 * - `ringReach`: how far the forced-colours focus ring reaches (`2px` at a `2px` offset).
 * - `clipMargin`: where the row's clip edge lies outside its box: the ring plus 1 px.
 * - `divider`: how far the line's OUTER edge hangs from the group it leads (the line is 1 px wide, so it
 *   spans `offset - 1` to `offset`). Roomy it is mid-gap (13 of 24). Compact the gap is 8, so mid-gap
 *   (5) would sit inside the clip and show at a line's start; the line has to clear `clipMargin` by
 *   1 px (`offset - 1 >= clipMargin + 1`, so 7) and so sits 1 px from the neighbour it follows. The ring
 *   and the divider therefore each have 1 px of headroom on their own side of the clip edge.
 */
export const DECK_GEOMETRY_PX = {
  gap: { compact: 8, roomy: 24 },
  ringReach: 4,
  clipMargin: 5,
  divider: { compact: 7, roomy: 13 },
} as const;

/**
 * **A deck group is split from its neighbour by a divider, never boxed** (toolbar-grid M1, R1). It
 * replaces the pill, the locked Author outline, the Export and Share ring and the rows' eye and wrench:
 * five boxes where the owner asked for a grid.
 *
 * A 1 px line the full height of the controls, in the gap **before** every group but the first on its
 * row (placed by `DECK_GEOMETRY_PX`). A pseudo-element, so it costs **no layout width**.
 *
 * **A divider is only ever leading, and the row clips its own edge** (`deck-row-clip`), so a group that
 * wraps to the start of a line draws its divider outside the clip and nothing is painted: the
 * leading-seam defect (SC-12, measured at 1024) solved without a box.
 *
 * `--muted-foreground` at 40 % is 2.43:1 on the band (`m0-measurement.md` §6), asserted at 2:1 in
 * `token-contrast.test.ts` as a design floor (a separator is not a control, so 1.4.11 does not bind
 * it); it outranks the section rule (`TOOLBAR_INSET_RULE`, 1.54:1). A `border-l` and not a background,
 * so forced colours keep it. `relative` is the group's own (`Deck.tsx`), not repeated here.
 */
export const DECK_GROUP_DIVIDER =
  'before:absolute before:inset-y-0 before:-left-1.75 before:border-l before:border-muted-foreground/40 @roomy/deck:before:-left-3.25';

/**
 * **The trailing group's divider belongs to the space before it, not to the group** (toolbar-grid M1).
 *
 * A trailing group is pushed to its line's end by `ml-auto`, so when it wraps onto a line of its own it
 * sits at the RIGHT with nothing to its left, and a divider on its own left edge would point at nothing
 * and is out of the row clip's reach. So an empty, `aria-hidden` flex item before it draws the line, and
 * takes the free space (`flex-1`, basis 0) the group's `ml-auto` used to take. Where the group shares a
 * line the line sits in the gap before it; where it wraps, the spacer ends the line above and the line
 * hangs past the row's right edge, clipped like a left-edge one. The negative margin cancels one of
 * the two gaps the extra item adds, so a row's natural width is what it was without it
 * (`promotion-widths.*.json` measures it that way).
 */
export const DECK_TRAILING_SPACER =
  'pointer-events-none relative -ml-2 min-w-0 flex-1 basis-0 self-stretch before:absolute before:inset-y-0 before:-right-1.75 before:border-l before:border-muted-foreground/40 @roomy/deck:-ml-6 @roomy/deck:before:-right-3.25';

/**
 * **A track: the picture of controls that are one unit** (toolbar-grid M2, R2). A recessed bar
 * (`--field`, which inside the chrome scope is the band's own hue one step darker) round a run of
 * members, with a **1 px gap** between them so the units read as joined. The members keep their full
 * `--control-h` box (D-7): nothing about a track makes a target smaller, and the gap is part of the
 * track rather than of either member, so `elementFromPoint` in the gap lands on the track and not on
 * a shrunken button (the 36 and 44 px sweeps in `command-surface.spec.ts` still pass unchanged).
 *
 * **The track is not the state indicator, and cannot be.** The band's luminance is 0.0157, so no fill
 * darker than it can reach 1.31:1, never mind 3:1 (`m0-measurement.md` §6); the track against the band
 * is therefore reported and not asserted. A member that is a text button "does not need a boundary"
 * (WCAG 1.4.11, Understanding), so the chosen one is carried by the raised fill and the underline of
 * {@link TOOLBAR_TRACK_SWITCH}, which are asserted.
 *
 * `inline-flex flex-nowrap` and nothing positioned, tabbable or named: the wrapper this paints is made
 * by Deck and Toolbar clustering (`ClusterTrack`) and carries no role (ADR-0111). `Toolbar`'s segment
 * wrapper (`role="group"`, "Plan view") takes the same classes and **keeps its role and its name**.
 */
export const TOOLBAR_TRACK = 'inline-flex flex-nowrap items-stretch gap-px rounded-md bg-field';

/**
 * **The raised member of a `switch` track** (toolbar-grid M2). The `selected` state already gives the
 * chosen member `--secondary` ink and fill (3.15:1 on the band; 3.59:1 on the track, asserted) and a
 * 2 px `--background` underline. In a track the fill is drawn **inside the member's own box**: the
 * member's `box-shadow` becomes a 2 px `--field` inset ring over the fill, which insets the raised
 * shape from the track's edge, and the underline moves in by the same 2 px. One `box-shadow` value,
 * composed here, so the ring and the underline cannot compete for the property, and the focus ring
 * (`ring-inset`, the other half of the same composite) still paints on top of both.
 *
 * **The members must be plain buttons**: the selector is `track > button[aria-pressed]`, and a `render`
 * item is wrapped in a scope span, so `defineToolbar` refuses a switch cluster that holds one.
 *
 * **Never colour alone.** A raised member computes a distinct background AND a non-`none` shadow in
 * ordinary colours (asserted in the browser, `command-surface.spec.ts`). A shaded member keeps the
 * muted underline of the `selected, disabled` compound in `toolbarControlVariants` and the same 2 px
 * `--field` inset as a free one; the raised rules above exclude `aria-disabled`, and its own rules follow.
 *
 * **Forced colours drop `box-shadow`, and a border would move the box.** `Highlight` /
 * `HighlightText` are system colours, which the mode keeps when an author names them
 * (`toolbarControlVariants` uses `GrayText` the same way). M0 measured the chosen and unchosen
 * members byte-identical there (`m0-measurement.md` §7); this is the mark that was missing.
 *
 * **`forced-color-adjust: none` is not optional, and the first version without it was invisible.**
 * Under the default adjustment Chromium paints a `Canvas` backplate behind a control's text, so
 * `HighlightText` landed on a white box inside the `Highlight` fill: measured, the chosen label
 * vanished (and `CanvasText` on the backplate reads as a pasted chip). Opting the raised member out
 * lets the authored system-colour pair stand as written, which is legible by construction because
 * the reader's theme pairs them. The shadow and the ordinary focus ring are switched off in the same
 * breath, since opting out is what would bring the navy ring, the underline and an amber ring back
 * onto a white page: the focus indicator under forced colours is the unlayered `Highlight` outline
 * in `globals.css`, here as everywhere.
 */
export const TOOLBAR_TRACK_SWITCH = [
  '[&>[aria-pressed=true]:not([aria-disabled=true])]:shadow-[inset_0_0_0_2px_var(--field),inset_0_-4px_0_0_var(--background)]',
  '[&>[aria-pressed=true]:not([aria-disabled=true])]:forced-colors:bg-[Highlight]',
  '[&>[aria-pressed=true]:not([aria-disabled=true])]:forced-colors:[color:HighlightText]',
  '[&>[aria-pressed=true]:not([aria-disabled=true])]:forced-colors:[forced-color-adjust:none]',
  '[&>[aria-pressed=true]:not([aria-disabled=true])]:forced-colors:shadow-none',
  '[&>[aria-pressed=true]:not([aria-disabled=true])]:forced-colors:ring-0',
  // **A chosen member that is shaded** keeps the same 2 px `--field` inset, so the picture is the one a
  // free switch draws and only the ink and the underline say "unavailable" (the underline stays the
  // `selected, disabled` compound's muted one, moved in by the ring).
  '[&>[aria-pressed=true][aria-disabled=true]]:shadow-[inset_0_0_0_2px_var(--field),inset_0_-4px_0_0_var(--muted-foreground)]',
  // Under forced colours every shaded control is `GrayText` ink on the page, and the shadow above is
  // dropped, so a chosen-and-shaded member would read as the unchosen ones. A `GrayText` FILL with
  // `Canvas` ink is the system pair for "chosen but unavailable": it differs from the unchosen members,
  // from the `Highlight` raised one, and it is a fill, so the box does not move (a border would).
  '[&>[aria-pressed=true][aria-disabled=true]]:forced-colors:bg-[GrayText]',
  '[&>[aria-pressed=true][aria-disabled=true]]:forced-colors:[color:Canvas]',
  '[&>[aria-pressed=true][aria-disabled=true]]:forced-colors:[forced-color-adjust:none]',
  '[&>[aria-pressed=true][aria-disabled=true]]:forced-colors:shadow-none',
  '[&>[aria-pressed=true][aria-disabled=true]]:forced-colors:ring-0',
].join(' ');

/**
 * **The inset rule `ruleBefore` draws, from `--container-roomy` only** (toolbar-grid M3, D-4). It is the
 * section rule (`TOOLBAR_INSET_RULE`) put on a wrapper round the item or track that follows it, with
 * the same `ml-1 pl-2` the deck's sections use, so the three marks on a row (group divider, section
 * rule, this) are two strengths and one geometry. Below `--container-roomy` the wrapper is
 * `display: contents`: it has no box, draws nothing and costs the row nothing, which is how the
 * 1024 floor keeps every row's line count in every state (`m0-measurement.md` §4). Not a variant of
 * `TOOLBAR_INSET_RULE` because the rule must not exist at all below the container, and a `relative`
 * wrapper with a `before:` would still reserve its padding.
 */
export const DECK_RULE_BEFORE =
  'contents @roomy/deck:relative @roomy/deck:inline-flex @roomy/deck:items-stretch @roomy/deck:ml-1 @roomy/deck:pl-2 @roomy/deck:before:absolute @roomy/deck:before:inset-y-1/4 @roomy/deck:before:left-0 @roomy/deck:before:w-px @roomy/deck:before:bg-border';

export const toolbarSplitCaretVariants = cva(
  // The divider is the shared inset rule, and the glyph's dimming is a declared token rather than
  // `opacity-70`: `--muted-foreground` inside the chrome scope is `--chrome-muted-foreground`,
  // 8:1 on the band (globals.css declares it), where an opacity is a value nobody gated.
  `${TOOLBAR_INSET_RULE} text-muted-foreground ml-0.5 flex items-center self-stretch pl-1.5 ${TOOLBAR_CARET_TARGET}`,
);

/**
 * **Touch** (ADR-0090 M3-T4, completed by ADR-0118 M2). Under `@media (pointer: coarse)` the
 * control widens to `px-3` **and** takes its height from `--control-h`, which the input axis
 * re-values to 44 px — so an icon-only button goes **32 × 36 → 44 × 44**.
 *
 * **The minor axis is now closed, and it was measured rather than argued.** ADR-0090 M3-T4 moved
 * width only and this docblock recorded the height as owed (`docs/TECH_DEBT.md` #127), on the
 * reasoning that raising `min-h-9` was "a vertical-space decision" too expensive for a padding
 * tweak. Measured at 1646 (ADR-0118 M0-T2, three runs, zero spread) that decision costs **16 px of
 * 808 — 2.0 % — and only on the touch path**; a mouse user loses nothing, because the axis is
 * `pointer: coarse` and the fine default stays 36 px. The deck holds two rows, so a taller control
 * makes those rows taller rather than wrapping a third: the cost is `2 × 8`, linear, not the
 * ≥ 36 px the epic's own prediction expected.
 *
 * The height is `min-h-(--control-h)` rather than a `pointer-coarse:` utility of its own, so the
 * input axis lives in ONE place (`globals.css`) and this file cannot drift from the forms.
 *
 * **The shared CVA is not densified in the other direction** (feature-spec §6 Q4): a global re-value
 * would degrade every touch user to satisfy a desktop complaint, and would buy ≈ 96 px against a
 * measured 94 px overshoot — appearing to fix the defect while leaving the miscount intact. If a
 * compact scale is ever wanted it is a `density` variant under `@media (pointer: fine)` only.
 *
 * The consolidated item count is what makes this affordable at all: 46 registered commands could not
 * have absorbed 8 px each, and 28 can. That is a real benefit of M2 rather than a claim about it.
 */
export const toolbarControlVariants = cva(
  'focus-visible:ring-ring pointer-coarse:px-3 pointer-coarse:min-w-(--control-h) inline-flex min-h-(--control-h) items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-inset',
  {
    variants: {
      tone: {
        control: 'text-foreground font-medium',
        info: 'text-muted-foreground',
      },
      /**
       * **The state ladder** (console epic M3, `docs/specs/workspace-console/`). It replaces a
       * boolean `active`, and replacing rather than extending it is the instrument: the compiler
       * finds all ten call sites, which a grep would not.
       *
       * The boolean painted one wash — `bg-accent`, **1.34:1** against the band — for three
       * different facts, so an armed Add tool looked like a hovered button and an open `View ▾`
       * looked like both. That is the WCAG 2.2 §1.4.11 exposure the epic was opened on, and the
       * defect ADR-0064 exists because of.
       *
       * | state | what it means | fill | second channel |
       * | --- | --- | --- | --- |
       * | `rest` | nothing is true of it | none (hover wash on pointer) | — |
       * | `open` | its panel or menu is showing | `--secondary`, 3.15:1 | `aria-expanded`, and the panel itself |
       * | `selected` | it is the chosen one of alternatives, or its lens is on | `--secondary`, 3.15:1 | a 2 px `--background` underline, 3.15:1 on that fill |
       * | `armed` | it is a MODAL TOOL and the next canvas gesture belongs to it | none — amber ink, 7.91:1 | a 2 px `--primary` underline |
       * | `primary` | it is the PEN, and nothing else ever | `--primary`, 7.91:1 | it leads its row; its label is a verb |
       *
       * **`primary` exists so the pen and an armed tool can never look alike, and it is reserved to
       * one control by rule rather than by nobody happening to use it.** The pen is the precondition
       * for the eleven authoring commands beside it, so it is the loudest thing on the row and the
       * only amber slab; an armed tool is amber INK and an amber underline on the band's own navy.
       * Read the two rows above together — they differ in fill, in ink and in whether a rule is
       * drawn, which is three channels rather than a hue.
       *
       * It carries **no underline**: its label is already a verb that changes (`Start editing` →
       * `Stop editing`) and its `aria-pressed` says the same thing again, so a third mark would be
       * a mark for a fact two channels already carry — while the underline is exactly what `armed`
       * and `selected` use, which is the collision this state exists to avoid.
       *
       * **It shipped missing, and the milestone that needed it wired the pen to `armed` instead.**
       * The approved plan's M3-T2 names five states in as many words; M3 built four and nothing
       * recorded the difference, so M5 reached for the nearest one and reproduced the two-identical-
       * pictures defect the paragraph below records having already been fixed once — with both
       * controls unfilled and identical rather than both filled and identical. Found by the
       * component review, not by a gate: `state-ladder.structural.test.ts` pins which items are
       * `armed` and could not see a pen that declared no `activeKind` at all.
       *
       * **Armed keeps the band's fill and takes an amber outline**, which is the product owner's
       * choice from two rendered studies rather than a default. An amber-FILLED armed tool sat
       * beside the pen (`Stop editing`, itself amber-filled) at the head of the same row: two
       * identical amber slabs, so "the pen is held" and "a tool is armed" became one picture — the
       * exact confusion this ladder exists to remove.
       *
       * **`selected` COMPOSES with `open` rather than being outranked by it, and that is a
       * correction.** The first version of this ladder made `open` win, justified by the caret
       * rotating to distinguish them — **and no caret in this product rotates**; the component
       * review found the claim fabricated and it was load-bearing for the rule. Since `selected`'s
       * class is `open`'s plus an underline, the honest rule is the simple one: **a control's own
       * state outranks the transient fact that its panel is showing**, in both primitives. A
       * filtered `Filter ▾` therefore keeps its underline while open, which is what a planner needs
       * — the alternative silently withdrew the one mark saying a filter was applied at exactly the
       * moment they opened the menu to check.
       *
       * **`selected` and `armed` are declared on the item (`activeKind`), never inferred from
       * ARIA.** `ToolbarPopover` reports `aria-pressed` for an open disclosure, so a ladder driven
       * from that attribute would paint an open menu as an armed tool. `toolbar-registry.ts` says
       * which four items are modal, and a structural test pins the set.
       *
       * **Armed carries NO ring, and that is CQ-2 resolved by measurement rather than by the
       * plan's default.** It was drafted as a 2 px inset amber ring — and `--chrome-ring` and
       * `--chrome-primary` are the identical string, while this CVA already draws focus as
       * `ring-2 ring-inset`, so an armed control that is also keyboard-focused (the ordinary case:
       * you arm it with Enter and focus stays there) would show ONE amber inset ring for two
       * different facts. The plan's remedy was to move focus outside the box (`ring-offset-2`).
       * Measured in a browser after M1: the deck's smallest gap between two controls on a row is
       * **4 px**, which a 2 px offset plus a 2 px ring consumes exactly — the offset ring touches
       * its neighbour. So the ring is dropped instead, which is the plan's own stated fallback, and
       * the shared focus treatment is left untouched.
       *
       * Nothing is lost: armed keeps the band's fill, so **both** of its remaining channels are on
       * the band at 7.91:1 — amber ink (asserted as a TEXT pair, 4.5:1) and a 2 px amber underline.
       * 1.4.1 is satisfied by the underline, which is a shape and not a hue.
       *
       * **`font-semibold` was drafted here too and removed for a layout reason**: weight changes a
       * control's WIDTH, so arming a tool would widen it, and this deck wraps — a row could break a
       * line the moment a planner armed Add and re-join it when they disarmed, moving every command
       * beside it under their cursor mid-interaction. Neither surviving channel touches layout.
       *
       * `selected`'s underline is `inset` for a different measured reason: an outset mark was
       * rejected because the clearance below the deck's last control row is 6 px, so a 2 px amber
       * underline there would sit 4 px above the band's own 3 px amber rule.
       */
      state: {
        rest: '',
        open: 'bg-secondary text-secondary-foreground',
        selected:
          'bg-secondary text-secondary-foreground shadow-[inset_0_-2px_0_0_var(--background)]',
        armed: 'text-primary shadow-[inset_0_-2px_0_0_var(--primary)]',
        // **Its own focus ring, and that is CQ-2 arriving one state late.** The shared treatment on
        // the base is `focus-visible:ring-ring ring-inset`, and inside the chrome scope `--ring`
        // and `--primary` are the **identical string** — so an inset ring on this state's own amber
        // fill is a 1:1 indicator, invisible, on the one control this epic put at the head of the
        // row. WCAG 2.2 §2.4.7, and §1.4.11 for the indicator itself.
        //
        // CQ-2 recorded that collision and answered it for `armed` by dropping the ring, which
        // works there because `armed` keeps the band's fill and so never had a ring-on-fill pair at
        // all. M5 added a state that does, and the check was not re-run: one correct pattern
        // applied to a control and not its neighbour, the shape this register has recorded in seven
        // consecutive epics, inside the ladder built to end it. Found by the M7 ux review.
        //
        // `--primary-foreground` is the ink this state already puts on this fill, so the indicator
        // is 7.91:1 by the same arithmetic as its label and needs no new token.
        // `ring-offset-2` is NOT the answer, for the reason CQ-2 gives above: the deck's smallest
        // gap between two controls is 4 px, which a 2 px offset plus a 2 px ring consumes exactly.
        primary: 'bg-primary text-primary-foreground focus-visible:ring-primary-foreground',
      },
      /**
       * **A shaded control is quiet, not dimmed** (toolbar-redesign M6 V3). It was `opacity-50`, which
       * halves the whole control: label, glyph, a state fill and an underline together. That read as
       * a dead grey and — worse — was a number nobody had gated, since an alpha composites against
       * whatever is behind it (the band, the amber of the pen). It is now the same
       * `--muted-foreground` the chevrons and captions already wear, **7.98:1 on the band** (7.33:1 on the
       * deck pill the band wore until toolbar-grid M1; `m6-measurement.md` §3), so the text clears 1.4.3's 4.5:1 although 1.4.3
       * exempts an inactive control.
       *
       * The fill and the underline go too (`bg-transparent shadow-none`): ink in `--muted-foreground`
       * on a `--secondary` or amber fill is unreadable, so a shaded pen, a shaded open trigger and a
       * shaded selected lens all fall back to the same bare picture. What still says "shut" is that
       * picture, `cursor-default`, no hover wash, and the reason a reader can reach by keyboard
       * (ADR-0082) — not a lower contrast.
       *
       * **Two things the quiet style must still say.** A lens that is ON but shaded (`selected`) keeps
       * a 2 px underline in the same ink (compound variant below): the fill is gone, and without a
       * mark a reader could not tell an engaged lens from a free one. And **forced colours**: the mode
       * overrides `color` to `CanvasText` for every control, so `opacity-50` used to be the only thing
       * that survived to say "shut"; `GrayText` is the system colour for exactly that, and an author-
       * specified system colour is kept (the same device `viewport-notice.tsx` uses).
       */
      disabled: {
        true: 'cursor-default bg-transparent text-muted-foreground shadow-none forced-colors:[color:GrayText]',
        false: '',
      },
    },
    compoundVariants: [
      // A shaded pen has no amber fill left, so the navy ring `primary` draws for itself would be navy
      // on the navy band: the shared amber ring takes over (WCAG 2.4.7; it is a shaded control a
      // keyboard reader still lands on, ADR-0082).
      { state: 'primary', disabled: true, class: 'focus-visible:ring-ring' },
      // A shaded lens that is ON keeps a quiet underline (see `disabled` above).
      {
        state: 'selected',
        disabled: true,
        class: 'shadow-[inset_0_-2px_0_0_var(--muted-foreground)]',
      },
      // Idle interactive control gets the hover wash; a control in any other state, or a disabled
      // one, does not — a hover wash over a state fill would say two things at once, and hover is
      // the one state a reader never has to FIND (their pointer is already on it).
      //
      // **`--muted` rather than the previous `bg-accent/60`, and the change is deliberate.** The
      // two are 0.018 apart in lightness (1.25:1 and 1.34:1 against the band), so the swap is not
      // visible — what it buys is that `--accent` stops being spent on hover at all, and hover
      // becomes a token this file's new state-ladder block reports by name. An alpha over a state
      // fill would also composite differently per state, which is how one wash came to mean three
      // things in the first place.
      { tone: 'control', state: 'rest', disabled: false, class: 'hover:bg-muted' },
    ],
    defaultVariants: { tone: 'control', state: 'rest', disabled: false },
  },
);

/**
 * **The one resolver for whether a control's label shows** (toolbar-redesign M1). Every renderer
 * calls it with the item's declared {@link ToolbarLabelVisibility} and the surface it paints on, and
 * hands the answer to the control — `Deck` and `Toolbar` hold no label logic of their own, and a
 * control that decided for itself is the second implementation this replaces.
 *
 * `'roomy'` is meaningful on the **deck** alone: that is the one surface that declares the
 * `@container/deck` its query asks, so everywhere else (`Toolbar`) it resolves to `'visible'`. The
 * absence of a container would give the same answer in CSS, but only by accident; stating it here
 * is what makes it testable.
 */
export function resolveLabelVisibility(
  visibility: ToolbarLabelVisibility | undefined,
  surface: 'deck' | 'toolbar',
): ToolbarLabelState {
  switch (visibility ?? 'always') {
    case 'never':
      return 'hidden';
    case 'roomy':
      return surface === 'deck' ? 'roomy' : 'visible';
    case 'roomy-fine':
      return surface === 'deck' ? 'roomy-fine' : 'visible';
    case 'always':
      return 'visible';
  }
}

/**
 * **The one class helper for painting a label**, or `null` when the control is icon-only. Nothing
 * outside this module writes `truncate` for a toolbar label or names the container variant, which
 * is what `toolbar-label.structural.test.ts` pins.
 *
 * A `'roomy'` label is `sr-only` — still in the accessibility tree, so the name and 2.5.3's
 * label-in-name hold either way — below `--container-roomy`. The variant is the **named** token
 * (`globals.css`), never an arbitrary `@max-[…]` value: Tailwind 4.3.3 compiles both (M0 §4.4), and
 * the named form is chosen because the design system has no arbitrary values. `deck` is the
 * container's name (`@container/deck`, `Deck.tsx`).
 */
export function toolbarLabelClass(state: ToolbarLabelState): string | null {
  if (state === 'hidden') return null;
  if (state === 'roomy-fine') return 'truncate @max-roomy/deck:sr-only pointer-coarse:sr-only';
  return state === 'roomy' ? 'truncate @max-roomy/deck:sr-only' : 'truncate';
}

/**
 * The deck's width minimum for a control, by label state: wide enough for a labelled command, or
 * only for the icon. `'roomy'` carries both because its label comes and goes with the container.
 * Part of the label rule rather than of `Deck`, so the minimum can never disagree with the label.
 */
export function toolbarLabelMinWidthClass(state: ToolbarLabelState): string {
  if (state === 'hidden') return 'min-w-9';
  if (state === 'roomy-fine') {
    return 'min-w-12 @max-roomy/deck:min-w-9 pointer-coarse:min-w-(--control-h)';
  }
  return state === 'roomy' ? 'min-w-12 @max-roomy/deck:min-w-9' : 'min-w-12';
}

/** A control's state in the ladder — what {@link toolbarIconClass} reads, and the CVA's own `state`. */
export type ToolbarControlState = NonNullable<VariantProps<typeof toolbarControlVariants>['state']>;

/**
 * **The one class helper for a glyph's ink** (toolbar-grid M3, R4, SC-11): a glyph beside a visible
 * label is a step quieter than the label, so the pen's amber slab is the only saturated thing at rest
 * and the eye reads the words first. Called by every trigger that paints a glyph, which is what
 * `toolbar-icon.structural.test.ts` pins; the surfaces that opt in (`quietIcons`: the deck and the
 * header's toolbars) are the only callers that apply it.
 *
 * - `rest` with a visible label: `--muted-foreground`. A `'roomy'` label comes and goes in CSS, so the
 *   glyph is muted only while the label shows and goes back to the control's own ink when the
 *   label is `sr-only` (`@max-roomy/deck:`); `'roomy-fine'` also goes back under a coarse pointer.
 *   It is `inherit` and not `text-foreground` so a shaded control's glyph stays shaded.
 * - `rest` icon-only: **inherit** (`--foreground`). The glyph is the whole control, and a muted one
 *   would read as shaded, which is a different fact (`toolbarControlVariants` `disabled`).
 * - `open`, `selected`, `armed`, `primary`: inherit the state's own ink, which is what says the state.
 *
 * `forced-colors:text-inherit` keeps the author colour from replacing a shaded control's `GrayText`
 * with `CanvasText` on the glyph: forced colours override an author `color`, and inheriting is what
 * lets the control's system colour reach the glyph.
 */
export function toolbarIconClass(
  labelState: ToolbarLabelState,
  state: ToolbarControlState,
): string {
  if (state !== 'rest' || labelState === 'hidden') return '';
  const quiet = 'text-muted-foreground forced-colors:text-inherit';
  switch (labelState) {
    case 'roomy':
      return `${quiet} @max-roomy/deck:text-inherit`;
    case 'roomy-fine':
      return `${quiet} @max-roomy/deck:text-inherit pointer-coarse:text-inherit`;
    case 'visible':
      return quiet;
  }
}
