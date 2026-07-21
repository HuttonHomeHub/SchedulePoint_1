import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

/** The fallback returned when the manifest can't be read or has no version field. */
const UNKNOWN_VERSION = 'unknown';

/**
 * Resolves the API's own package version once, at startup, so the public
 * `GET /api/v1/version` read is a constant-time field return (no per-request I/O).
 *
 * The manifest is read from `process.cwd()/package.json`, which resolves to the
 * api's own manifest both in local dev (the pnpm task runs with cwd `apps/api`)
 * and in the container (`pnpm deploy` makes `/app/package.json` the api's own and
 * WORKDIR is `/app`). Parsing is defensive: a missing/unreadable file or an absent
 * `version` field degrades to {@link UNKNOWN_VERSION} rather than throwing — build
 * metadata must never take the process down.
 */
@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private readonly version: string = this.readVersion();

  /** The API's package version, or `'unknown'` if it couldn't be resolved. */
  getVersion(): string {
    return this.version;
  }

  private readVersion(): string {
    try {
      const manifestPath = join(process.cwd(), 'package.json');
      const raw = readFileSync(manifestPath, 'utf8');
      const parsed = JSON.parse(raw) as { version?: unknown };
      const version = parsed.version;
      if (typeof version === 'string' && version.length > 0) {
        return version;
      }
      this.logger.warn('package.json has no usable "version" field; reporting "unknown".');
      return UNKNOWN_VERSION;
    } catch (error) {
      this.logger.warn(
        `Could not read the API version from package.json; reporting "unknown". ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return UNKNOWN_VERSION;
    }
  }
}
