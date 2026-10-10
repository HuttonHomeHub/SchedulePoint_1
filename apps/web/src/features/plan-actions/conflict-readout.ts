/**
 * **One look for a conflict read-out** (conflict-reason-on-object, ADR-0186 D6): ordinary foreground
 * text and a warning-coloured triangle — no fill, no border, no hover. The deck's count chip and the
 * selection bar's reason line both take it, so the two cannot drift into two idioms for "something
 * is wrong here". Class constants only: no React, no env.
 *
 * Foreground, not muted: the line that says what is wrong must not be the quietest text on the bar.
 * The icon is `--warning-text`, the token gated for text-on-chrome contrast; colour is never the
 * only signal because the words carry the meaning (WCAG 1.4.1).
 */
export const CONFLICT_READOUT_TEXT = 'text-foreground font-normal';
export const CONFLICT_READOUT_ICON = 'text-warning-text shrink-0';
