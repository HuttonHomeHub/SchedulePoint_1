import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { Principal } from './principal';

/**
 * Resolves the {@link Principal} for a request. This is the **authentication
 * seam**: the production implementation validates the Better Auth session
 * cookie (ADR-0003) and loads the user's organisation memberships.
 *
 * It is deliberately isolated behind this service so the rest of the app never
 * depends on the auth library, and so tests can supply a principal by
 * overriding this provider (see the reference e2e test). Until Better Auth is
 * wired (when you add authentication), it returns `null` → requests are
 * unauthenticated (secure by default).
 */
@Injectable()
export class AuthContextService {
  // eslint-disable-next-line @typescript-eslint/require-await
  async resolve(_request: Request): Promise<Principal | null> {
    // TODO(auth): validate the Better Auth session cookie and hydrate the
    // principal (userId + organisation memberships). Returning null keeps every
    // protected route locked until real authentication is in place.
    return null;
  }
}
