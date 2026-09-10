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

/**
 * The two sitting fields, and the one bound whose absence is a 500.
 *
 * `frames_per_phase` is `int4` and the database's own bound is **sign only**, deliberately: a range
 * is a protocol, and a protocol in a CHECK means the day the product widens it the database
 * silently refuses rows the product decided to accept. So the DTO holds the range, and it must stay
 * a **strict subset** of the CHECK — a DTO looser than the database turns a promised 422 into a
 * 500, which is the property backend-performance re-derived at the last gate pass and the reason
 * these cases exist rather than being taken as read.
 */
const errorsOn = (field: string, value: unknown): string[] =>
  errorsFor({ [field]: value })
    .filter((error) => error.property === field)
    .map((error) => error.property);

describe('sweepId and framesPerPhase', () => {
  it('accepts an absent sweepId — a single press is a fact, not a gap', () => {
    expect(errorsOn('sweepId', undefined)).toEqual([]);
    expect(errorsOn('sweepId', null)).toEqual([]);
  });

  it('refuses a malformed sweepId, because the column is uuid and would 500', () => {
    // The DTO refuses first; the database is the backstop. A malformed value reaching an
    // `@db.Uuid` column raises an error this route does not map — a 500 that loses the press.
    expect(errorsOn('sweepId', 'not-a-uuid')).toEqual(['sweepId']);
    expect(errorsOn('sweepId', 12)).toEqual(['sweepId']);
    expect(errorsOn('sweepId', '')).toEqual(['sweepId']);
  });

  it('accepts any UUID version, because the column does', () => {
    // No version argument on `@IsUUID()`. Pinning '4' would refuse a future v7 mint for nothing —
    // and `id` on this very table is already `uuid(7)`.
    expect(errorsOn('sweepId', '3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toEqual([]);
    expect(errorsOn('sweepId', '018f3a5b-7c9d-7e2f-8a1b-2c3d4e5f6071')).toEqual([]);
  });

  it('REFUSES 1e12 for framesPerPhase — the case that would otherwise be a 500', () => {
    // **The one assertion in this block that is not routine.** `Number.isInteger(1e12)` is `true`,
    // so `@IsInt()` alone passes it, the value reaches Postgres, and int4 overflow raises an error
    // the route does not map. The `@Max` is what makes this a 422. Verified red by removing it.
    expect(errorsOn('framesPerPhase', 1e12)).toEqual(['framesPerPhase']);
    expect(errorsOn('framesPerPhase', 2_147_483_648)).toEqual(['framesPerPhase']);
  });

  it('refuses zero and negatives, which the database CHECK also refuses', () => {
    // The subset property in the direction that matters: everything the CHECK rejects, the DTO
    // rejects first. `> 0` in the database, `@Min(1)` here — and an integer `> 0` is `>= 1`.
    expect(errorsOn('framesPerPhase', 0)).toEqual(['framesPerPhase']);
    expect(errorsOn('framesPerPhase', -1)).toEqual(['framesPerPhase']);
  });

  it('accepts the protocols the product actually runs, and an absent one', () => {
    // 40 for a check, 180 for a full measurement. Neither is encoded in the database, on purpose.
    expect(errorsOn('framesPerPhase', 40)).toEqual([]);
    expect(errorsOn('framesPerPhase', 180)).toEqual([]);
    expect(errorsOn('framesPerPhase', undefined)).toEqual([]);
    expect(errorsOn('framesPerPhase', null)).toEqual([]);
  });

  it('refuses a non-integer, so a fractional frame count cannot reach an int column', () => {
    expect(errorsOn('framesPerPhase', 180.5)).toEqual(['framesPerPhase']);
    expect(errorsOn('framesPerPhase', '180')).toEqual(['framesPerPhase']);
  });
});
