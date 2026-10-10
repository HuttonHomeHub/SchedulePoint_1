/**
 * **The layout is designed from this width up** (ADR-0179). Below it the signed-in app still
 * reflows — nothing is hidden — but it is no longer designed, and the viewport notice tells the
 * reader so.
 *
 * It is `64rem`, not `1024px`, and that is the whole reason this is one constant: Tailwind's `lg`
 * is `64rem`, the shell's docked Project Explorer switches to a sheet at exactly that width
 * (`app-shell.tsx`), and a reader who raised the browser's default font size needs the room that
 * the larger rem buys. The floor therefore moves with the text size, which is correct.
 *
 * `breakpoints.test.ts` pins this to Tailwind's `lg`, so the notice, the shell and the utility
 * classes cannot drift apart by one of them being edited.
 */
export const DESIGNED_MIN_WIDTH_QUERY = '(min-width: 64rem)';

/**
 * The same floor in pixels at the default 16 px font. It is the reference the floor is derived
 * from and the figure `breakpoints.test.ts` pins; copy states {@link designedMinWidthPx}, which
 * follows the reader's root font size. Never compare a width against either: use
 * {@link DESIGNED_MIN_WIDTH_QUERY}, which scales on its own.
 */
export const DESIGNED_MIN_WIDTH_PX = 1024;

/**
 * The floor in the pixels this reader's `64rem` actually is — for copy only ("at least N pixels
 * wide"). With a raised browser font size the query is met at a wider window than 1024, and copy
 * that said 1024 beside "Your window is 1100 pixels wide" would contradict the page it sits on.
 */
export function designedMinWidthPx(): number {
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Math.round(64 * (Number.isFinite(root) && root > 0 ? root : 16));
}

/**
 * **`squat`** — narrow **and** short (`globals.css`, `@custom-variant squat`). Under it the command
 * band scrolls away with the page instead of holding the window (toolbar-redesign M3, CQ-3).
 * `breakpoints.test.ts` pins the stylesheet's query to these two constants, so the variant, the
 * notice and the shell cannot drift apart.
 *
 * 26 rem: the window height, below `lg`, at which the held band stops being a fair share of it. The
 * band is a 88-156 px header plus the 44-52 px scrolling line plus a 3 px rule — about 135-211 px —
 * so at the #471 cells it is 37-43 % of 360 px and 53-82 % of 256 px. Larger than that and the
 * default narrow-shell window (640 x 480, 30 rem) would lose its held band for no reason: its band
 * is 28-32 % of it. In rem, so text-only 200 % zoom (a 1280 x 800 window at a 32 px default font
 * size is 40 x 25 rem) lands inside it.
 */
export const SQUAT_MAX_HEIGHT_REM = 26;

/** The media query `@custom-variant squat` is declared with. */
export const SQUAT_QUERY = '(width < 64rem) and (height <= 26rem)';

/**
 * **The promotion stages** (toolbar-redesign M5, spec §4.11): the viewport widths, in rem, at which
 * a menu command may come out onto the command deck, narrowest first — **the one list**: the stage
 * names, the rem values, the media queries and the stage count all derive from it, so adding a stage
 * is one row. `80` is 1280 px at the default font size, `90` is 1440, `100` is 1600 (the product
 * owner's 1646 sits just over it), `119.5` is 1912, `135` is 2160 and `160` is 2560. They are rem,
 * like {@link DESIGNED_MIN_WIDTH_QUERY}, so a reader who raised the browser's default font size gets
 * the room in text terms (a 1280 px window at a 32 px default is 40 rem and promotes nothing).
 *
 * **Viewport stages, not a measured row** (ADR-0109 D1): the ladder is a committed table indexed by
 * these constants, which is what keeps it from being a width mechanism that measures itself and gets
 * it wrong. `breakpoints.test.ts` pins them; `promotion-ladder.test.ts` pins every entry's stage to
 * `computePromotionStages` over the committed widths.
 */
export const PROMOTION_STAGES = [
  { name: 'PROMOTE_80', rem: 80 },
  { name: 'PROMOTE_90', rem: 90 },
  { name: 'PROMOTE_100', rem: 100 },
  { name: 'PROMOTE_119_5', rem: 119.5 },
  { name: 'PROMOTE_135', rem: 135 },
  { name: 'PROMOTE_160', rem: 160 },
] as const;

/** The stages' rem thresholds in ascending order. A stage's index + 1 is how many the viewport has reached. */
export const PROMOTION_STAGE_REMS: readonly number[] = PROMOTION_STAGES.map((stage) => stage.rem);

/** The media query for one stage's threshold. */
export function promotionStageQuery(rem: number): string {
  return `(min-width: ${String(rem)}rem)`;
}
