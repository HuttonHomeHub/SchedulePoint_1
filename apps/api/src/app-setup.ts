import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { json, type Request, type RequestHandler } from 'express';
import helmet from 'helmet';

import { AUTH_INSTANCE, type AuthInstance } from './common/auth/better-auth';
import {
  DEFAULT_JSON_LIMIT,
  ORG_SCOPED_JSON_LIMIT,
  ORG_SCOPED_PATH_PREFIX,
} from './common/http/body-limits';
import { tagBodyParserErrors } from './common/http/body-parser-errors';
import { AppConfigService } from './config/app-config.service';

/**
 * Whether a request PRESENTS credentials — presence only, never validity. Better Auth names its
 * session cookie `<cookiePrefix>.session_token` (`better-auth.ts`, `cookiePrefix: 'schedulepoint'`),
 * with a `__Secure-` prefix in production, so a substring match covers both. `AuthenticationGuard`
 * stays the authority on whether the credential is good; this only decides which size cap a request
 * is read under, before any guard has run.
 */
function presentsCredentials(req: Request): boolean {
  return (
    req.headers.authorization !== undefined ||
    (req.headers.cookie ?? '').includes('schedulepoint.session_token')
  );
}

/**
 * Applies the HTTP-layer wiring shared by production bootstrap (`main.ts`) and
 * the e2e tests, so both exercise identical middleware ordering.
 *
 * The Better Auth handler is mounted on the raw Express instance with a RegExp
 * route: this preserves the full request URL (a path-prefixed `app.use` would
 * strip `/api/auth`, breaking Better Auth's internal routing) and runs BEFORE
 * the JSON body parser so the handler receives the raw request body. It
 * terminates the response, so the parsers below never see auth requests.
 *
 * Requires the app to be created with `{ bodyParser: false }` (parsers are added
 * here, after the auth handler).
 */
export function configureHttpApp(app: NestExpressApplication): void {
  const config = app.get(AppConfigService);

  // Trust the configured reverse-proxy hops so `req.ip` resolves the real client IP from
  // `X-Forwarded-For` instead of collapsing every request onto the proxy's address. Nest's
  // global `ThrottlerGuard` keys its per-IP buckets on `req.ip`; without this, behind a proxy
  // the per-client rate limit (notably the tighter guest-surface limit, ADR-0051 §6) degrades
  // into one shared global bucket. Set only when proxies are declared (production); left off in
  // dev/test where there is no proxy — mirroring the Better Auth `trustedProxies` wiring, which
  // reads the same `TRUSTED_PROXY_IPS` config.
  const trustedProxies = config.trustedProxyIps;
  if (trustedProxies.length > 0) {
    app.set('trust proxy', trustedProxies);
  }

  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    // Expose the file-download headers so a cross-origin browser fetch can read them. `Content-Disposition`
    // carries the download filename and `X-Interchange-Report` the interchange report for a file response
    // (schedule-interchange export, ADR-0050 M4a) — both are non-simple headers a browser hides unless
    // exposed. Additive: absent for every JSON response.
    exposedHeaders: ['Content-Disposition', 'X-Interchange-Report'],
  });

  const auth = app.get<AuthInstance>(AUTH_INSTANCE);
  app
    .getHttpAdapter()
    .getInstance()
    .all(/^\/api\/auth(?:\/|$)/, toNodeHandler(auth));

  // **The extra two types are not decoration: without them the CSP sink records nothing.** A
  // browser posts a violation report as `application/csp-report` (the legacy `report-uri`
  // mechanism) or `application/reports+json` (the Reporting API) — never `application/json`. With
  // the default registration the body arrived unparsed, the normaliser saw `undefined`, and the
  // endpoint answered its usual 204, so the failure was invisible from outside.
  //
  // It was invisible from inside too, which is the part worth remembering: `csp-report.e2e-spec.ts`
  // passed throughout because supertest's `.send(obj)` sets `application/json`, a type no browser
  // sends here. A test whose client differs from the real one in the one respect that matters is
  // green and worthless. Found by the schema review, not by the suite.
  //
  // A body cap belongs here too — these arrive on an unauthenticated route.
  const jsonTypes = ['application/json', 'application/csp-report', 'application/reports+json'];

  // **The cap is decided by path and by whether credentials are presented, because the parser runs
  // before any guard.** Four batch DTOs accept `@ArrayMaxSize(2000)` rows (positions, placements,
  // parents, bulk-delete); a 2,000-row placements body is 292-356 KB measured (a row is ~146-178
  // bytes with every field set), so 64 KB made the documented ceiling unreachable and a large
  // `parents` batch died in the parser (TECH_DEBT #407).
  //
  // The larger limit applies only under the org-scoped prefix (no `@Public()` handler lives there —
  // pinned by `public-routes-census.structural.spec.ts`) AND only when the request carries a session
  // cookie or an Authorization header. That bounds what an anonymous caller can make the process
  // buffer to 64 KB on every route this app's own parsers read; it does NOT make the large cap safe against a caller who merely
  // sends a junk cookie, because the parser precedes the guard and cannot validate one. That residue
  // is one 512 KB buffer per in-flight request from a caller who then gets a 401.
  //
  // **JSON is the only body format parsed here, which is what makes "64 KB" a bound on every body
  // this app's own parsers read.** It is NOT a bound on `/api/auth/*`: Better Auth is mounted above
  // these parsers and reads its own bodies through better-call's node adapter, whose limit (if any)
  // we do not set (TECH_DEBT #416). A `urlencoded` parser used to be mounted
  // after these with no `limit`, so body-parser's 100 KB default applied on every route beside a
  // comment promising 64 (TECH_DEBT #415); no route reads a form body, so it was removed rather
  // than capped. A form-encoded body now reaches its handler unparsed (`req.body` undefined).
  // Multipart is multer's, capped per route.
  //
  // Mounted first: body-parser skips a request an earlier parser already read
  // (`body-parser/lib/read.js:36-40`, `onFinished.isFinished(req)`), so the global 64 KB parser
  // below never sees a body the large one handled.
  // Both parsers are wrapped so the exception filter can tell a parser's failure from any other
  // error (`common/http/body-parser-errors.ts`).
  const orgScopedJson = tagBodyParserErrors(
    json({ type: jsonTypes, limit: ORG_SCOPED_JSON_LIMIT }),
  );
  const orgScoped: RequestHandler = (req, res, next) => {
    if (presentsCredentials(req)) {
      orgScopedJson(req, res, next);
    } else {
      next();
    }
  };
  app.use(ORG_SCOPED_PATH_PREFIX, orgScoped);
  app.use(tagBodyParserErrors(json({ type: jsonTypes, limit: DEFAULT_JSON_LIMIT })));

  // All Nest routes under /api, URI-versioned (/api/v1/...).
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}
