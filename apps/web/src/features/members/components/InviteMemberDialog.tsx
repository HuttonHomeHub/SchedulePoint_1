import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateInvitation } from '../api/use-invitations';
import {
  ROLE_LABELS,
  ROLE_OPTIONS,
  ROLE_SUMMARIES,
  inviteMemberSchema,
  type InviteMemberValues,
} from '../schemas/invite-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, SelectField, TextField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useClipboardCopy } from '@/hooks/use-clipboard-copy';

// "Sent" is true in both senses: the invitation is emailed to the address (published after commit
// by `InvitationsService.create` through the mail port) AND the link is returned once for the
// inviter to copy. Delivery is best-effort (ADR-0075), which is why the sentence goes on to tell
// the inviter to copy the link now rather than relying on the email arriving.
const INVITATION_SENT = 'Invitation sent. Copy the link now: it is shown only once.';

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
  const announce = useAnnounce();
  const linkRef = useRef<HTMLInputElement>(null);
  const onceId = useId();
  const roleHintId = useId();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<InviteMemberValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { role: 'VIEWER' },
  });

  // `useWatch`, not `watch()`: the memoization-safe read (see `CalendarFormDialog`).
  const chosenRole = useWatch({ control, name: 'role' });

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

  // **Focus follows the swap.** Sending the form unmounts the control that held focus and mounts the
  // link block in its place, so a keyboard user was left on nothing and a screen-reader user heard
  // nothing. The link field is where the dialog now wants them: it is the one thing on the screen
  // that cannot be recovered later.
  useEffect(() => {
    if (acceptUrl) linkRef.current?.focus();
  }, [acceptUrl]);

  const onSubmit = handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: (invitation) => {
        setAcceptUrl(invitation.acceptUrl);
        announce(INVITATION_SENT);
      },
    });
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
            <p id={onceId} className="text-muted-foreground text-sm">
              {INVITATION_SENT} Share it so they can join.
            </p>
            <div className="flex items-center gap-2">
              <Input
                ref={linkRef}
                readOnly
                aria-label="Invitation link"
                aria-describedby={onceId}
                value={acceptUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="bg-muted"
              />
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
            {/* The sentence for the role currently chosen, so the choice is explained where it is
                made (the roles panel behind the dialog is not reachable from here). It is a
                paragraph of our own rather than the field's `hint`, to reserve two lines: the four
                sentences wrap to one or two, and a hint that changed height would move the Send
                button under the pointer each time the role changed. */}
            <div className="flex flex-col gap-1.5">
              <SelectField
                label="Role"
                id="invite-role"
                aria-describedby={roleHintId}
                {...register('role')}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </SelectField>
              <p id={roleHintId} className="text-muted-foreground min-h-10 text-sm">
                {ROLE_SUMMARIES[chosenRole]}
              </p>
            </div>
            <Button
              type="submit"
              className="aria-disabled:pointer-events-none"
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
