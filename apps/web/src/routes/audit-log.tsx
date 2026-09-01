import { useParams } from '@tanstack/react-router';

import { NoticeStrip } from '@/components/ui/notice-strip';
import { Spinner } from '@/components/ui/spinner';
import { AUDIT_FILTERS_ENABLED } from '@/config/env';
import { useOrganizationAuditEvents } from '@/features/audit/api/use-audit-events';
import { AuditEventList } from '@/features/audit/components/AuditEventList';
import { AuditFilterBar } from '@/features/audit/components/AuditFilterBar';
import {
  EMPTY_AUDIT_FILTER,
  isAuditFilterEmpty,
  parseAuditFilter,
  toAuditQuery,
} from '@/features/audit/model/audit-filter';
import { useOrganizations } from '@/features/organizations';
import { useOrgRole } from '@/hooks/use-org-role';
import { useUrlFilterState } from '@/hooks/use-url-filter-state';
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
      {/*
        Say what is recorded, not what an audit log sounds like it records — and say it as a RULE
        rather than an inventory. This sentence has now been wrong twice, in opposite directions.
        First it promised "permission changes, deletions and sign-ins for this organisation", and a
        sign-in can NEVER appear here: authentication happens before an organisation is known, so
        those rows carry no `organizationId` and this read filters on exactly that column. A planner
        read that line, went looking, found silence, and reasonably concluded the feature was
        broken. Then it listed what it DID cover — and by the time the coverage rung landed it named
        family D and none of E, F or G, so a reader asking "where did the December baseline go?" had
        no reason to believe this log knew.

        An itemised list is a promise that goes stale every time the vocabulary grows, which on this
        feature is every milestone. The two tests that decide coverage (ADR-0073) fit in a sentence;
        the list never will. See the empty state below, which had the first problem from the other
        side.
      */}
      <p className="text-muted-foreground mt-1 text-sm">
        Newest first: everything that{' '}
        <strong className="text-foreground font-medium">removes</strong> something — deleted or
        restored clients, projects, plans and activities, dissolved summaries, removed links,
        deleted calendars and resources — and everything that{' '}
        <strong className="text-foreground font-medium">
          changes the rules other people&rsquo;s work is judged by
        </strong>
        : who has access, scheduling settings, a shared calendar&rsquo;s working time, baselines,
        what the shared libraries offer, and where an imported programme came from.
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        Editing an activity&rsquo;s own fields — its name, dates, duration, lane or progress — is{' '}
        <strong className="text-foreground font-medium">deliberately not recorded</strong>: it
        changes nothing outside that activity, and the row already carries who last changed it. Your
        own sign-ins are on <strong className="text-foreground font-medium">My activity</strong>,
        not here.
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
        /* **A refusal, not an absence** (`docs/specs/empty-state-consolidation/` §1.5.2, M2).
           The dashed centred box said "there is nothing here" about an organisation whose log is
           full; what is true is that this reader may not see it. `role="status"` is preserved —
           dropping it is a silent WCAG 4.1.3 regression no unit test would catch — and
           `messageFit="grow"` is load-bearing: the default truncates, and the clipped half is the
           sentence naming where the reader CAN go. */
        <NoticeStrip
          className="mt-6"
          tone="info"
          emphasis="solid"
          density="comfortable"
          messageFit="grow"
          role="status"
          message={
            <>
              Only an Org Admin can read this organisation&rsquo;s audit log. Your own activity is
              on <strong className="text-foreground font-medium">My activity</strong>.
            </>
          }
        />
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
  // The filter lives in the URL so a narrowed view survives a reload and can be pasted to a
  // colleague — the rule the library screens already follow. Flag-off the hook is still called (a
  // hook cannot be conditional) but nothing writes to it and nothing is sent, so the request is
  // byte-for-byte the one this screen made before the filter existed.
  const [filter, setFilter] = useUrlFilterState(EMPTY_AUDIT_FILTER, parseAuditFilter);
  const narrowed = AUDIT_FILTERS_ENABLED && !isAuditFilterEmpty(filter);
  const query = useOrganizationAuditEvents(
    orgSlug,
    AUDIT_FILTERS_ENABLED ? toAuditQuery(filter, 'organization') : undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      {AUDIT_FILTERS_ENABLED ? (
        <AuditFilterBar surface="organization" value={filter} onChange={setFilter} />
      ) : null}
      <AuditEventList
        query={query}
        caption="Organisation audit log"
        showActor
        // "No events recorded yet" reads as "nothing has happened", which is the one thing an audit
        // log must never say when it means "this is outside what I record". Name the boundary.
        emptyMessage="Nothing here yet. Editing an activity's own fields does not appear in this log — anything that removes something, or that changes the rules other people's work is judged by, does."
        // A narrowed view that finds nothing is a different fact from a log with nothing in it, and
        // saying the second when the first is true is the defect this screen already shipped once.
        emptyFilteredMessage={
          narrowed
            ? 'No events match this filter. Clear it to see everything this log records.'
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
  );
}
