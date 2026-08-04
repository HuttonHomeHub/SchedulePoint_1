import { AUDIT_FILTERS_ENABLED } from '@/config/env';
import { useSelfAuditEvents } from '@/features/audit/api/use-audit-events';
import { AuditEventList } from '@/features/audit/components/AuditEventList';
import { AuditFilterBar } from '@/features/audit/components/AuditFilterBar';
import {
  EMPTY_AUDIT_FILTER,
  isAuditFilterEmpty,
  parseAuditFilter,
  toAuditQuery,
} from '@/features/audit/model/audit-filter';
import { useUrlFilterState } from '@/hooks/use-url-filter-state';

/**
 * The caller's own audit events (`/me/activity`, ADR-0072).
 *
 * No org in the path and no permission check, because there is nothing to check: the endpoint
 * scopes by the session's own identity and accepts no user id, so the only history reachable is
 * the reader's. It is also the one place a Viewer or Contributor can see their own sign-in
 * history without asking an Org Admin for it.
 */
export function MyActivityScreen(): React.ReactElement {
  // Same bar, same URL-backed state as the organisation log — one component, so the two screens
  // cannot drift about what a category means. The surface differs, and that is a prop: only this
  // one may offer Sign-ins, because only this one can return them.
  const [filter, setFilter] = useUrlFilterState(EMPTY_AUDIT_FILTER, parseAuditFilter);
  const narrowed = AUDIT_FILTERS_ENABLED && !isAuditFilterEmpty(filter);
  const query = useSelfAuditEvents(
    AUDIT_FILTERS_ENABLED ? toAuditQuery(filter, 'self') : undefined,
  );

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">My activity</h1>
      {/*
        This screen is the only place sign-ins are visible — they carry no organisation, so the
        organisation log structurally cannot show them. Say so here, because a reader who went
        looking there first needs to know they are not missing.
      */}
      <p className="text-muted-foreground mt-1 text-sm">
        What you did, across every organisation you belong to — including your sign-ins, which
        appear here and nowhere else.
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        Scoped to you as the person who <em>acted</em>: something an Org Admin did to your account
        is on their organisation&rsquo;s audit log, not here. Edits inside a plan are{' '}
        <strong className="text-foreground font-medium">not recorded yet</strong>.
      </p>
      <div className="mt-6 flex flex-col gap-4">
        {AUDIT_FILTERS_ENABLED ? (
          <AuditFilterBar surface="self" value={filter} onChange={setFilter} />
        ) : null}
        <AuditEventList
          query={query}
          caption="My audit events"
          showActor={false}
          emptyMessage="Nothing here yet. Signing in and out is recorded, along with joining or leaving an organisation."
          emptyFilteredMessage={
            narrowed
              ? 'No events match this filter. Clear it to see everything recorded about you.'
              : undefined
          }
        />
      </div>
    </div>
  );
}
