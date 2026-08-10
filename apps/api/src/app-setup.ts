import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

import { AUTH_INSTANCE, type AuthInstance } from './common/auth/better-auth';
import { AppConfigService } from './config/app-config.service';

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
  app.use(
    json({
      type: ['application/json', 'application/csp-report', 'application/reports+json'],
      limit: '64kb',
    }),
  );
  app.use(urlencoded({ extended: true }));

  // All Nest routes under /api, URI-versioned (/api/v1/...).
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}
