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

  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, credentials: true });

  const auth = app.get<AuthInstance>(AUTH_INSTANCE);
  app
    .getHttpAdapter()
    .getInstance()
    .all(/^\/api\/auth(?:\/|$)/, toNodeHandler(auth));

  app.use(json());
  app.use(urlencoded({ extended: true }));

  // All Nest routes under /api, URI-versioned (/api/v1/...).
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}
