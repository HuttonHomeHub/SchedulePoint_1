import { BrandPanel } from './brand-panel';

import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

/**
 * **The brand surface's floating card** — the ground, the card and the navy panel — extracted from
 * `AuthShell` (ADR-0179) so a second screen can wear it without a second copy of the geometry.
 *
 * The second screen is the viewport notice, which is the first *signed-in* consumer of the `auth`
 * surface scope (ADR-0077). Nothing about the scope changes: it is the same tokens, the same
 * pinned navy, and it reads identically in every theme, which is what a page shown to someone
 * whose window is the wrong shape most needs.
 *
 * Presentational only: it owns no landmark semantics beyond `as`, no announcer, and no state.
 * `AuthShell` keeps the `main` and the announcer; the notice renders a `div` inside its dialog.
 *
 * - `fit="fixed"` is the public screens: one height at `md` and up (see `AuthShell`'s docblock).
 * - `fit="content"` sizes the card to what is in it, and splits into two columns only when the
 *   window is `md` wide **and** tall enough to spare the width (see {@link BrandPanel}'s `split`).
 *   Its column does not scroll on its own: the notice's dialog is the scroller, so a pinned footer
 *   can stick to the dialog's edge.
 */
export function BrandCard({
  as = 'main',
  fit = 'fixed',
  className,
  columnClassName,
  children,
  ...rest
}: {
  as?: 'main' | 'div';
  fit?: 'fixed' | 'content';
  className?: string;
  /** Classes for the content column beside the panel. */
  columnClassName?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'className'>): React.ReactElement {
  const fixed = fit === 'fixed';
  return (
    // The ground. Its two stops are a global token pair rather than surface-family members,
    // because a gradient needs two stops and the 17-name surface vocabulary has no word for the
    // second one — the same reason the canvas pair exists (ADR-0055). Naming the tokens in prose
    // here would trip the seam guard, which matches text and not just code.
    <div className="from-ground to-ground-end grid min-h-dvh place-items-center bg-linear-to-br p-4">
      <Surface
        tone="auth"
        as={as}
        className={cn(
          'bg-background grid w-full max-w-[900px] rounded-lg shadow-xl',
          // `overflow-clip`, not `overflow-hidden`, for the content-sized card: `hidden` makes the
          // card a scroll container, and a sticky footer then sticks to a box that never scrolls
          // instead of to the dialog that does.
          fixed ? 'overflow-hidden' : 'overflow-clip',
          fixed ? 'md:h-[40rem] md:grid-cols-2' : 'md:tall:grid-cols-2',
          className,
        )}
        {...rest}
      >
        <BrandPanel split={fixed ? 'md' : 'md-tall'} />
        <div
          className={cn(
            'flex flex-col justify-center',
            fixed && 'overflow-y-auto p-2 md:p-4',
            columnClassName,
          )}
        >
          {children}
        </div>
      </Surface>
    </div>
  );
}
