import { Inject, Injectable } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import { AUTH_INSTANCE, type AuthInstance } from './better-auth';
import { Principal } from './principal';

/**
 * Resolves the {@link Principal} for a request. This is the **authentication
 * seam**: it validates the Better Auth session cookie (ADR-0003) and loads the
 * user's organisation memberships so authorisation can be evaluated per
 * organisation (ADR-0012, ADR-0016).
 *
 * It is deliberately isolated behind this service so the rest of the app never
 * depends on the auth library, and so tests can supply a principal by overriding
 * this provider. No valid session → `null` → the request is unauthenticated
 * (secure by default).
 */
@Injectable()
export class AuthContextService {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: AuthInstance) {}

  async resolve(request: Request): Promise<Principal | null> {
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session?.user) {
      return null;
    }

    // Memberships are hydrated once the OrgMember model exists (feature B).
    // Until then a signed-in user simply has no organisation scope yet.
    return new Principal(session.user.id, []);
  }
}
