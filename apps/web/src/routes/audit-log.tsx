import { useParams } from '@tanstack/react-router';

import { Spinner } from '@/components/ui/spinner';
import { useOrganizationAuditEvents } from '@/features/audit/api/use-audit-events';
import { AuditEventList } from '@/features/audit/components/AuditEventList';
import { useOrganizations } from '@/features/organizations';
import { useOrgRole } from '@/hooks/use-org-role';
import { canReadAuditLog } from '@/lib/rbac';

/**
 * The organisation's audit log (`/orgs/$orgSlug/audit-log`, ADR-0072) — Org Admin only.
 *
 * A caller without `audit:read` is told so rather than shown an empty table: the endpoint answers
 * 403, and rendering that as "no events" would be the log's own failure mode — absence that a
 * reader cannot distinguish from nothing having happened.
 */
export function AuditLogScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  // The role comes from the organisations query, which starts undefined. Asking `canReadAuditLog`
  // before it resolves answers "no", and rendering the refusal on that would state something FALSE
  // for as long as the request takes — the ADR-0060 defect exactly, where an invented pen message
  // was wrong whenever nobody held the pen. So the loading state is a third branch, not a default.
  const { isPending } = useOrganizations();
  const role = useOrgRole(orgSlug);
  const allowed = canReadAuditLog(role);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Permission changes, deletions and sign-ins for this organisation, newest first.
      </p>

      {isPending ? (
        <div className="mt-6 p-6">
          <Spinner label="Checking your access…" />
        </div>
      ) : allowed ? (
        <div className="mt-6">
          <AuditLogTable orgSlug={orgSlug} />
        </div>
      ) : (
        <p
          role="status"
          className="border-border text-muted-foreground mt-6 rounded-lg border border-dashed p-8 text-center text-sm"
        >
          Only an Org Admin can read this organisation&rsquo;s audit log. Your own activity is on{' '}
          <strong className="text-foreground font-medium">My activity</strong>.
        </p>
      )}
    </div>
  );
}

/**
 * Split out so the query is never *mounted* for a caller who cannot read it. Rendering the hook
 * and discarding its result would still fire a request that can only 403 — a shaded control that
 * quietly calls the API anyway is the lit-but-inert defect inverted.
 */
function AuditLogTable({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const query = useOrganizationAuditEvents(orgSlug);
  return (
    <AuditEventList
      query={query}
      caption="Organisation audit log"
      showActor
      emptyMessage="No events recorded yet."
    />
  );
}
