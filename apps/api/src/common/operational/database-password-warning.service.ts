import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

/** The password the compose files fall back to when `POSTGRES_PASSWORD` is not set. */
const DEFAULT_DATABASE_PASSWORD = 'app';

/**
 * Whether the connection URL carries the built-in default password.
 *
 * A URL that does not parse answers `false`: env validation owns rejecting a bad URL, and a
 * warning about a password nobody could read would only bury that error.
 */
export function usesDefaultDatabasePassword(databaseUrl: string): boolean {
  let password: string;
  try {
    password = new URL(databaseUrl).password;
    // `URL` leaves the userinfo percent-encoded, so `%61pp` is `app` to the database.
    password = decodeURIComponent(password);
  } catch {
    return false;
  }
  return password === DEFAULT_DATABASE_PASSWORD;
}

/**
 * Says so, once, at start-up, when the database password is the built-in default
 * (`docs/TECH_DEBT.md` #514).
 *
 * **Visible, not enforced** — the owner's choice (2026-10-16). Refusing to boot, or making
 * `POSTGRES_PASSWORD` required in the compose file, would stop an existing installation that has
 * never set one, and changing the password there is an `ALTER USER` as well as an `.env` edit. The
 * database port is closed (ADR-0192 D10), so this is a hygiene finding and not an emergency.
 *
 * **Never logs the password or the URL**: the event and the fixed message are the whole payload.
 * **Silent under `NODE_ENV=test`**, where `app:app` is the fixture and a line on every e2e boot
 * would be noise; local development still gets the one line.
 */
@Injectable()
export class DatabasePasswordWarningService implements OnApplicationBootstrap {
  constructor(
    private readonly config: AppConfigService,
    @InjectPinoLogger(DatabasePasswordWarningService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') return;
    if (!usesDefaultDatabasePassword(this.config.databaseUrl)) return;

    this.logger.warn(
      { event: 'database.default_password' },
      "The database password is the built-in default. See the back-up-and-restore guide, 'Set a database password'.",
    );
  }
}
