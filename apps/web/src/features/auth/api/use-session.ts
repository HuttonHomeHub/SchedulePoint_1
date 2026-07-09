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

/** Sign in with email + password, then refresh the session. */
export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: SignInValues): Promise<void> => {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });
      if (error) throw new Error(messageFrom(error, 'Could not sign in. Check your details.'));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.session }),
  });
}

/** Create an account (auto-signed-in), then refresh the session. */
export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: SignUpValues): Promise<void> => {
      const { error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      if (error) throw new Error(messageFrom(error, 'Could not create your account.'));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.session }),
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
