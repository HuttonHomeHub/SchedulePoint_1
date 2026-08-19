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
