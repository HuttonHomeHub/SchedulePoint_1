import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { resolveClientIp } from '../http/client-ip';

/**
 * The request-shaped facts an audit row needs that a `Principal` cannot supply: where the request
 * came from, what made it, and which log line it belongs to.
 *
 * Deliberately NOT merged into `Principal`. A principal is an authorisation input and is compared,
 * cached and reasoned about as identity; an IP address is evidence. Putting evidence on the
 * identity object invites someone to authorise on it.
 */
export interface RequestContext {
  /** The real client IP, or null when it cannot honestly be established. */
  ipAddress: string | null;
  /** Truncated by `AuditService`; carried raw here so nothing decides twice. */
  userAgent: string | null;
  /** Pino's per-request id, so an audit row joins to the log line for the same request. */
  correlationId: string | null;
}

/**
 * Trusted proxies, read once at module load.
 *
 * Read from `process.env` rather than injected, because a `createParamDecorator` factory runs
 * outside Nest's DI container and has no way to reach `AppConfigService`. The alternative — an
 * interceptor that stashes the context on the request — was rejected as more machinery for the
 * same result, and it would hide the dependency rather than remove it.
 *
 * The value is validated at boot by `env.validation.ts` (and required in production), so by the
 * time any request arrives this has already been checked. Parsed once because the list cannot
 * change without a restart.
 */
const TRUSTED_PROXIES: readonly string[] = (process.env.TRUSTED_PROXY_IPS ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry !== '');

/** The subset of an Express request this reads. Narrowed so a test need not fake a whole request. */
export interface RequestContextSource {
  id?: string;
  socket?: { remoteAddress?: string } | undefined;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Build the context from a request.
 *
 * Exported and pure so it can be tested directly: the decorator itself is only reachable through
 * Nest's parameter-metadata machinery, and a test that has to reconstruct that machinery ends up
 * asserting Nest works rather than that this does.
 *
 * `trustedProxies` is a **parameter** and not read from the environment here, so a test cannot pass
 * by accident of what the runner happens to have set.
 */
export function buildRequestContext(
  request: RequestContextSource,
  trustedProxies: readonly string[],
): RequestContext {
  const userAgent = request.headers['user-agent'];

  return {
    ipAddress: resolveClientIp(
      request.headers['x-forwarded-for'],
      request.socket?.remoteAddress,
      trustedProxies,
    ),
    userAgent: typeof userAgent === 'string' ? userAgent : null,
    correlationId: request.id ?? null,
  };
}

/**
 * Injects the {@link RequestContext} into a handler parameter.
 *
 * Unlike `CurrentUser` this never throws: every field is optional evidence, and an unauthenticated
 * route (a failed sign-in is the case that matters) still has an IP worth recording. Refusing to
 * build a context because one header is missing would lose exactly the rows that matter most.
 */
export const RequestContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext =>
    buildRequestContext(
      ctx.switchToHttp().getRequest<AuthenticatedRequest & RequestContextSource>(),
      TRUSTED_PROXIES,
    ),
);
