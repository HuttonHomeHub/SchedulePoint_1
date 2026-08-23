import type { MeResponse } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { SignInValues, SignUpValues } from '../schemas/auth-schemas';

import { forgetAllForUser } from '@/features/overview/model/recent-plans';
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
 * An auth failure that carries the library's machine-readable `code` and HTTP `status` alongside
 * the message (ADR-0074, ADR-0077 M1-T4).
 *
 * The code is what lets a screen branch. Matching on the message string would work today and break
 * on any wording change in a dependency — and the branch it guards is the difference between "check
 * your password" and "your address is not verified, here is how to fix that", which is not a
 * distinction to leave resting on prose.
 *
 * **`status` exists because the rate limit has no code.** Better Auth's 429 body is
 * `{ message: "Too many requests. Please try again later." }` with no `code` field, so every screen
 * fell through to that library sentence in a bare red paragraph — the reader is told nothing about
 * what to do or how long. `@better-fetch/fetch` does put the status on the returned error
 * (`index.js:733-739`, `status: response.status` spread over the parsed body), so the one fact
 * needed to branch is already there and was simply being dropped here.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly status: number | undefined,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function codeFrom(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

function statusFrom(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Was this failure the rate limiter?
 *
 * **One predicate, because six screens must not drift on what 429 means.** Better Auth applies
 * 3-per-10s to `/sign-in*`, `/sign-up*`, `/change-password` and `/change-email`, and 3-per-60s to
 * `/request-password-reset` and `/send-verification-email` (`index.mjs:311-324`).
 *
 * **It is `enabled: options.isProduction`** (`better-auth.ts:270-274`), so no journey against the
 * dev or test API can reach this state — which is exactly why it went unhandled for so long, and
 * why the only end-to-end proof is a fulfilled route in the browser suite.
 *
 * **It covers `ApiFetchError` as well as `AuthError`** (ADR-0077 §9). The invitation-accept call
 * goes to our own REST API rather than to Better Auth, so it raises the other error class — and
 * that screen was consequently the one place in this whole area where a 429 reached the reader as
 * whatever terse string the server happened to send. Two error classes, one question.
 */
export function isRateLimited(error: unknown): boolean {
  return (error instanceof AuthError || error instanceof ApiFetchError) && error.status === 429;
}

/**
 * Which limiter a screen sits behind, and therefore which sentence it should say.
 *
 * `'email'` is the 60-second pair (`/request-password-reset`, `/send-verification-email`);
 * `'attempts'` is everything else — the 10-second sign-in/sign-up/change-password rule and the
 * global 100-per-60s default that `/reset-password` falls through to.
 */
export type RateLimitScope = 'attempts' | 'email';

const THROTTLED_MESSAGE: Record<RateLimitScope, string> = {
  attempts: 'Too many attempts. Wait a moment and try again.',
  email: 'Too many requests. Wait a minute before asking for another email.',
};

/**
 * What to show the reader for a failed auth call.
 *
 * **The throttled copy names no number of seconds, and that is deliberate.** The window is on the
 * `X-Retry-After` header (`index.mjs:64-70`), and `@better-fetch/fetch` builds its error from the
 * body, status and statusText only — **response headers are discarded** (`index.js:733-739`). So a
 * countdown here would be a figure nobody read. The two sentences differ in scale because the two
 * rules do (10 s vs 60 s), which is the honest amount of precision available.
 */
export function authErrorMessage(error: AuthError, scope: RateLimitScope = 'attempts'): string {
  return isRateLimited(error) ? THROTTLED_MESSAGE[scope] : error.message;
}

/**
 * The throttled sentence on its own, for a caller whose error is not an {@link AuthError}.
 *
 * Exported rather than duplicated: the invitation-accept screen needs the same words for the same
 * status code, and a second copy would be one copy-edit away from the two screens disagreeing
 * about what "too many" means.
 */
export function throttledMessage(scope: RateLimitScope = 'attempts'): string {
  return THROTTLED_MESSAGE[scope];
}

/**
 * Better Auth's code for "this account exists but its address is unverified", returned as a 403
 * from `/sign-in/email` when `AUTH_REQUIRE_EMAIL_VERIFICATION` is on (`sign-in.mjs:339-351`).
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
          statusFrom(error),
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
 * explanation whatsoever**. The cause: `sign-up.mjs:163-164` derives `shouldSkipAutoSignIn` from
 * `requireEmailVerification`, which **overrides** this app's `autoSignIn: true`, and the route
 * returns `{ token: null, user }`.
 *
 * A latent dead end that switches itself on when an operator sets an env var — which is exactly why
 * no build-time flag could have gated the fix, and why it ships unflagged.
 *
 * **`callbackURL` is the other half of the same dead end.** Sign-up is what sends the *first*
 * verification email, and `sign-up.mjs:252` defaults its `callbackURL` to `/` when the caller sends
 * none — so the link in that email verified the address correctly and then landed the reader on the
 * app root, where the `_authed` guard bounced them to `/sign-in` with nothing said. Sending the same
 * destination the resend sends (`useSendVerificationEmail`) makes both links end on the screen that
 * confirms it worked. The value is consumed only to compose that URL; `sign-up.mjs:150` discards it
 * from the created user.
 */
export function useSignUp() {
  const queryClient = useQueryClient();
  // Pinned to `AuthError` for the same reason `useSignIn` is: react-query would otherwise widen it
  // to `Error`, and the 429 branch (ADR-0077 M1-T4) would not compile.
  return useMutation<SignUpOutcome, AuthError, SignUpValues>({
    mutationFn: async (values): Promise<SignUpOutcome> => {
      const { data, error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
        callbackURL: VERIFIED_CALLBACK_URL,
      });
      if (error) {
        throw new AuthError(
          messageFrom(error, 'Could not create your account.'),
          codeFrom(error),
          statusFrom(error),
        );
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
 * (`email-verification.mjs:108-127`). **The UI must not undo that**: one "check your email" state,
 * whatever the truth, with no branch a caller could read as an existence oracle.
 */
export function useSendVerificationEmail() {
  return useMutation<void, AuthError, string>({
    mutationFn: async (email): Promise<void> => {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: VERIFIED_CALLBACK_URL,
      });
      if (error) {
        throw new AuthError(
          messageFrom(error, 'Could not send the email. Try again in a moment.'),
          codeFrom(error),
          statusFrom(error),
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
          statusFrom(error),
        );
      }
    },
    // This session survives (the library keeps the caller's own), but the server has just
    // re-issued its token, so re-read rather than assume the cached one is still the truth.
    onSuccess: () => queryClient.fetchQuery(sessionQueryOptions),
  });
}

/**
 * Better Auth's code when `sendResetPassword` is not configured on the server (`password.mjs:53-59`)
 * — the whole reason SchedulePoint had no reset before ADR-0074 M0. Surfaced separately because
 * "reset is not available here" and "no such account" must never read as the same sentence.
 */
export const RESET_PASSWORD_DISABLED = 'RESET_PASSWORD_DISABLED';

/**
 * Ask for a password-reset link (ADR-0074 M4).
 *
 * **The endpoint answers identically for a known and an unknown address, and the UI must not undo
 * that.** `password.mjs:67-71` even performs a dummy verification lookup so the timing matches.
 * There is one submitted state, and no branch a caller could read as an existence oracle — that is
 * a requirement, not a copy preference.
 *
 * `redirectTo` is where the emailed link's handler sends the browser once it has checked the token.
 * It is origin-checked server-side (`password.mjs:50`), which is why `disableOriginCheck: false`
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
          statusFrom(error),
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
          statusFrom(error),
        );
      }
    },
  });
}

/**
 * Sign out and clear all cached data.
 *
 * **Clear, then seed — never invalidate.** Invalidating the session key forces an immediate refetch
 * of `GET /me` with no cookie, so the console logs a 401 on every sign-out. `sessionQueryOptions`
 * catches that 401 and resolves to `null`, so nothing breaks — but the browser reports the failed
 * request at the network layer, where no `try`/`catch` can reach it, and it is asking the server a
 * question we have just authoritatively answered.
 *
 * Every OTHER cached query is dropped, because after a sign-out the cached orgs, plans and
 * activities belong to somebody who is no longer here — this docblock has always claimed as much
 * while only the session key was ever touched.
 *
 * **The session key is excluded from that sweep, and a blunt `clear()` is wrong for the same
 * reason the invalidate was.** The guard mounts an observer on this query; removing its data leaves
 * that observer with none, and an observer with no data fetches — reinstating the 401 through a
 * different door. Seeding the value and leaving it in place is what keeps the request from ever
 * being made.
 *
 * **`onSettled`, not `onSuccess`** (ADR-0075 review, security). If the sign-out request itself
 * fails — offline, a proxy error, the API restarting — `onSuccess` never runs and the previous
 * user's organisations, plans and activities stay in the cache on a shared or borrowed machine,
 * with the UI still showing them. Whether the server-side session survived is not knowable from
 * here and is not the question: the person pressed Sign out, so the local copy goes either way.
 * Clearing on a failure is safe in the other direction too, because the seeded `null` sends the
 * guard to `/sign-in`, which is where somebody whose sign-out did not complete should be.
 *
 * **It also clears this account's remembered plans from `localStorage`** (ADR-0098 §4.9 D10a). The
 * query cache is in memory and dies with the tab; the recent-plans store does not, so without this
 * a shared machine hands the next account the previous one's plan names — commercially sensitive
 * strings, on the first screen after sign-in, caused by nothing they did. The id is read BEFORE the
 * cache is cleared, because the only place it exists is the session query this function is about to
 * remove.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await authClient.signOut();
    },
    onSettled: () => {
      const userId = queryClient.getQueryData<MeResponse | null>(sessionKeys.session)?.user.id;
      if (userId !== undefined) forgetAllForUser(window.localStorage, userId);
      queryClient.setQueryData(sessionKeys.session, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    },
  });
}
