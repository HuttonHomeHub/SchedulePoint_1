import type { OrgMemberSummary } from '@repo/types';
import { useState } from 'react';

import { useChangeMemberRole, useMembers, useRemoveMember } from '../api/use-members';
import { ROLE_LABELS, ROLE_OPTIONS } from '../schemas/invite-schemas';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

/** Roster with inline role changes and remove-with-confirm. */
export function MembersTable({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const members = useMembers(orgSlug);
  const changeRole = useChangeMemberRole(orgSlug);
  const removeMember = useRemoveMember(orgSlug);
  const [removing, setRemoving] = useState<OrgMemberSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (members.isPending) {
    return (
      <div className="p-6">
        <Spinner label="Loading members…" />
      </div>
    );
  }

  if (members.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        Couldn&rsquo;t load members. Please try again.
      </p>
    );
  }

  const confirmRemove = (): void => {
    if (!removing) return;
    const target = removing;
    removeMember.mutate(target.id, {
      onSuccess: () => {
        setRemoving(null);
        setError(null);
      },
      onError: (err) => {
        setRemoving(null);
        setError(err.message);
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Organisation members</caption>
          <thead>
            <tr className="border-border text-muted-foreground border-b text-left">
              <th scope="col" className="py-2 pr-4 font-medium">
                Name
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Email
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Role
              </th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.data.map((member) => (
              <tr key={member.id} className="border-border border-b">
                <td className="py-2 pr-4">{member.user.name}</td>
                <td className="text-muted-foreground py-2 pr-4">{member.user.email}</td>
                <td className="py-2 pr-4">
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
                </td>
                <td className="py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoving(member)}
                    aria-label={`Remove ${member.user.name}`}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove member"
        description={removing ? `Remove ${removing.user.name} from this organisation?` : ''}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={removeMember.isPending}
            aria-busy={removeMember.isPending}
            onClick={confirmRemove}
          >
            {removeMember.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
