import { AUDIT_FILTERS_ENABLED, AUDIT_SELF_SECURITY_ENABLED } from '@/config/env';
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

/** Ties the "what a Not signed in row means" note to the table it qualifies (`aria-describedby`). */
const ATTEMPTS_NOTE_ID = 'my-activity-attempts-note';

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
    AUDIT_SELF_SECURITY_ENABLED,
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
      {/*
        What a "Not signed in" row means, and — as importantly — what it does NOT mean. This screen
        is telling somebody they may be under attack, and the two things a reader will jump to are
        both wrong: that the attempt succeeded, and that it identifies who made it. Saying so is not
        reassurance padding; an audit row that overstates what it proves is the same defect class as
        one that understates it.
      */}
      {AUDIT_SELF_SECURITY_ENABLED ? (
        <p className="text-muted-foreground mt-1 text-sm" id={ATTEMPTS_NOTE_ID}>
          Failed sign-ins against your email address appear here with{' '}
          <strong className="text-foreground font-medium">Not signed in</strong> in the{' '}
          <strong className="text-foreground font-medium">By</strong> column. Most often that is a
          mistyped or out-of-date password — very likely your own. A row does not mean anyone got
          in, and it does not identify who tried.{' '}
          <strong className="text-foreground font-medium">Several in a row</strong> is the pattern
          worth looking at.
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-4">
        {AUDIT_FILTERS_ENABLED ? (
          <AuditFilterBar surface="self" value={filter} onChange={setFilter} />
        ) : null}
        <AuditEventList
          query={query}
          caption="My audit events"
          // Normally every row on this screen is the reader, so an actor column would repeat their
          // own email fifty times. Once attempts are included that stops being true: a row with no
          // actor sits beside rows that are theirs, and without the column it reads as something
          // THEY did. The column earns its place exactly when the feed stops being homogeneous.
          showActor={AUDIT_SELF_SECURITY_ENABLED}
          // Associated with the table rather than merely sitting above it: the table is a focusable
          // `role="region"`, so a reader navigating by landmark lands inside it having skipped
          // whatever precedes it — and what precedes it here is the sentence saying a row does not
          // mean anyone got in.
          describedById={AUDIT_SELF_SECURITY_ENABLED ? ATTEMPTS_NOTE_ID : undefined}
          emptyMessage="Nothing here yet. Signing in and out is recorded, along with joining or leaving an organisation."
          emptyFilteredMessage={
            narrowed
              ? 'No events match this filter. Clear it to see everything recorded about you.'
              : undefined
          }
          onClearFilter={
            narrowed
              ? () => {
                  setFilter({ categories: '', outcome: '', from: '', to: '' });
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
