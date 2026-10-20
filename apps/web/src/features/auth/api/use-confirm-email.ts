import { useMutation } from '@tanstack/react-query';

import { ApiFetchError, apiFetch } from '@/lib/api/client';

/**
 * Why a press on Confirm did not verify the address. Four, because the screen offers four
 * different ways forward: a fresh link (`expired`, `invalid`), waiting (`rate-limited`), or trying
 * the same press again (`unavailable`).
 */
export type ConfirmEmailFailure = 'expired' | 'invalid' | 'rate-limited' | 'unavailable';

/**
 * Classify a failed confirm by the API's machine-readable code, never by its message.
 *
 * `USER_NOT_FOUND` arrives as `invalid` already: the server folds it in so that a deleted account
 * is not narrated to whoever holds the link (`EmailVerificationService`).
 */
export function confirmEmailFailure(error: unknown): ConfirmEmailFailure {
  if (error instanceof ApiFetchError) {
    if (error.error.code === 'VERIFICATION_LINK_EXPIRED') return 'expired';
    if (error.error.code === 'VERIFICATION_LINK_INVALID') return 'invalid';
    if (error.status === 429) return 'rate-limited';
  }
  return 'unavailable';
}

/**
 * Confirm an address from the token in the emailed link (TECH_DEBT #88).
 *
 * The press is the only thing that verifies: opening the link, or a scanner fetching it, sends
 * nothing here. A `POST` rather than Better Auth's own client call because the library offers
 * verification only as a `GET`, which is exactly the hazard this replaces.
 *
 * Succeeds for an already-verified address too, by design — the library takes its success branch
 * for one, and the screen's "confirmed" is true either way. No session is issued.
 */
export function useConfirmEmail() {
  return useMutation<void, Error, string>({
    mutationFn: async (token): Promise<void> => {
      await apiFetch('/email-verification/confirm', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },
  });
}
