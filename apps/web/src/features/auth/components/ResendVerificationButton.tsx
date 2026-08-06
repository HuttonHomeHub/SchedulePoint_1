import { useRef, useState } from 'react';

import { authErrorMessage, useSendVerificationEmail } from '../api/use-session';
import { emailField } from '../schemas/auth-schemas';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form';
import { ServerError } from '@/components/ui/server-error';
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
 * persistent text rather than a message that has already gone. It still takes focus, because the
 * outcome is the new information on the screen.
 *
 * **The confirmation sits ABOVE the form; it does not replace it** (ADR-0077 M1-T1). This used to
 * return the `<p role="status">` alone, unmounting the button — and `send.isSuccess` never clears,
 * so only a page reload got it back. The copy told the reader to "check your spam folder before
 * trying again" and then removed the thing to try again with, on three separate surfaces. The
 * second send is now possible, and if it lands inside the 3-per-60s window the 429 state
 * (ADR-0077 M1-T4) is the honest answer rather than a hidden control.
 */
export function ResendVerificationButton({
  email,
}: {
  /** The address to send to. Omit to render a field asking for one. */
  email?: string | undefined;
}): React.ReactElement {
  const [typed, setTyped] = useState('');
  const [formatError, setFormatError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const send = useSendVerificationEmail();
  const outcomeRef = useOutcomeFocus<HTMLDivElement>(send.isSuccess);
  const address = email ?? typed;
  const needsAddress = email === undefined;

  // `aria-disabled` rather than `disabled`: a native disabled control blurs to `<body>` mid-action
  // and flips back when the request settles, so a keyboard user loses their place twice per send.
  // The pointer/submit guard below is what actually prevents the double-send (TECH_DEBT #17a).
  const blocked = send.isPending || address.trim() === '';

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (blocked) return;
    // The format check its three siblings have had all along (ADR-0077 §9). Without it a typo here
    // bought a full round trip to an endpoint that answers identically for every address, so the
    // reader learned nothing and waited to learn it. Client-side only, so it is not an oracle: it
    // reports on the shape of what was typed, never on whether an account exists.
    if (needsAddress && !emailField.safeParse(address).success) {
      setFormatError('Enter a valid email address');
      fieldRef.current?.focus();
      return;
    }
    setFormatError(null);
    // One outcome for every case. The endpoint deliberately answers the same for an unknown
    // address, an already-verified one and a real pending one; a UI that distinguished them would
    // hand back the oracle the server just closed. Both outcomes are announced by the elements
    // below, so there is nothing to pass here.
    send.mutate(address);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {send.isSuccess ? (
        <Alert tone="info" tabIndex={-1} ref={outcomeRef}>
          If that address needs verifying, an email is on its way. It can take a minute to arrive —
          check your spam folder before trying again.
        </Alert>
      ) : null}
      <ServerError message={send.isError ? authErrorMessage(send.error, 'email') : null} />
      {needsAddress ? (
        <TextField
          ref={fieldRef}
          label="Email"
          type="email"
          autoComplete="email"
          value={typed}
          error={formatError ?? undefined}
          onChange={(event) => {
            setTyped(event.target.value);
            setFormatError(null);
            // Editing the address makes the confirmation above stale — it is about the address that
            // was sent to, not the one now in the field. Clearing the mutation removes it rather
            // than leaving a sentence that has quietly stopped being true.
            if (send.isSuccess || send.isError) send.reset();
          }}
        />
      ) : null}
      {/* `whitespace-normal` overrides the primitive's `whitespace-nowrap`, which exists so a
          toolbar control never wraps mid-label. This is a full-width form submit, not a toolbar
          control, and its label is the longest on any public screen: **measured** at 320×568 it
          forced `documentElement.scrollWidth` to 334 against a 320px viewport — a WCAG 1.4.10
          reflow failure on the one screen a reader reaches when their verification email has not
          arrived (ADR-0077 M6-T1, the TECH_DEBT #98 defect class). Wrapping rather than shortening,
          because "another" is what tells a reader who is here for the second time that this is not
          the same link again. */}
      <Button
        type="submit"
        aria-disabled={blocked}
        aria-busy={send.isPending}
        className="whitespace-normal"
      >
        {send.isPending ? 'Sending…' : 'Send another verification email'}
      </Button>
    </form>
  );
}
