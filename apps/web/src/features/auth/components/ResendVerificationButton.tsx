import { useState } from 'react';

import { useSendVerificationEmail } from '../api/use-session';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form';

/**
 * "Send me another verification email" — the one affordance the whole verification story turns on
 * (ADR-0074).
 *
 * Shared by three surfaces (the `/verify-email` screen, the sign-in `EMAIL_NOT_VERIFIED` state, and
 * the invitation-accept refusal) because they are the same action with the same states, and three
 * copies would drift on exactly the part that matters: the copy after a successful send, which must
 * not reveal whether the address exists.
 *
 * **When the address is not known, it asks.** A signed-out user arriving at `/verify-email` with no
 * `?email=` — a bookmark, a retyped URL — has no other way through, and a button that silently does
 * nothing is worse than a field.
 *
 * Announces through the shared {@link useAnnounce} region, which `AuthShell` mounts for public
 * screens and `AppShell` mounts for the authed ones — so this component works identically on both
 * without knowing where it is.
 */
export function ResendVerificationButton({
  email,
}: {
  /** The address to send to. Omit to render a field asking for one. */
  email?: string | undefined;
}): React.ReactElement {
  const [typed, setTyped] = useState('');
  const send = useSendVerificationEmail();
  const announce = useAnnounce();
  const address = email ?? typed;
  const needsAddress = email === undefined;

  // `aria-disabled` rather than `disabled`: a native disabled control blurs to `<body>` mid-action
  // and flips back when the request settles, so a keyboard user loses their place twice per send.
  // The pointer/submit guard below is what actually prevents the double-send (TECH_DEBT #17a).
  const blocked = send.isPending || address.trim() === '';

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (blocked) return;
    send.mutate(address, {
      // One outcome for every case. The endpoint deliberately answers the same for an unknown
      // address, an already-verified one and a real pending one; a UI that distinguished them
      // would hand back the oracle the server just closed.
      onSuccess: () => {
        announce('If that address needs verifying, an email is on its way.');
      },
      onError: (error) => {
        announce(error.message);
      },
    });
  }

  if (send.isSuccess) {
    return (
      <p className="text-muted-foreground text-sm">
        If that address needs verifying, an email is on its way. It can take a minute to arrive —
        check your spam folder before trying again.
      </p>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {send.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {send.error.message}
        </p>
      ) : null}
      {needsAddress ? (
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
        />
      ) : null}
      <Button type="submit" aria-disabled={blocked} aria-busy={send.isPending}>
        {send.isPending ? 'Sending…' : 'Send another verification email'}
      </Button>
    </form>
  );
}
