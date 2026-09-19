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
    {
      header: 'Email',
      /**
       * **`auto`, because an address is unbounded by the data model** — the one column here whose
       * content has no shape a width can be chosen for, so no width can promise it one line and
       * the honest thing is to write that down (ADR-0146 D3: `auto` means somebody decided, and
       * said why).
       *
       * **It is declared because FC-4 failed, and the failure is measured rather than argued**
       * (`docs/specs/table-wrap-coverage/m5/verdict.md`). That condition asked for zero wrapped
       * cells at 1280/1646/1920 *without* declaring a column `auto`, and M3 recorded it met. M5's
       * UX review then found that every reading behind it came from one easy shape —
       * `invited-<13 digits>@example.com` and `Planner` — so the fixture was widened to a real
       * address and `Org Admin`, the longest of the four `ROLE_LABELS`, and re-measured in one
       * sitting on the shoot tenant:
       *
       * - `Planner` alone → Role **65px**, Email **280px** at 1280 → no wrap.
       * - `Org Admin` present → Role **82px**, Email **263px** at 1280 → **both rows wrap**,
       *   including the 33-character address M3 judged clean.
       *
       * So the 17px a longer role label takes from a `fit` column is the whole difference, and
       * M3's result held only because every seeded invitation was a Planner. At 1646 and 1920 a
       * 58-character address still sits on one line (`m5/invitations-live-1646.png`); at 1280 the
       * card sits in the grid's narrow track and nothing realistic fits.
       *
       * **Moving this table to the wide span at 1280 was considered and not taken.** ADR-0146's
       * rule is spans by content demand, and 454 natural against a 416px track would justify it —
       * but it re-opens the whole Members composition for one column at one width, and it would
       * not remove the declaration, because a long enough address wraps in the wide track too.
       *
       * The break is at punctuation, never mid-token (`m5/invitations-live-1280.png`), which is
       * the distinction between a legitimate wrap and a broken value.
       */
      width: 'auto',
      /**
       * **`Sent` and `Status` are a secondary line under the address, not columns of their own**
       * (ADR-0146 D4, and the same shape `ClientsTable` applies to `Description`).
       *
       * They were columns, and in a 466/649/732px grid track all three of this table's text
       * columns wrapped at **every** width measured — the address broken mid-token, and
       * `Expires 26 Sept 2026, 16:57` over **five** lines inside 62px
       * (`docs/specs/table-wrap-coverage/m0/README.md`). Seven remedies were measured in one
       * sitting (`m2/README.md` §3) and this is the only one that fits: `naturalTotal` **750 →
       * 454**, zero wrapped cells at 1280, 1646 and 1920, **without declaring any column `auto`**
       * to excuse a wrap. It is also the only one that removes the second failure mode nobody had
       * predicted — the table's min-content exceeding its own card at 1280 — because that needs
       * min-content reduced and only a fold reduces it.
       *
       * **Both facts stay in the row; neither is dropped.** A fold that deletes a fact would
       * satisfy the wrap gate and fail the reader, so the journey asserts both are present.
       *
       * **The line spells its own labels**, because folding a column removes the header that
       * labelled it. Without `Sent`/`Expires` in the text this would be two bare timestamps.
       *
       * **Unlike `Description`, it is not conditional.** The "render only when present" rule that
       * governs an optional sub-line does not apply: every pending invitation has both a sent
       * instant and an expiry, so there is no absence to print an em dash for.
       *
       * **`flex-wrap` is the point at 1280**, where the two facts measure 294px inside a 264px
       * cell. The line then reflows and they stack, each whole — the break falls *between* facts
       * and never inside a date, which is the distinction between a legitimate wrap and a broken
       * value (`m2/members-1280-C2c.png` is what shows it; the probe reports no wrap, because the
       * cell's height comes from stacked siblings). At 1646 and 1920 they sit on one line.
       *
       * **This was briefly changed to `flex-col` and changed back, and the reason is worth
       * keeping.** Arming the journey's sweep reported this cell as a wrap while
       * `measure-column-fit.mjs` called it clean — two implementations of one rule disagreeing
       * (ADR-0065). Stacking was a plausible way to make both agree, and it did not work, which is
       * what sent the diagnosis one level down: the journey's clone set `font` from the
       * `getComputedStyle` **shorthand**, which Chromium serialises as the empty string whenever a
       * longhand it cannot express is non-initial — so the clone measured at 16px while the
       * product renders at 14px, and this cell's `text-xs` sub-line at 16px instead of 12px. The
       * defect was in the instrument, not in the layout, and the layout it would have changed is
       * the one the measurement chose. Fixing the instrument restored the original design.
       */
      cell: (invitation) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span>{invitation.email}</span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
            <span>Sent {formatTimestamp(invitation.createdAt)}</span>
            {hasExpired(invitation, now) ? (
              // The word carries the fact; the tint only reinforces it. Colour is never the sole
              // signal (WCAG 2.2 §1.4.1), which is also `Badge`'s own documented rule.
              <Badge variant="warning">Expired</Badge>
            ) : (
              <span>Expires {formatTimestamp(invitation.expiresAt)}</span>
            )}
          </span>
        </span>
      ),
    },
    {
      header: 'Role',
      /**
       * **`fit`, so the slack goes to the cell carrying the dense content** — `DataTable`'s own
       * rule: `fit` is for a value with a known bounded shape, which four role labels are. It was
       * undeclared and rendered 85px at 1646 and 97px at 1920 for content needing 65
       * (`m3/cf-1646.json`), i.e. 20–32px of dead space in front of `Actions` while the folded
       * address line beside it was the tightest thing in the table.
       */
      width: 'fit',
      cell: (invitation) => ROLE_LABELS[invitation.role],
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
