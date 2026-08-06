import { BrandMark } from './brand-mark';
import { TsldMotif } from './tsld-motif';

import { Surface } from '@/components/ui/surface';

/**
 * The tagline, in one place because it is the same sentence on all six public screens and on the
 * old app before them. Exported so a test can assert the screens agree rather than restating it.
 */
export const BRAND_TAGLINE = 'A future reimagined by intelligent visual planning';

/**
 * Where the photograph lives. Served same-origin from `public/`, and that is not a preference:
 * the deployed Content-Security-Policy is `img-src 'self' blob:` (`docker-compose.yml:81`), so
 * the old app's approach — hotlinking `images.unsplash.com` straight from CSS — would be blocked
 * outright on the real site. Vendoring it is the only way this image renders at all.
 *
 * A missing file degrades correctly rather than breaking: the request 404s, nothing paints, and
 * the navy fill beneath shows through with the mark and tagline still legible on it. What the
 * asset has to be, and why a replacement is a low-stakes choice, is `docs/BRAND_ASSETS.md`.
 */
const PANEL_IMAGE = '/brand/auth-panel.avif';

/**
 * The public screens' brand panel (ADR-0077 §2, photograph restored in M7).
 *
 * **Three layers, and the order is the whole design.** A photograph, a navy wash over it at
 * 80–90% opacity, and the content on top. The wash is what makes this safe: at that opacity the
 * photograph is a *texture*, not a picture, so it carries atmosphere without ever competing with
 * the words — which is also why ADR-0077 §3's original objection (a photo defeats the computed
 * contrast gate, because the gate reads tokens and cannot see a JPEG) is much smaller than it
 * first looked. The text sits on the wash, and the wash is a token the gate can read.
 *
 * The opacities, the 3px amber seam and its position are the old app's exact values, read from
 * `static/css/auth.css` in `HuttonHomeHub/SchedulePoint` rather than matched by eye.
 *
 * `aria-hidden`, still: the mark, the diagram and the tagline are decoration on every one of these
 * screens. The product name is already in `<title>` and the heading beside this panel says what
 * the screen is for, so a screen-reader user loses nothing and skips three redundant stops.
 */
export function BrandPanel(): React.ReactElement {
  return (
    <Surface
      tone="brand"
      as="aside"
      aria-hidden="true"
      className="text-foreground relative flex flex-col items-center justify-center gap-5 overflow-hidden p-6 md:p-8"
    >
      {/* Layer 1 — the photograph. A background image rather than an `<img>` because it is
          decoration with no accessible name to give; `bg-cover bg-center` is the old app's
          `background-size: cover; background-position: center`. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${PANEL_IMAGE}')` }}
      />
      {/* Layer 2 — the navy wash. `--background` inside this scope IS the brand navy, so the
          wash follows the token rather than repeating a hex the contrast gate cannot see. */}
      <div className="from-background/80 to-background/90 absolute inset-0 bg-linear-to-b" />
      {/* Layer 3 — the amber seam at the join. 3px, centred on the panel's right edge over the
          middle half of its height, exactly as `.auth-image::after` drew it. Hidden below `md`,
          where the panel is a band above the card and there is no vertical join to mark. */}
      <div className="bg-primary absolute top-1/4 right-0 hidden h-1/2 w-[3px] md:block" />

      <div className="relative flex flex-col items-center gap-3 text-center">
        {/* Two shapes, one element. At `md` and up this is the old app's large centred lockup —
            tile above wordmark, the panel's whole subject. Below `md` the panel is a slim band
            above the card, and the same lockup measured **124px on a 640×360 landscape phone: 34%
            of the screen given to decoration**, which `e2e-public` caught. The row form at
            `text-lg` is 76px. Responsive utilities rather than two elements, because two copies
            behind `hidden`/`md:hidden` both land in jsdom's accessibility tree and silently make
            every `getByText` on a public screen ambiguous — see the lockup count above. */}
        <BrandMark className="text-lg md:flex-col md:gap-3 md:text-4xl" />
        {/* The motif keeps its place beneath the wordmark: the photograph says "construction", the
            diagram says "and this is what we do with it". Below `md` the panel is a slim band, and
            a five-bar diagram at that size is a smudge. */}
        <TsldMotif className="mt-2 hidden w-full max-w-xs md:block" />
        <p className="text-muted-foreground hidden max-w-xs text-sm leading-relaxed md:block">
          {BRAND_TAGLINE}
        </p>
      </div>
    </Surface>
  );
}
