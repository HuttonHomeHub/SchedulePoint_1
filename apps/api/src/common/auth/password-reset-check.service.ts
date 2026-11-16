import { Inject, Injectable } from '@nestjs/common';

import { AUTH_INSTANCE, type AuthInstance } from './better-auth';

/**
 * Answers "would the reset POST get past its token checks?" without consuming anything, so the
 * reset page can say on arrival that a link is spent (spec `docs/specs/reset-link-check/`,
 * amending ADR-0074).
 *
 * It runs the library's own lookup through `auth.$context.internalAdapter` rather than its HTTP
 * route or our own Prisma query, in `better-auth@1.7.18`:
 *
 * - the row is keyed `reset-password:${token}` (`password.mjs:77`);
 * - the POST refuses a missing or expired row (`password.mjs:155-156`), then a missing user
 *   (`password.mjs:158-159`), and only then consumes (`password.mjs:162`) — consumption is not
 *   done here;
 * - `findVerificationValue` hashes the identifier with the configured `storeIdentifier` and falls
 *   back to the plain one (`internal-adapter.mjs:768-770`, `801-808`), so it finds our hashed rows
 *   and a library change to identifier storage moves with it;
 * - the instance exposes `$context` (`base.mjs:58`).
 *
 * Not `handler` with a synthetic `GET /reset-password/:token`: that puts the token in a URL, needs
 * `originCheck` to accept a callback, and skips the user check. Not Prisma: it would re-implement
 * the hashing. The two-line predicate is copied from the POST; the e2e cases keep the copy honest.
 *
 * The call is anonymous and, through `findVerificationValue`, triggers Better Auth's `deleteMany` of
 * all expired verification rows (`internal-adapter.mjs:801-808`). That is bounded by the route's
 * 10 requests a minute per IP, and the throttler store is per replica (TECH_DEBT #49).
 *
 * Takes no logger and puts the token in no message: the token is a live credential.
 */
@Injectable()
export class PasswordResetCheckService {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: AuthInstance) {}

  async isUsable(token: string): Promise<boolean> {
    const { internalAdapter } = await this.auth.$context;
    const verification = await internalAdapter.findVerificationValue(`reset-password:${token}`);
    if (!verification || verification.expiresAt < new Date()) return false;
    // A deleted account folds into "unusable", as the confirm endpoint folds it into "invalid":
    // saying which would narrate whether an account exists.
    return (await internalAdapter.findUserById(verification.value)) !== null;
  }
}
