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
 * The same floor in pixels at the default 16 px font — for copy only ("at least 1024 pixels
 * wide"). Never compare a width against it: use {@link DESIGNED_MIN_WIDTH_QUERY}, which scales.
 */
export const DESIGNED_MIN_WIDTH_PX = 1024;
