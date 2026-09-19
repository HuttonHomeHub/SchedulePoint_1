import type { InvitationSummary } from '@repo/types';
import { useRef, useState } from 'react';

import { useInvitations, useRevokeInvitation } from '../api/use-invitations';
import { ROLE_LABELS } from '../schemas/invite-schemas';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { SectionCard } from '@/components/ui/page';
import { formatTimestamp } from '@/lib/format-date';

/** Whether this invitation's lease has lapsed. Compared once per render against one instant. */
function hasExpired(invitation: InvitationSummary, now: number): boolean {
  return new Date(invitation.expiresAt).getTime() <= now;
}

/**
 * The organisation's outstanding invitations — the screen the landing has always sent people to
 * and which, until now, had nothing to show them.
 *
 * **This is the defect the product owner reported.** The landing said "1 invitation is still
 * pending" and linked here; `GET …/organizations/:slug/invitations` has shipped since ADR-0016 and
 * **nothing in `apps/web` had ever called it**, so Members listed members and stopped. A route with
 * no entry point (ADR-0081), with the halves the other way round from the usual instance.
 *
 * **Expired invitations are marked, not hidden.** They are still `PENDING` — nothing reaps them,
 * and ADR-0085 D1's reasoning is why nothing should start doing so on a landing page's account — so
 * they are listed by the endpoint and refused by `accept()`. Hiding them would put the reader back
 * where they started: a count they cannot reconcile with a list. Marking them is what turns
 * "chase this person" into "send it again", which is the whole point of splitting the count.
 *
 * **The section is omitted entirely for a reader who is not an Org Admin** (ADR-0082's first omit
 * clause), and `Revoke` inside it is unconditional — `invitation:read` and `invitation:revoke` are
 * one bundle held by one role, so a shaded `Revoke` is a state no user can reach. That coupling is
 * pinned by `apps/api/src/common/auth/invitation-permissions.structural.spec.ts` rather than
 * assumed here.
 */
export function InvitationsSection({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const invitations = useInvitations(orgSlug);
  const revoke = useRevokeInvitation(orgSlug);
  const [revoking, setRevoking] = useState<InvitationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  /**
   * ONE instant for the whole render — comparing each row against its own `Date.now()` would let a
   * list straddle the boundary and show two rows with the same expiry in different states.
   *
   * **It comes from `dataUpdatedAt`, not from the wall clock.** `Date.now()` during render is an
   * impure call, which the React Compiler lint rejects outright, and the rejection is pointing at
   * something real: a value read during render makes the component's output depend on when React
   * happened to run it. `dataUpdatedAt` is the moment this payload actually arrived, which is the
   * instant these `expiresAt` values are honestly relative to — the same choice, for the same
   * reason, that `OverviewScreen` makes for its relative timestamps.
   *
   * It is `0` until the first successful fetch, which is exactly the window in which there are no
   * rows to compare against it — so the epoch this yields is never rendered against anything.
   */
  const now = invitations.dataUpdatedAt;

  /**
   * **Focus is sent back into the section, not left on the removed row.**
   *
   * A revoked invitation's row unmounts with the `Revoke` button that was focused inside it, and
   * the browser then drops focus to `<body>` — WCAG 2.2 §2.4.3, and the recorded class in
   * ADR-0096, ADR-0099 M10 and ADR-0143. The section heading's wrapper is the destination because
   * it is the nearest thing that survives the row and still says where the reader is.
   */
  const returnFocus = (): void => {
    const heading = sectionRef.current?.querySelector('h2');
    if (heading instanceof HTMLElement) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  };

  const columns: Column<InvitationSummary>[] = [
    { header: 'Email', cell: (invitation) => invitation.email },
    { header: 'Role', cell: (invitation) => ROLE_LABELS[invitation.role] },
    {
      header: 'Sent',
      cell: (invitation) => (
        <span className="text-muted-foreground">{formatTimestamp(invitation.createdAt)}</span>
      ),
    },
    {
      header: 'Status',
      cell: (invitation) =>
        hasExpired(invitation, now) ? (
          // The word carries the fact; the tint only reinforces it. Colour is never the sole
          // signal (WCAG 2.2 §1.4.1), which is also `Badge`'s own documented rule.
          <Badge variant="warning">Expired</Badge>
        ) : (
          <span className="text-muted-foreground">
            Expires {formatTimestamp(invitation.expiresAt)}
          </span>
        ),
    },
    {
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right',
      cell: (invitation) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setError(null);
            setRevoking(invitation);
          }}
          aria-label={`Revoke the invitation to ${invitation.email}`}
        >
          Revoke
        </Button>
      ),
    },
  ];

  const confirmRevoke = (): void => {
    if (!revoking) return;
    revoke.mutate(revoking.id, {
      onSuccess: () => {
        setRevoking(null);
        setError(null);
        returnFocus();
      },
      onError: (err) => {
        // **A 409 is reported and refetched, never retried.** It means somebody else has already
        // answered this invitation, so a retry would fail for the same reason for ever; the list
        // is what is stale, and refetching it makes the screen agree with the server again.
        setRevoking(null);
        setError(err.message);
        void invitations.refetch();
        returnFocus();
      },
    });
  };

  return (
    <div ref={sectionRef}>
      <SectionCard
        title="Pending invitations"
        description="People invited to this organisation who have not joined yet."
        /* `useInvitations` pages through `apiFetchAllPages`, so this length IS the total rather
           than "rows loaded so far" — which is the precondition that lets a count be stated at
           all, and the reason the audit screens withhold theirs. Specified in
           `docs/specs/page-composition/feature-spec.md` §4.6 and never built; nothing recorded a
           decision either way. */
        count={invitations.data?.length}
      >
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          ) : null}

          <DataTable
            /* **The table's name is not the section's name.** `DataTable` renders a focusable,
               scrollable region labelled by its caption, so a caption identical to the enclosing
               `SectionCard`'s title puts TWO regions with one accessible name on the screen — and
               an AT user hearing "Pending invitations" twice cannot tell which one they are in.
               The roster beside this one already does it right: section "Roster", table
               "Organisation members". Found by #344's widened wrap sweep, whose fixture seeds an
               invitation for the first time — with no rows there is no scroll region and the clash
               could not occur. */
            caption="Invited people"
            columns={columns}
            query={invitations}
            getRowKey={(invitation) => invitation.id}
            loadingLabel="Loading invitations…"
            errorLabel="Couldn’t load invitations. Please try again."
            empty={<>No invitations are outstanding.</>}
          />
        </div>
      </SectionCard>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => {
          setRevoking(null);
          returnFocus();
        }}
        onConfirm={confirmRevoke}
        title="Revoke invitation"
        description={
          revoking
            ? `Revoke the invitation to ${revoking.email}? The link they were sent will stop working.`
            : ''
        }
        confirmLabel="Revoke"
        pendingLabel="Revoking…"
        pending={revoke.isPending}
      />
    </div>
  );
}
