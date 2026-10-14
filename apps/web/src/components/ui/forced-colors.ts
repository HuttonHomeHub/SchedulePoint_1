/**
 * **The class vocabulary for drawing under a Windows contrast theme** (`forced-colors: active`;
 * ADR-0191, `docs/TECH_DEBT.md` #505).
 *
 * Forced colours replaces author `color`, `background-color` and `border-color`, computes
 * `box-shadow` to `none`, and leaves `opacity` and `outline` alone. A mark that was a fill or a ring
 * therefore needs a second form that carries the same meaning by system colour **and** by shape
 * (D2). The system colours are named here once so a feature does not restate them.
 *
 * **`forced-color-adjust: none` is on exactly the marks that are a fill**, and nowhere else. It is
 * what lets an author-specified system colour reach the screen as a background, it inherits, and so
 * it is never put on a container whose descendants must stay in the reader's colours (the selected
 * row, which is why its mark is a pseudo-element edge and not a fill: ADR-0191 D2).
 *
 * A shaded control needs nothing from this file: one unlayered rule in `globals.css` greys every
 * `aria-disabled` interactive role (ADR-0191 D1).
 */

const KEEP_AUTHOR_COLOURS = 'forced-colors:[forced-color-adjust:none]';

/** A solid mark in the reader's text colour: a summary bar's body, a milestone, a grip. */
export const FORCED_SOLID_MARK = `forced-colors:bg-[CanvasText] ${KEEP_AUTHOR_COLOURS}`;

/** A bar drawn as an edge on the page: 1 px of `CanvasText` around `Canvas`. */
export const FORCED_OUTLINED_BAR =
  'forced-colors:border forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]';

/** The same bar with a 3 px edge, three times the ordinary one: the width is the cue. */
export const FORCED_HEAVY_EDGE_BAR =
  'forced-colors:border-3 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]';

/** A solid bar that still has an edge, so a band laid inside it cannot erase its start. */
export const FORCED_EDGED_SOLID_BAR = `${FORCED_SOLID_MARK} forced-colors:border forced-colors:border-[CanvasText]`;

/** A band inside an outlined bar: `CanvasText`, held 1 px inside the edge so a full bar still reads as outlined. */
export const FORCED_BAND_IN_OUTLINED_BAR = `${FORCED_SOLID_MARK} forced-colors:inset-y-px forced-colors:left-px forced-colors:[max-width:calc(100%-2px)]`;

/** A band inside a solid bar: `Canvas`, inside the solid bar's own edge. */
export const FORCED_BAND_IN_SOLID_BAR = `forced-colors:bg-[Canvas] ${KEEP_AUTHOR_COLOURS} forced-colors:inset-y-px forced-colors:left-px forced-colors:[max-width:calc(100%-2px)]`;

/**
 * The armed bar's outline: `CanvasText`. Not `Highlight`, which is the selected row's edge and the
 * focus ring's colour; an armed bar sits inside the selected row, and the outline stands a pixel
 * off the bar's own edge, so the two marks stay distinct by colour and by gap.
 */
export const FORCED_ARMED_OUTLINE = 'forced-colors:outline-[CanvasText]';

/**
 * A selected row's mark: a 4 px `Highlight` edge, drawn by a pseudo-element on the row's sticky
 * first cell. **Not a fill**: a `Highlight` fill needs `forced-color-adjust: none`, which inherits
 * and would un-force every control inside the row, and a descendant's `Highlight` focus ring would
 * sit on a `Highlight` fill. The pseudo-element has no children, so the opt-out reaches nothing
 * else, and an out-of-flow edge moves no layout.
 */
export const FORCED_SELECTED_EDGE = [
  'forced-colors:before:absolute',
  'forced-colors:before:inset-y-0',
  'forced-colors:before:left-0',
  'forced-colors:before:w-1',
  'forced-colors:before:bg-[Highlight]',
  'forced-colors:before:[forced-color-adjust:none]',
].join(' ');

/** An opaque card with an edge of its own, for a surface whose brand fill the mode replaces. */
export const FORCED_EDGED_CARD =
  'forced-colors:border forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]';
