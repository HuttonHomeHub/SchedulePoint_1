import { BrandMark } from './brand-mark';
import { TsldMotif } from './tsld-motif';

import { Surface } from '@/components/ui/surface';

/**
 * The product's tagline, verbatim (ADR-0077 §5, product-owner decision).
 *
 * Exported and pinned by a string-equality test because a copy pass is exactly how a line like
 * this gets "improved" — it is the only sentence on any public screen that says what the product
 * is *for* rather than what the form in front of you does.
 */
export const BRAND_TAGLINE = 'A future reimagined by intelligent visual planning';

/**
 * The dark navy panel beside the card on every public screen (ADR-0077 §2–§4).
 *
 * **Fixed dark in every theme, and that is a decision rather than an oversight.** A signed-out
 * visitor cannot choose a theme — `theme-boot.js` picks Dark from their OS or Corporate because a
 * colleague signed in on this machine last month — so without this the one screen that has to be
 * recognisable renders in one of three identities, selected by something the visitor did not do
 * and cannot undo. The `brand` surface scope carries that; nothing in here names a colour.
 *
 * **One `<aside>`, always rendered; only its proportion changes.** Rendering two copies behind
 * `hidden md:flex` / `md:hidden` is the obvious way to do a responsive layout and would break every
 * existing suite silently: jsdom has no CSS, so both copies land in the accessibility tree,
 * `getByText` queries go ambiguous, and `getAllBy*` assertions keep passing while asserting
 * nothing. `brand-panel.test.tsx` counts the lockup for exactly that reason.
 *
 * **`aria-hidden`, and it loses nothing.** The brand mark, the tagline and the motif are the same
 * three facts on all six screens; the product's name is already in `<title>` (M5) and the heading
 * says what the screen is for. A screen-reader user meeting the same decorative panel six times is
 * being charged for it six times.
 */
export function BrandPanel(): React.ReactElement {
  return (
    <Surface
      tone="brand"
      as="aside"
      aria-hidden="true"
      className="text-foreground flex flex-col justify-between gap-6 overflow-hidden p-6 md:p-8"
    >
      <BrandMark className="text-lg" />

      {/* The motif sits between the mark and the tagline so the eye meets identity, then evidence,
          then the claim. Capped rather than stretched: on a tall viewport a huge diagram reads as a
          chart somebody forgot to label. */}
      <TsldMotif className="mx-auto hidden w-full max-w-sm md:block" />

      {/* `hidden md:block`, like the motif, because the acceptance criterion says so (spec §2.1
          US-1: "given a viewport < `md` … the tagline is not rendered") and because the measurement
          says why. Below `md` this panel is a **band above the card**, and a band's job is to say
          whose product this is — the tagline is a claim, and a claim costs vertical space on the
          one screen where the reader came to do something. It shipped visible at every width until
          the M6 browser sweep; nothing else could have caught it, since jsdom has no breakpoints. */}
      <p className="text-muted-foreground hidden max-w-xs text-sm leading-relaxed md:block md:text-base">
        {BRAND_TAGLINE}
      </p>
    </Surface>
  );
}
