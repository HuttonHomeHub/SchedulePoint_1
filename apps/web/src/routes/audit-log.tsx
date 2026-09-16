import { useParams } from '@tanstack/react-router';

import { NoticeStrip } from '@/components/ui/notice-strip';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { CoverageDisclosure } from '@/features/audit/components/CoverageDisclosure';
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
/**
 * Ties the relocated coverage rule to the table it describes (`aria-describedby`).
 *
 * A module constant rather than `useId()` because the producer and the consumer are two separate
 * components in this file and the id has to survive the trip; there is exactly one audit log per
 * document, so a fixed id cannot collide with itself.
 */
const COVERAGE_ID = 'audit-log-coverage';

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
    <PageContainer>
      <PageHeader
        title="Audit log"
        description="Newest first: what has been removed from this organisation, and what has changed the rules other people’s work is judged by."
      />
      {/*
        **The coverage rule is RELOCATED, never cut** — and it is the one fact on this screen a
        reader cannot infer. It went wrong twice in opposite directions before reaching this
        wording: first it promised "permission changes, deletions and sign-ins for this
        organisation", and a sign-in can NEVER appear here, because authentication happens before an
        organisation is known and this read filters on exactly that column — a planner read that
        line, went looking, found silence, and reasonably concluded the feature was broken. Then it
        listed what it DID cover, and by the time the coverage rung landed it named family D and
        none of E, F or G.

        An itemised list is a promise that goes stale every time the vocabulary grows, which on this
        feature is every milestone. The two tests that decide coverage (ADR-0073) fit in a sentence;
        the list never will.

        **Behind a disclosure because it was permanently occupying the top of the screen for every
        reader including the ones who already know**, and because `AuditEventList`'s own empty state
        says the same thing compressed — so the page-level copy was a restatement costing ~128px of
        a list a reader came here to read. It stays `aria-describedby`-linked to the table, so it is
        not a fact you have to find; it is a fact you no longer have to scroll past.
      */}
      <CoverageDisclosure contentId={COVERAGE_ID}>
        <p>
          Everything that <strong className="text-foreground font-medium">removes</strong> something
          — deleted or restored clients, projects, plans and activities, dissolved summaries,
          removed links, deleted calendars and resources — and everything that{' '}
          <strong className="text-foreground font-medium">
            changes the rules other people’s work is judged by
          </strong>
          : who has access, scheduling settings, a shared calendar’s working time, baselines, what
          the shared libraries offer, and where an imported programme came from.
        </p>
        <p>
          Editing an activity’s own fields — its name, dates, duration, lane or progress — is{' '}
          <strong className="text-foreground font-medium">deliberately not recorded</strong>: it
          changes nothing outside that activity, and the row already carries who last changed it.
          Your own sign-ins are on{' '}
          <strong className="text-foreground font-medium">My activity</strong>, not here.
        </p>
      </CoverageDisclosure>
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
    </PageContainer>
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
        describedById={COVERAGE_ID}
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
