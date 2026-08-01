import { describe, expect, it } from 'vitest';

import { SeedHttpError, stripTrailingSlashes } from './client.js';

/**
 * The report `--out` writes is JSON built from these messages, so an unbounded response body used
 * to become an unbounded file (TECH_DEBT #81). The cap is not defensive theatre: nothing about the
 * seeder's own API produces text near it, so a run that trips it is telling the operator something.
 */
describe('SeedHttpError bounds what the server can put in a report', () => {
  it('truncates a hostile detail payload and says that it did', () => {
    const error = new SeedHttpError(422, 'X', 'nope', ['y'.repeat(50_000)], '/p');
    expect(error.message.length).toBeLessThan(3_000);
    expect(error.message).toContain('truncated');
  });

  it('leaves an ordinary validation payload untouched', () => {
    // The case that motivated `details` in the first place must read exactly as before.
    const error = new SeedHttpError(
      422,
      'VALIDATION_FAILED',
      'Validation failed.',
      ['durationDays must be an integer', 'code should not be empty'],
      '/api/v1/…/activities',
    );
    expect(error.message).toContain('durationDays must be an integer; code should not be empty');
    expect(error.message).not.toContain('truncated');
  });
});

/**
 * Regression cover for the CodeQL `js/polynomial-redos` finding on PR #204.
 *
 * The interesting part is **which** input is hostile. The obvious guess — a long run of trailing
 * slashes — is not: V8 matches `/\/+$/` against it in about 0.1 ms, so a test built on that input
 * passes against the code it was meant to condemn. The quadratic case is a long run of slashes
 * that is *not* at the end, because then the engine retries `\/+$` from each position, consumes the
 * run, and fails `$` every time.
 *
 * Measured on the old implementation before this fix, with the input below: 20,000 slashes → 166 ms,
 * 40,000 → 642 ms, 80,000 → 2,520 ms. A clean 4× per doubling, which is the signature. The new one
 * is flat at ~0.1 ms.
 */
describe('stripTrailingSlashes', () => {
  it('trims only trailing slashes, and leaves the rest of the URL alone', () => {
    expect(stripTrailingSlashes('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(stripTrailingSlashes('http://localhost:3000///')).toBe('http://localhost:3000');
    expect(stripTrailingSlashes('http://localhost:3000')).toBe('http://localhost:3000');
    expect(stripTrailingSlashes('http://localhost:3000/api/v1')).toBe(
      'http://localhost:3000/api/v1',
    );
  });

  it('handles the degenerate inputs without special-casing them', () => {
    expect(stripTrailingSlashes('')).toBe('');
    // All-slashes reduces to empty rather than throwing or leaving one behind.
    expect(stripTrailingSlashes('////')).toBe('');
  });

  it('stays linear on the input that made the old regex quadratic', () => {
    // Slashes in the MIDDLE, with a non-slash last character — see the docblock. Nothing is
    // trimmed, which is the correct answer and also the worst case for the old implementation.
    const hostile = `http://x/${'/'.repeat(80_000)}x`;

    const started = performance.now();
    expect(stripTrailingSlashes(hostile)).toBe(hostile);
    const elapsed = performance.now() - started;

    // The old code took ~2,520 ms here and the new one ~0.1 ms. 500 ms sits far below the former
    // and far above the latter, so this fails outright on quadratic code without flaking on a
    // loaded CI runner. It is a shape assertion, not a benchmark.
    expect(elapsed).toBeLessThan(500);
  });
});
