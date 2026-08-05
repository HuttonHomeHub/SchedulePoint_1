import type { MeResponse } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { SignInValues, SignUpValues } from '../schemas/auth-schemas';

import { ApiFetchError, apiFetch } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';

export const sessionKeys = {
  session: ['session'] as const,
};

/**
 * Query options for the current session (`GET /api/v1/me`). Shared by
 * {@link useSession} and the router's `_authed` guard loader so both read from
 * the same cache entry. Resolves to `null` when unauthenticated (401) rather
 * than erroring, so callers branch on the value.
 */
export const sessionQueryOptions = queryOptions<MeResponse | null>({
  queryKey: sessionKeys.session,
  staleTime: 0,
  queryFn: async () => {
    try {
      return await apiFetch<MeResponse>('/me');
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 401) {
        return null;
      }
      throw error;
    }
  },
});

/** The single source of truth for auth state (the current user + memberships). */
export function useSession(): UseQueryResult<MeResponse | null> {
  return useQuery(sessionQueryOptions);
}

function messageFrom(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

/**
 * An auth failure that carries the library's machine-readable `code` alongside the message
 * (ADR-0074).
 *
 * The code is what lets a screen branch. Matching on the message string would work today and break
 * on any wording change in a dependency — and the branch it guards is the difference between "check
 * your password" and "your address is not verified, here is how to fix that", which is not a
 * distinction to leave resting on prose.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function codeFrom(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Better Auth's code for "this account exists but its address is unverified", returned as a 403
 * from `/sign-in/email` when `AUTH_REQUIRE_EMAIL_VERIFICATION` is on (`sign-in.mjs:312-324`).
 *
 * **Nothing on the client can predict whether the server has that switch on** — it is an operator
 * env var read at API boot, and a `VITE_` constant is baked into the bundle long before. That is
 * why the branch is a runtime check on this code rather than a build-time flag (ADR-0074 §2).
 */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

/** Sign in with email + password, then refresh the session. */
export function useSignIn() {
  const queryClient = useQueryClient();
  // The error type is pinned to `AuthError` so callers can read `.code` — react-query would
  // otherwise widen it to `Error` and the `EMAIL_NOT_VERIFIED` branch would not compile.
  return useMutation<void, AuthError, SignInValues>({
    mutationFn: async (values: SignInValues): Promise<void> => {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });
      if (error) {
        throw new AuthError(
          messageFrom(error, 'Could not sign in. Check your details.'),
          codeFrom(error),
        );
      }
    },
    // Fetch the session fresh before the caller navigates: the `_authed` guard
    // reads it via `ensureQueryData`, which returns cached data without
    // revalidating, so the cache must already hold the new user — else the
    // post-login navigation reads the stale `null` and bounces back to sign-in.
    // `fetchQuery` runs the queryFn and returns a promise react-query awaits, so
    // the session is populated before the mutate-level onSuccess (navigation).
    onSuccess: () => queryClient.fetchQuery(sessionQueryOptions),
  });
}

/**
 * Where Better Auth's `GET /verify-email` handler sends the reader once it has verified the token.
 *
 * **One constant because there are two senders.** Sign-up sends the first verification email and
 * `useSendVerificationEmail` sends every later one; each passes this to the library, which composes
 * it into the emailed URL. Two literals would eventually differ, and the difference would be
 * invisible — each link works, and only someone who followed both would see that one confirms and
 * the other does not.
 *
 * The `verified=1` param is what `/verify-email` reads to render its success state.
 */
const VERIFIED_CALLBACK_URL = '/verify-email?verified=1';

/** What a completed sign-up tells the caller. See {@link useSignUp} for why this is not `void`. */
export interface SignUpOutcome {
  /**
   * False when the server created the account but issued **no session** — which it does whenever
   * `AUTH_REQUIRE_EMAIL_VERIFICATION` is on. The caller must route to `/verify-email` instead of
   * into the app.
   */
  signedIn: boolean;
}

/**
 * Create an account, then refresh the session.
 *
 * **Returns an outcome rather than `void`, and that is the whole fix** (ADR-0074 M2-T4). This
 * previously inspected only `error`, so with verification enforced it reported success, the screen
 * navigated to `/`, the `_authed` guard found no session and bounced to `/sign-in` **with no
 * explanation whatsoever**. The cause: `sign-up.mjs:162-163` derives `shouldSkipAutoSignIn` from
 * `requireEmailVerification`, which **overrides** this app's `autoSignIn: true`, and the route
 * returns `{ token: null, user }`.
 *
 * A latent dead end that switches itself on when an operator sets an env var — which is exactly why
 * no build-time flag could have gated the fix, and why it ships unflagged.
 *
 * **`callbackURL` is the other half of the same dead end.** Sign-up is what sends the *first*
 * verification email, and `sign-up.mjs:244` defaults its `callbackURL` to `/` when the caller sends
 * none — so the link in that email verified the address correctly and then landed the reader on the
 * app root, where the `_authed` guard bounced them to `/sign-in` with nothing said. Sending the same
 * destination the resend sends (`useSendVerificationEmail`) makes both links end on the screen that
 * confirms it worked. The value is consumed only to compose that URL; `sign-up.mjs:149` discards it
 * from the created user.
 */
export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: SignUpValues): Promise<SignUpOutcome> => {
      const { data, error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
        callbackURL: VERIFIED_CALLBACK_URL,
      });
      if (error) {
        throw new AuthError(messageFrom(error, 'Could not create your account.'), codeFrom(error));
      }
      // `token` is the session token. Absent or null ⇒ the account exists but nobody is signed in.
      return { signedIn: Boolean(data?.token) };
    },
    // See useSignIn: fetch so the session cache holds the new user before the
    // post-sign-up navigation runs (the guard reads cache without revalidating).
    onSuccess: () => queryClient.fetchQuery(sessionQueryOptions),
  });
}

/**
 * Send (or re-send) the address-verification email (ADR-0074).
 *
 * **Session-less by design.** The people who need it most cannot sign in — that is the state it
 * exists to resolve — so it takes the address as an argument rather than reading one from a
 * session that does not exist.
 *
 * The endpoint answers identically for an unknown address, an already-verified one and a real
 * pending one, and enforces a 500 ms floor to hide the timing difference
 * (`email-verification.mjs:98-117`). **The UI must not undo that**: one "check your email" state,
 * whatever the truth, with no branch a caller could read as an existence oracle.
 */
export function useSendVerificationEmail() {
  return useMutation({
    mutationFn: async (email: string): Promise<void> => {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: VERIFIED_CALLBACK_URL,
      });
      if (error) {
        throw new AuthError(
          messageFrom(error, 'Could not send the email. Try again in a moment.'),
          codeFrom(error),
        );
      }
    },
  });
}

/**
 * Better Auth's code for "the current password you gave is wrong", returned as a 400 from
 * `/change-password`. Used to attach the failure to the **current-password field** rather than
 * dropping it in a form-level banner beside three inputs, only one of which the reader can fix
 * (the ADR-0060 M6 finding, one control along).
 */
export const INVALID_PASSWORD = 'INVALID_PASSWORD';

/**
 * Change your own password (ADR-0074 M3).
 *
 * **Always revokes the other sessions**, with no checkbox (spec CQ-2). The reason someone changes
 * a password is usually that they think somebody else may know it, and a checkbox defaulted either
 * way is a question about session management asked at the worst possible moment. The consequence
 * is stated on screen **before** submit instead, which is the honest half of that trade.
 *
 * Deliberately the only new `authClient` consumer: every auth call in the app goes through this
 * module, so there is one place to look when the library's shape changes.
 */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation<void, AuthError, { currentPassword: string; newPassword: string }>({
    mutationFn: async ({ currentPassword, newPassword }): Promise<void> => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        throw new AuthError(
          messageFrom(error, 'Could not change your password. Try again.'),
          codeFrom(error),
        );
      }
    },
    // This session survives (the library keeps the caller's own), but the server has just
    // re-issued its token, so re-read rather than assume the cached one is still the truth.
    onSuccess: () => queryClient.fetchQuery(sessionQueryOptions),
  });
}

/**
 * Better Auth's code when `sendResetPassword` is not configured on the server (`password.mjs:51-57`)
 * — the whole reason SchedulePoint had no reset before ADR-0074 M0. Surfaced separately because
 * "reset is not available here" and "no such account" must never read as the same sentence.
 */
export const RESET_PASSWORD_DISABLED = 'RESET_PASSWORD_DISABLED';

/**
 * Ask for a password-reset link (ADR-0074 M4).
 *
 * **The endpoint answers identically for a known and an unknown address, and the UI must not undo
 * that.** `password.mjs:62-66` even performs a dummy verification lookup so the timing matches.
 * There is one submitted state, and no branch a caller could read as an existence oracle — that is
 * a requirement, not a copy preference.
 *
 * `redirectTo` is where the emailed link's handler sends the browser once it has checked the token.
 * It is origin-checked server-side (`password.mjs:49`), which is why `disableOriginCheck: false`
 * and a correct `CORS_ORIGINS` are M0 deployment preconditions rather than nice-to-haves.
 */
export function useRequestPasswordReset() {
  return useMutation<void, AuthError, string>({
    mutationFn: async (email: string): Promise<void> => {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        throw new AuthError(
          messageFrom(error, 'Could not send the email. Try again in a moment.'),
          codeFrom(error),
        );
      }
    },
  });
}

/**
 * Set a new password from an emailed token (ADR-0074 M4).
 *
 * **Issues no session** — the server changes the password and stops there — so a caller must send
 * the person to sign in rather than navigating into the app on their behalf. That is also the
 * honest shape: proving you can read the mailbox is not the same as signing in.
 */
export function useResetPassword() {
  return useMutation<void, AuthError, { token: string; newPassword: string }>({
    mutationFn: async ({ token, newPassword }): Promise<void> => {
      const { error } = await authClient.resetPassword({ token, newPassword });
      if (error) {
        throw new AuthError(
          messageFrom(error, 'Could not set your new password. Try again.'),
          codeFrom(error),
        );
      }
    },
  });
}

/** Sign out and clear all cached data. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await authClient.signOut();
    },
    onSuccess: async () => {
      queryClient.setQueryData(sessionKeys.session, null);
      await queryClient.invalidateQueries({ queryKey: sessionKeys.session });
    },
  });
}
