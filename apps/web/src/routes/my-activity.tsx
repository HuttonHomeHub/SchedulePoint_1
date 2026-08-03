import { useSelfAuditEvents } from '@/features/audit/api/use-audit-events';
import { AuditEventList } from '@/features/audit/components/AuditEventList';

/**
 * The caller's own audit events (`/me/activity`, ADR-0072).
 *
 * No org in the path and no permission check, because there is nothing to check: the endpoint
 * scopes by the session's own identity and accepts no user id, so the only history reachable is
 * the reader's. It is also the one place a Viewer or Contributor can see their own sign-in
 * history without asking an Org Admin for it.
 */
export function MyActivityScreen(): React.ReactElement {
  const query = useSelfAuditEvents();

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">My activity</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Everything recorded about your account, across every organisation you belong to.
      </p>
      <div className="mt-6">
        <AuditEventList
          query={query}
          caption="My audit events"
          showActor={false}
          emptyMessage="Nothing recorded yet."
        />
      </div>
    </div>
  );
}
