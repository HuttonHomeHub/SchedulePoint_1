import { Link, useLocation, useParams } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { NOT_FOUND_COPY } from '@/components/layout/not-found-copy';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { textLinkVariants } from '@/components/ui/text-link';
import { useDocumentTitle } from '@/hooks/use-document-title';

/**
 * "Page not found" **inside the shell** — a member's mistyped address under an organisation they
 * belong to (`/orgs/<my-org>/<anything no route claims>`, `docs/TECH_DEBT.md` #463).
 *
 * **It takes no props, and that is the design**: everything comes from the route
 * (`useParams({ from: '/_authed/orgs/$orgSlug/$' })`) and from `not-found-copy.ts`, so it cannot be worded
 * differently from the root `NotFoundScreen`. The router renders it only after the slug was found in
 * the caller's own organisations (`app/org-membership.ts`); for anyone else the root screen renders
 * outside the shell instead, which keeps a foreign and a nonexistent organisation indistinguishable.
 *
 * It renders no `<main>` (the shell supplies the one) and never echoes the unknown path.
 *
 * **It moves focus to its heading on mount and whenever the pathname changes**, which no other
 * in-shell route does: this page replaces content the reader did not ask for, as `NotFoundScreen` and
 * `RouteErrorScreen` do, and `/orgs/a/x` → `/orgs/a/y` re-uses the match, so an effect on mount alone
 * would leave focus on a link in a page that has changed under it. A cold load therefore skips past
 * the skip link once — acceptable for a destination. There is no live region (ADR-0132): arriving at
 * a page is not an event to announce.
 *
 * The explicit overview link is kept on purpose beside the Overview crumb: it is the primary recovery
 * action and a larger target than the crumb.
 */
export function OrgNotFoundScreen(): React.ReactElement {
  const { orgSlug } = useParams({ from: '/_authed/orgs/$orgSlug/$' });
  const pathname = useLocation({ select: (location) => location.pathname });
  useDocumentTitle(NOT_FOUND_COPY.title);

  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [pathname]);

  return (
    <PageContainer width="narrow">
      <Breadcrumbs
        items={[
          { label: 'Overview', to: '/orgs/$orgSlug', params: { orgSlug } },
          { label: NOT_FOUND_COPY.title },
        ]}
      />
      <PageHeader
        className="mt-2"
        title={NOT_FOUND_COPY.title}
        description={NOT_FOUND_COPY.description}
        headingFocusRef={heading}
      />
      <p className="mt-4">
        <Link to="/orgs/$orgSlug" params={{ orgSlug }} className={textLinkVariants({ size: 'sm' })}>
          Go to the organisation overview
        </Link>
      </p>
    </PageContainer>
  );
}
