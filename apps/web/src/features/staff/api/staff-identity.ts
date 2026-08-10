import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { ApiFetchError, apiFetch } from '@/lib/api/client';

/** The calling staff identity, or `null` for everybody else. */
export interface StaffIdentity {
  userId: string;
  email: string;
  /**
   * Whether this account also holds an organisation membership.
   *
   * ADR-0086 D4 permits dual-hatting and compensates by making the console say which hat is active.
   * The compensation was decided and not built until the UX review found it.
   */
  dualHatted: boolean;
}

export const staffIdentityKey = ['staff', 'me'] as const;

/**
 * Is the caller staff? **The gate is runtime evidence, never a build-time constant.**
 *
 * This is the generalisation ADR-0074 drew from ADR-0060 M0: a `VITE_` value is baked into the
 * bundle, and staff-ness is a **server** fact — read from `STAFF_EMAILS` on the API, which the
 * client cannot see and which an operator changes without a release. A flag here would be worse
 * than none: it would strand a staff member on a flag-off bundle against a flag-on server, and
 * grant a nav entry to everybody on the opposite mistake.
 *
 * A 404 is the **expected** answer for the overwhelming majority of callers — the guard answers
 * every refusal identically so the surface is no oracle — so it resolves to `null` rather than
 * throwing. Any other failure still throws, because "the API is unreachable" and "you are not
 * staff" are different facts and collapsing them would hide an outage behind a shrug.
 */
export function useStaffIdentity(
  options: { enabled?: boolean } = {},
): UseQueryResult<StaffIdentity | null> {
  return useQuery({
    queryKey: staffIdentityKey,
    // **Deferrable, because one caller pays for everybody.** The console itself always asks; the
    // account menu asks only when it is OPENED. Two reasons, and the second is the load-bearing
    // one. A probe on every page load would be a request for every signed-in user in the product
    // to answer a question about one of them — and, because `GET /staff/me` is audited by design
    // (ADR-0086 D5, no staff route may be unaudited), it would also write a `staff.session_started`
    // row every time a staff member opened a tab. That row would still be TRUE, but it would
    // change what the Staff activity panel means: a reader looking for "who went to the console"
    // would find a list dominated by "somebody loaded the app". Deferring keeps the row's sense.
    //
    // `staleTime: Infinity` means the deferral costs one moment on the first open of a session and
    // nothing on any open after it.
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<StaffIdentity | null> => {
      try {
        return await apiFetch<StaffIdentity>('/staff/me');
      } catch (error) {
        if (error instanceof ApiFetchError && error.status === 404) return null;
        throw error;
      }
    },
    // Staff-ness changes only when an operator edits the environment and recreates the container,
    // so it cannot change mid-session. Refetching it on every window focus would be a request per
    // tab switch to answer a question whose answer cannot have moved.
    staleTime: Infinity,
    retry: false,
  });
}
