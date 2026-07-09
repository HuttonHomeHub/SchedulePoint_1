import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useCreateInvitation } from '../api/use-invitations';
import {
  ROLE_LABELS,
  ROLE_OPTIONS,
  inviteMemberSchema,
  type InviteMemberValues,
} from '../schemas/invite-schemas';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Dialog to invite a member by email + role. Shows the accept link on success. */
export function InviteMemberDialog({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const create = useCreateInvitation(orgSlug);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteMemberValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { role: 'VIEWER' },
  });

  const close = (): void => {
    setOpen(false);
    setAcceptUrl(null);
    create.reset();
    reset();
  };

  const onSubmit = handleSubmit((values) => {
    create.mutate(values, { onSuccess: (invitation) => setAcceptUrl(invitation.acceptUrl) });
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite member</Button>
      <Dialog
        open={open}
        onClose={close}
        title="Invite a member"
        description="They'll get a link to join this organisation."
      >
        {acceptUrl ? (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Invitation created. Share this link so they can join:
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                aria-label="Invitation link"
                value={acceptUrl}
                className="border-input bg-muted h-10 w-full rounded-md border px-3 text-sm"
              />
              <Button
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(acceptUrl)}
              >
                Copy
              </Button>
            </div>
            <Button onClick={close}>Done</Button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            className="flex flex-col gap-4"
          >
            <FormErrorSummary errors={errors} />
            {create.isError ? (
              <p role="alert" className="text-destructive text-sm">
                {create.error.message}
              </p>
            ) : null}
            <TextField
              label="Email"
              type="email"
              autoComplete="off"
              error={errors.email?.message}
              {...register('email')}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" {...register('role')}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
              {create.isPending ? 'Sending…' : 'Send invitation'}
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
