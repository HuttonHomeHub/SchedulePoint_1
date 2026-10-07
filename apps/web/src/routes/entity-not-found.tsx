import { Link, useLocation } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Button } from '@/components/ui/button';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { textLinkVariants } from '@/components/ui/text-link';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { readErrorStatus } from '@/lib/api/retryable-status';

type Entity = 'Plan' | 'Project' | 'Client';

interface EntityLoadFailureProps {
  entity: Entity;
  orgSlug: string;
  /** The error the entity's query settled with; its HTTP status decides which picture is drawn. */
  error: unknown;
  /** Re-asks the entity's query; offered only for a failure that says nothing about the entity. */
  onRetry: () => void;
}

/**
 * What a plan, project or client screen shows when its one query failed
 * (the entity-shaped sibling of the in-shell not-found page, `docs/specs/in-shell-not-found/`).
 *
 * **The status splits the failure in two, because the two are different facts.** The API answers a
 * missing, deleted or foreign entity with 404 and nothing else (every read is scoped by
 * organisation and soft-delete in the service; 403 is only ever a role check on writes), so a 404 is
 * a destination — the same calm "not found" page `OrgNotFoundScreen` draws for a mistyped address,
 * with the heading focused and no alert. Anything else (a dropped connection, a 5xx) says nothing
 * about the entity, so it stays an alert in destructive ink, as `DataTable` and the pre-#463 branch
 * had it: "doesn't exist" would be a false statement to a reader whose network blinked.
 *
 * It renders no `<main>` (the shell supplies it) and never echoes the id.
 */
export function EntityLoadFailure({
  entity,
  orgSlug,
  error,
  onRetry,
}: EntityLoadFailureProps): React.ReactElement {
  return readErrorStatus(error) === 404 ? (
    <EntityNotFound entity={entity} orgSlug={orgSlug} />
  ) : (
    <EntityLoadError entity={entity} orgSlug={orgSlug} onRetry={onRetry} />
  );
}

function OverviewLink({ orgSlug }: { orgSlug: string }): React.ReactElement {
  return (
    <p className="mt-4">
      <Link to="/orgs/$orgSlug" params={{ orgSlug }} className={textLinkVariants({ size: 'sm' })}>
        Go to the organisation overview
      </Link>
    </p>
  );
}

function EntityNotFound({ entity, orgSlug }: Pick<EntityLoadFailureProps, 'entity' | 'orgSlug'>) {
  const title = `${entity} not found`;
  const pathname = useLocation({ select: (location) => location.pathname });
  useDocumentTitle(title);

  // Focus follows the pathname so opening another missing entity from the Explorer re-uses this
  // match without leaving focus on a control in a page that has changed under the reader.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [pathname]);

  return (
    <PageContainer width="narrow">
      <Breadcrumbs
        items={[
          { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
          { label: title },
        ]}
      />
      <PageHeader
        className="mt-2"
        title={title}
        description={`This ${entity.toLowerCase()} doesn’t exist, was deleted, or you don’t have access to it.`}
        headingFocusRef={heading}
      />
      <OverviewLink orgSlug={orgSlug} />
    </PageContainer>
  );
}

function EntityLoadError({
  entity,
  orgSlug,
  onRetry,
}: Pick<EntityLoadFailureProps, 'entity' | 'orgSlug' | 'onRetry'>) {
  const title = `${entity} couldn’t load`;
  useDocumentTitle(title);

  return (
    <PageContainer width="narrow">
      <Breadcrumbs
        items={[
          { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
          { label: title },
        ]}
      />
      <PageHeader className="mt-2" title={title} />
      {/* **An error, not an empty state** (`docs/specs/empty-state-consolidation/` §1.5.2, M2):
          nothing here says the entity is gone, only that the answer did not arrive. */}
      <p role="alert" className="text-destructive-text mt-2 text-sm">
        We couldn’t load this {entity.toLowerCase()}. It may have been a temporary problem, so try
        again in a moment.
      </p>
      <p className="mt-4">
        <Button onClick={onRetry}>Try again</Button>
      </p>
      <OverviewLink orgSlug={orgSlug} />
    </PageContainer>
  );
}
