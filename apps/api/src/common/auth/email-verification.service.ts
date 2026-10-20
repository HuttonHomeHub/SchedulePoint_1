import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import {
  VerificationLinkExpiredError,
  VerificationLinkInvalidError,
} from '../errors/domain-errors';

import { AUTH_INSTANCE, type AuthInstance } from './better-auth';

/** Better Auth's rate limiter answers a bare status; named so the comparison is not a magic number. */
const TOO_MANY_REQUESTS = 429;

/**
 * Forwarded headers are evidence for an audit row and Better Auth's limiter, not data worth
 * trusting at length: capped so a hostile client cannot make this process build a megabyte header.
 */
const MAX_FORWARDED_HEADER = 512;

/** The request evidence the audit row `auth.email_verified` is made from. */
export interface ForwardedEvidence {
  userAgent: string | undefined;
  forwardedFor: string | undefined;
}

/**
 * Confirms an emailed verification token on a deliberate press (TECH_DEBT #88, ADR-0074).
 *
 * Better Auth only exposes verification as a `GET` (`email-verification.mjs:126-127`), which any
 * mail scanner that fetches the link would trigger. This service is the `POST` it lacks, and it
 * reuses the library's own verifier rather than re-implementing JWT checks: it calls the instance's
 * public `handler` with a synthetic `GET` (`base.mjs:29-51`).
 *
 * **Why `handler` and not `auth.api.verifyEmail`:** `afterEmailVerification` is the audit seam and
 * reads `request.headers` for the client IP and user agent (`email-verification.mjs:294-296`); a
 * server-side `auth.api` call has no request, so the `auth.email_verified` row would lose both. The
 * original request's `user-agent` and `x-forwarded-for` are therefore forwarded, and Better Auth's
 * own rate limiter keys on the same headers. This internal call never touches Express, so the
 * shadow route on the legacy `GET` (`app-setup.ts`) does not block it.
 *
 * No `callbackURL` is sent, so a failure comes back as an API error carrying a code
 * (`email-verification.mjs:173-182`) instead of a redirect — which is what is mapped here. No
 * session is issued: `autoSignInAfterVerification` is not configured
 * (`email-verification.mjs:297-298`).
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: AuthInstance,
    private readonly config: AppConfigService,
  ) {}

  async confirm(token: string, evidence: ForwardedEvidence): Promise<void> {
    // Origin only: Better Auth routes on its own `basePath`, so a `BETTER_AUTH_URL` that carries
    // (or lacks) the path cannot change where this lands.
    const url = new URL('/api/auth/verify-email', this.config.betterAuthUrl);
    url.searchParams.set('token', token);

    const headers = new Headers();
    try {
      if (evidence.userAgent !== undefined) {
        headers.set('user-agent', evidence.userAgent.slice(0, MAX_FORWARDED_HEADER));
      }
      if (evidence.forwardedFor !== undefined) {
        headers.set('x-forwarded-for', evidence.forwardedFor.slice(0, MAX_FORWARDED_HEADER));
      }
    } catch {
      // `Headers` refuses a value that is not a valid header value. Node's parser already rejects
      // those on the way in, so this is defence in depth: the caller's request is malformed, which
      // is a 400, not a fault of ours.
      throw new BadRequestException('The request headers could not be read.');
    }

    // **The response is discarded on purpose, `Set-Cookie` included.** Confirming must never sign
    // anyone in. Today that holds because `autoSignInAfterVerification` is not configured
    // (`email-verification.mjs:297-298`) and `user.changeEmail` is not enabled; enabling
    // `changeEmail` mints `updateTo` tokens whose verification creates a session, so doing so
    // means re-reviewing this endpoint before it ships.
    const response = await this.auth.handler(new Request(url, { method: 'GET', headers }));
    if (response.ok) return;

    if (response.status === TOO_MANY_REQUESTS) {
      throw new HttpException('Too many attempts.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = await errorCode(response);
    if (code === 'TOKEN_EXPIRED') {
      throw new VerificationLinkExpiredError('That verification link has expired.');
    }
    // `USER_NOT_FOUND` joins `INVALID_TOKEN` on purpose: the distinction is not actionable for the
    // person pressing the button, and saying which would narrate whether an account exists
    // (`email-verification.mjs:189`).
    if (code === 'INVALID_TOKEN' || code === 'USER_NOT_FOUND') {
      throw new VerificationLinkInvalidError('That verification link did not work.');
    }
    // Anything else is a fault, not a bad link: the exception filter logs it as an incident and
    // answers an opaque 500.
    throw new Error(
      `Better Auth answered ${response.status} (${code ?? 'no code'}) to verify-email`,
    );
  }
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    const code = (body as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}
