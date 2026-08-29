import { Link, type LinkProps } from '@tanstack/react-router';
import { Fragment } from 'react';

import { cn } from '@/lib/utils';

/** One breadcrumb: a plain label for the current page, or a link to an ancestor. */
export interface Crumb {
  label: string;
  to?: LinkProps['to'];
  params?: LinkProps['params'];
}

/**
 * Ancestor trail for the hierarchy screens (Clients → client → project …). The
 * last crumb is the current page (rendered as plain text with
 * `aria-current="page"`); earlier crumbs link to their ancestor route.
 *
 * **`variant="nowrap"` is for a trail inside a fixed-height band**, which is a different
 * problem from the one the default solves. On a hierarchy screen the trail is free to wrap
 * onto a second line and should; in the ADR-0097 D1b chrome band a wrapped crumb grows the
 * band, which silently gives back the 45 px that merge was measured to win. So the variant
 * refuses to wrap and truncates each crumb instead, with `title` carrying the full string.
 *
 * A named variant rather than a `className` escape hatch: "a breadcrumb in a fixed-height
 * band must not wrap" is a reusable rule about a situation, and the next band gets it right
 * by asking for it (`docs/DESIGN_SYSTEM.md` — no one-off component styling).
 */
export function Breadcrumbs({
  items,
  variant = 'wrap',
}: {
  items: Crumb[];
  variant?: 'wrap' | 'nowrap';
}): React.ReactElement {
  const nowrap = variant === 'nowrap';
  return (
    <nav aria-label="Breadcrumb" className={nowrap ? 'min-w-0' : undefined}>
      <ol
        className={cn(
          'text-muted-foreground flex items-center gap-1.5 text-sm',
          nowrap ? 'min-w-0 flex-nowrap' : 'flex-wrap',
        )}
      >
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <li
                className={nowrap ? 'min-w-0' : undefined}
                {...(nowrap ? { title: crumb.label } : {})}
              >
                {isLast || !crumb.to ? (
                  <span
                    className={cn(
                      isLast && 'text-foreground font-medium',
                      nowrap && 'block truncate',
                    )}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.to}
                    {...(crumb.params ? { params: crumb.params } : {})}
                    // **A crumb is this epic's one NAMED exception to the house rule, and it is an
                    // exception on BOTH pointers** (ADR-0118 M3). Measured: 58 x 20 at 1646 and
                    // 23 x 20 at 390.
                    //
                    // It is compliant against WCAG 2.2 §2.5.8 under that SC's **Inline** exception
                    // — the crumb sits on a line of non-target text (the `/` separators and the
                    // current page's plain-text crumb) and its size is constrained by that
                    // line-height. This register has recorded overstating an SC once (ADR-0082),
                    // so that is claimed narrowly rather than assumed.
                    //
                    // **A coarse-pointer box was built, measured, and withdrawn**, which is the
                    // more useful half. `pointer-coarse:min-h-(--control-h)` did give it 44 px of
                    // height — and the crumb then measured **16 x 44 at 390**, worse on the axis
                    // that was already failing, because a crumb in `nowrap` mode truncates to
                    // whatever room is left. A breadcrumb's width is not a design choice; it is
                    // the space available. No CSS makes a truncated crumb 44 px wide, and the
                    // version that looks like it complies is the one that shipped a 16 px target.
                    //
                    // The mitigation is that this destination is never only here: the same
                    // project and plan are reachable at full size from the Project Explorer tree,
                    // and the organisation from the wordmark on the same row. **"Beside it" holds
                    // only at `lg`+**, where the Explorer is a docked column; below that it is an
                    // off-canvas Sheet behind a hamburger, so the alternative costs a tap first.
                    // Stated because 390 is the width where the crumb is at its worst (16 px) and
                    // where touch is guaranteed — a mitigation that overstates itself at exactly
                    // the width the finding is about is not a mitigation.
                    className={cn(
                      'hover:text-foreground rounded-sm underline-offset-4 hover:underline',
                      nowrap && 'block truncate',
                    )}
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
              {isLast ? null : (
                <li aria-hidden="true" className="select-none">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
