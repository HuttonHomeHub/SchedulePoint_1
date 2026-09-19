import { cn } from '@/lib/utils';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * How wide the content may grow.
   *
   * **`default` carries the product's measure, and that is the load-bearing part.** There used to be
   * a second key, `wide`, holding this same value for "a screen whose content is genuinely tabular
   * and suffers from being narrowed" — and two screens passed it while **ten said nothing and got a
   * narrower one**. That is the failure mode, and it is not fixed by converting call sites: a
   * conversion leaves the next screen to be added getting the narrow measure for saying nothing,
   * which is exactly how these ten arrived. So the value moved to the default and `wide` was
   * retired rather than kept as an alias, because two names for one value is the drift this
   * archetype exists to remove (ADR-0146 D1).
   *
   * Measured before the change: the nine org-scoped screens rendered 1104px of content at 1646 and
   * 1920 while the organisation landing rendered 1321 and 1488 — the single most literal reason the
   * screens "felt different", since nothing on them could line up with the page they were being
   * aligned to. See `docs/specs/page-composition/m0-measurement.md` §7.
   *
   * `narrow` is for a screen that is **read rather than scanned**. Its only consumer is the staff
   * console's not-found branch (`staff.tsx:107`), where a refusal is a sentence and a paragraph and
   * the product's measure would set it across an empty screen. This docblock used to justify the
   * key by the organisation overview at 1646px; that screen has not used it since ADR-0144, and the
   * reason recorded here is the one that is true.
   *
   * `full` opts out entirely, for a screen that manages its own width.
   *
   * A screen may also opt out of this archetype altogether — `/account` hand-writes `max-w-2xl`
   * because a 1488px form puts a label at one end of the screen and its field at the other. That is
   * a **declared** exception with a checked list, not a convention (`page-container.structural.test.ts`).
   */
  width?: 'narrow' | 'default' | 'full';
}

const WIDTHS = {
  narrow: 'max-w-4xl',
  default: 'max-w-screen-2xl',
  full: 'max-w-none',
} as const;

/**
 * The page frame: centred, width-limited, padded.
 *
 * **It renders a `<div>` and NOT a landmark, and that is the load-bearing decision.** The obvious
 * implementation of "the page frame" is a `<main>` — and every screen this replaces already sits
 * inside the app shell's own `<main>`, so that would ship two `main` landmarks on every
 * authenticated screen. A screen-reader user navigating by landmark would meet two, with no way to
 * tell which held the content. Raised by the architect while checking this archetype against the
 * organisation landing page's spec, which states in its own words that the screen "sits inside the
 * shell's existing `<main>` and adds no landmark".
 *
 * It exists because the same frame was hand-written **fourteen times**
 * (`mx-auto w-full max-w-6xl flex-1 p-6`), which is fourteen chances for one screen to be padded
 * differently from its neighbour and no way to change the measure once.
 */
export function PageContainer({
  className,
  width = 'default',
  ...props
}: PageContainerProps): React.ReactElement {
  return <div className={cn('mx-auto w-full flex-1 p-6', WIDTHS[width], className)} {...props} />;
}
