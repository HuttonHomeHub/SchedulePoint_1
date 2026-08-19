import { cn } from '@/lib/utils';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * How wide the content may grow. `default` is the reading measure every list and detail screen
   * uses; `wide` is for a screen whose content is genuinely tabular and suffers from being
   * narrowed; `full` opts out entirely, for a screen that manages its own width.
   */
  width?: 'default' | 'wide' | 'full';
}

const WIDTHS = {
  default: 'max-w-6xl',
  wide: 'max-w-screen-2xl',
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
