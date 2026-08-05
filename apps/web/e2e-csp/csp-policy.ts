import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * The **deployed** Content-Security-Policy, read from the one place the deployment gets it.
 *
 * `docker-compose.yml` supplies `CSP_POLICY`'s default to the web container, which
 * `nginx.conf` substitutes into the header (ADR-0074 M1). Parsing it here rather than restating
 * it is the whole point: a copy would drift, and a gate testing a policy nobody serves proves
 * nothing. If the shape of that line changes, this throws rather than silently testing `undefined`.
 */
export function deployedCspPolicy(): string {
  const composePath = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));
  const compose = readFileSync(composePath, 'utf8');
  const match = /CSP_POLICY:\s*\$\{CSP_POLICY:-(.+?)\}\s*$/m.exec(compose);
  if (!match?.[1]) {
    throw new Error(
      'Could not read the CSP_POLICY default from docker-compose.yml. The gate reads the real ' +
        'policy from the compose file so it cannot drift from what is served — if that line moved ' +
        'or changed shape, update this parser rather than inlining a copy of the policy.',
    );
  }
  return match[1].trim();
}
