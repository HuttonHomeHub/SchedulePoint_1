import type { OrgMemberSummary } from '@repo/types';
import { useState } from 'react';

import { useChangeMemberRole, useMembers, useRemoveMember } from '../api/use-members';
import { ROLE_LABELS, ROLE_OPTIONS } from '../schemas/invite-schemas';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';

/** Roster with inline role changes and remove-with-confirm. */
export function MembersTable({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const members = useMembers(orgSlug);
  const changeRole = useChangeMemberRole(orgSlug);
  const removeMember = useRemoveMember(orgSlug);
  const [removing, setRemoving] = useState<OrgMemberSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns: Column<OrgMemberSummary>[] = [
    { header: 'Name', cell: (member) => member.user.name },
    {
      header: 'Email',
      cell: (member) => <span className="text-muted-foreground">{member.user.email}</span>,
    },
    {
      header: 'Role',
      cell: (member) => (
        /* **`aria-disabled` + `aria-busy` + a guard, not the native attribute** — the answer to
           page-consistency CQ-3, given by **accessibility-reviewer** at the M8 gate (CLAUDE.md
           §19.13: a shared control's keyboard model is reviewed before release, not after).

           This is the ADR-0083 **button** clause, not its field clause, and the discriminator is
           which kind of unavailability this is: the field clause governs a control **gated** by a
           permission or a prerequisite, where the loss is readability. Here the control is
           blocking **itself during its own mutation**, where the loss is operability — and a
           native `disabled` leaves the tab order the instant the request starts and returns when
           it settles, so a keyboard user changing a colleague's role is thrown to `<body>` and
           back, twice, per change (`docs/TECH_DEBT.md` #17a). The eleventh site of the ten M5
           converted.

           `aria-busy` rides alongside rather than `aria-disabled` alone, which is the reviewer's
           refinement and answers ADR-0083's own "false announcement" objection: a reader hears
           that the control is working rather than a bare, briefly untrue "disabled" on something
           a pointer could still reach.

           **The guard needs no manual revert** because the select is **controlled**: ignoring the
           change re-renders it at `member.role`, which is the stored value. */
        <Select
          aria-label={`Role for ${member.user.name}`}
          value={member.role}
          aria-disabled={changeRole.isPending}
          aria-busy={changeRole.isPending}
          className="aria-disabled:opacity-60"
          onChange={(event) => {
            if (changeRole.isPending) return;
            setError(null);
            changeRole.mutate(
              {
                memberId: member.id,
                role: event.target.value as OrgMemberSummary['role'],
                version: member.version,
              },
              { onError: (err) => setError(err.message) },
            );
          }}
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      ),
    },
    {
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right',
      cell: (member) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRemoving(member)}
          aria-label={`Remove ${member.user.name}`}
        >
          Remove
        </Button>
      ),
    },
  ];

  const confirmRemove = (): void => {
    if (!removing) return;
    removeMember.mutate(removing.id, {
      onSuccess: () => {
        setRemoving(null);
        setError(null);
      },
      onError: (err) => setError(err.message),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      ) : null}

      <DataTable
        caption="Organisation members"
        columns={columns}
        query={members}
        getRowKey={(member) => member.id}
        loadingLabel="Loading members…"
        errorLabel="Couldn’t load members. Please try again."
        empty={<>No members yet.</>}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title="Remove member"
        description={removing ? `Remove ${removing.user.name} from this organisation?` : ''}
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={removeMember.isPending}
      />
    </div>
  );
}
