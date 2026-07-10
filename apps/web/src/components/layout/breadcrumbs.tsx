import { Link, type LinkProps } from '@tanstack/react-router';
import { Fragment } from 'react';

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
 */
export function Breadcrumbs({ items }: { items: Crumb[] }): React.ReactElement {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <li>
                {isLast || !crumb.to ? (
                  <span
                    className={isLast ? 'text-foreground font-medium' : undefined}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.to}
                    {...(crumb.params ? { params: crumb.params } : {})}
                    className="hover:text-foreground rounded-sm underline-offset-4 hover:underline"
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
