import { createAuthClient } from 'better-auth/react';

import { AUTH_BASE_URL } from '@/config/env';

/**
 * The Better Auth browser client (ADR-0003). Talks to the server handler mounted
 * at {@link AUTH_BASE_URL}; sessions live in secure, http-only cookies the client
 * never reads directly. Sign-in/up/out are exposed as mutations in
 * `features/auth`; app auth state is read from our `/me` query (`useSession`).
 */
export const authClient = createAuthClient({
  basePath: AUTH_BASE_URL,
});
