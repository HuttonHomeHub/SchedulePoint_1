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
        <Select
          aria-label={`Role for ${member.user.name}`}
          value={member.role}
          disabled={changeRole.isPending}
          onChange={(event) => {
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
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No members yet.
          </div>
        }
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
