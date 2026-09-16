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
import { FormErrorSummary, SelectField, TextField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useClipboardCopy } from '@/hooks/use-clipboard-copy';

/** Dialog to invite a member by email + role. Shows the accept link on success. */
export function InviteMemberDialog({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const clipboard = useClipboardCopy({
    copiedMessage: 'Invitation link copied to the clipboard.',
    failedMessage: 'Couldn’t copy the link. Select and copy it manually.',
    revertAfterMs: 2000,
  });
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
    // **The clipboard state is part of what closing discards.** Without this, copy → close → invite
    // somebody else reopens the dialog with the button already reading "Copied", about a link it has
    // never touched (M6 performance review, found while tracing the memo). Every other piece of
    // per-invitation state is cleared here; this one was missed.
    clipboard.reset();
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
              <Input readOnly aria-label="Invitation link" value={acceptUrl} className="bg-muted" />
              {/* **The fifth clipboard site, and the one the plan's count of four missed.** It
                  announced nothing in either direction and showed nothing either, so a reader had
                  no way to tell a successful copy from a refused one — on the link that is the
                  whole point of the dialog. The optional chain suppressed the synchronous throw
                  and left the failure completely silent. */}
              <Button variant="outline" onClick={() => clipboard.copy(acceptUrl)}>
                {clipboard.state === 'copied' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            {/* A refusal says so on screen, not only in the live region (M6 UX review). */}
            {clipboard.state === 'failed' && (
              <p className="text-destructive-text text-sm">
                Couldn&rsquo;t copy the link. Select it above and copy it manually.
              </p>
            )}
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
              <p role="alert" className="text-destructive-text text-sm">
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
            <SelectField label="Role" id="invite-role" {...register('role')}>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </SelectField>
            <Button
              type="submit"
              className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
              aria-disabled={create.isPending}
              aria-busy={create.isPending}
              onClick={(event) => {
                if (create.isPending) event.preventDefault();
              }}
            >
              {create.isPending ? 'Sending…' : 'Send invitation'}
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
