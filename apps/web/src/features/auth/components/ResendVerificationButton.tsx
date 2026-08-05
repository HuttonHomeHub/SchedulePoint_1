import { useState } from 'react';

import { useSendVerificationEmail } from '../api/use-session';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form';
import { useOutcomeFocus } from '@/hooks/use-outcome-focus';

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
 * **One announcement mechanism, not two** (ADR-0074 M5-T1). The outcome is carried by the rendered
 * `role="status"` / `role="alert"` element and nothing else. Pairing that with a `useAnnounce()`
 * call — which this did — has assistive tech read the same sentence twice, because both are live
 * regions; and the visible element is the better of the two, since sighted users get the same
 * persistent text rather than a message that has already gone. It also takes focus, because the
 * button the reader just pressed is unmounted by the same render.
 */
export function ResendVerificationButton({
  email,
}: {
  /** The address to send to. Omit to render a field asking for one. */
  email?: string | undefined;
}): React.ReactElement {
  const [typed, setTyped] = useState('');
  const send = useSendVerificationEmail();
  const outcomeRef = useOutcomeFocus<HTMLParagraphElement>(send.isSuccess);
  const address = email ?? typed;
  const needsAddress = email === undefined;

  // `aria-disabled` rather than `disabled`: a native disabled control blurs to `<body>` mid-action
  // and flips back when the request settles, so a keyboard user loses their place twice per send.
  // The pointer/submit guard below is what actually prevents the double-send (TECH_DEBT #17a).
  const blocked = send.isPending || address.trim() === '';

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (blocked) return;
    // One outcome for every case. The endpoint deliberately answers the same for an unknown
    // address, an already-verified one and a real pending one; a UI that distinguished them would
    // hand back the oracle the server just closed. Both outcomes are announced by the elements
    // below, so there is nothing to pass here.
    send.mutate(address);
  }

  if (send.isSuccess) {
    return (
      <p role="status" tabIndex={-1} ref={outcomeRef} className="text-muted-foreground text-sm">
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
