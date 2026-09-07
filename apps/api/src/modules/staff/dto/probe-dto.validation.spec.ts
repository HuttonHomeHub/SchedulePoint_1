import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateProbeResultDto } from './create-probe-result.dto';

/**
 * The staff console's one write is the surface where an attacker-influenced body meets a regular
 * expression, and the first version of `appVersion`'s pattern was **exponential**.
 *
 * `(?:[-+][0-9A-Za-z.-]+)*` opens each repetition on `[-+]` while the inner class also contains
 * `-`, so a run of dashes can be divided between the two in exponentially many ways and a
 * non-matching final character forces the engine to try all of them. Measured on this machine
 * against `1.0.0-` + N dashes + `!`: 2.7 ms at N=26, 2,260 ms at N=40, **281,307 ms at N=50**.
 * CodeQL flagged it high on the pull request that introduced it.
 *
 * `@MaxLength(64)` is **not** a mitigation, and that is the part worth knowing: class-validator
 * evaluates every constraint on a property rather than stopping at the first failure, so a
 * 63-character string of dashes reaches the regex whatever the length rule says.
 */
function errorsFor(payload: Record<string, unknown>) {
  return validateSync(plainToInstance(CreateProbeResultDto, payload) as object, {
    whitelist: true,
  });
}

/** A pathological input: the longest run of dashes the column bound admits, then a refusal. */
const CATASTROPHIC = `1.0.0-${'-'.repeat(56)}!`;

describe('appVersion is validated in linear time', () => {
  it('refuses the pathological input, and returns rather than hanging', () => {
    // The wall-clock bound is the assertion. It is set at 250 ms — three orders of magnitude above
    // the ~0.005 ms the shipped pattern takes and three orders of magnitude BELOW the 281 s the
    // old one took at a shorter input, so it cannot pass by luck on a slow runner and cannot fail
    // on a fast one. Verified red against the old pattern, which did not return at all.
    const started = performance.now();
    const errors = errorsFor({ appVersion: CATASTROPHIC });
    const elapsed = performance.now() - started;

    expect(errors.some((e) => e.property === 'appVersion')).toBe(true);
    expect(elapsed).toBeLessThan(250);
  });

  it('still accepts the versions this product actually cuts', () => {
    // Release granularity, per-package (ADR-0027). A pre-release or build suffix is legal because
    // changesets can cut one; a commit SHA is not, because `docker-publish.yml` passes no build
    // args and no SHA reaches either artefact (ADR-0088 D1).
    for (const version of ['0.109.0', '1.2.3-rc.1', '1.2.3+build.5', '1.2.3-rc.1+build.5']) {
      expect(
        errorsFor({ appVersion: version }).some((e) => e.property === 'appVersion'),
        version,
      ).toBe(false);
    }
  });

  it('still refuses what is not a version at all', () => {
    for (const value of ['main', '1.2', 'v1.2.3', '1.2.3 4']) {
      expect(
        errorsFor({ appVersion: value }).some((e) => e.property === 'appVersion'),
        value,
      ).toBe(true);
    }
  });
});
