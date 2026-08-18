import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Which `AuditService` method a producer is allowed to call, decided by whether it has a
 * transaction to join (ADR-0072, ADR-0073 C4.1).
 *
 * **Why a source-reading test rather than a behavioural one.** The property is "if this insert
 * throws, what happens to the caller?" — and the two answers differ only on a failure the
 * application cannot be made to produce on demand: `audit_events` has no dependencies, no cascade
 * and one index pair, so short of disabling a trigger there is no way to make it refuse an INSERT
 * from inside a test. Every seam that could be tested behaviourally already is; this covers the one
 * that cannot, by checking the thing that is actually decidable — which method the call site names.
 *
 * `record()` fails its caller on purpose: a mutation that audits must not commit without its row.
 * `recordBestEffort()` catches and logs: it exists for producers with **no transaction to roll
 * back**, where failing the caller would turn a logging fault into an outage.
 *
 * C4.1 found the interchange producer calling `record()` from outside both of the import's
 * transactions, with a comment above it describing the opposite trade. The plan is durably created
 * by that point, so a throw would have returned 500 for a successful import — inviting a retry that
 * creates a **second** plan — and skipped the lane packing and the pen release on the way out.
 */
const API_SRC = join(__dirname, '..', '..');

/** Producers that fire with no transaction to join, and must not fail their caller. */
const TRANSACTIONLESS_PRODUCERS = [
  // The import's provenance row, written after the point of no return (ADR-0073 C3.4).
  'modules/interchange/interchange.service.ts',
  // The authentication family, fired from Better Auth's hook chain outside Nest's pipeline.
  'common/auth/auth.module.ts',
] as const;

function sourceOf(relative: string): string {
  return readFileSync(join(API_SRC, relative), 'utf8');
}

/** Every `audit.record(` / `.recordBestEffort(` call in a file, comments stripped. */
function auditCalls(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [...withoutComments.matchAll(/audit\.(record|recordBestEffort)\(/g)].map((m) => m[1]!);
}

describe('audit producer seams (ADR-0072)', () => {
  it('uses recordBestEffort wherever there is no transaction to roll back', () => {
    for (const file of TRANSACTIONLESS_PRODUCERS) {
      const calls = auditCalls(sourceOf(file));
      expect(calls.length, `${file}: expected at least one audit call`).toBeGreaterThan(0);
      expect(calls, file).not.toContain('record');
    }
  });

  it('uses the transactional record() everywhere else', () => {
    // The complement, so the rule is a rule rather than an exception list. A producer that joins a
    // transaction and then swallows its own failure would let the mutation commit with no record —
    // the one outcome an audit log cannot survive, and the one no screen would reveal.
    const transactional = [
      'modules/activities/activities.service.ts',
      'modules/dependencies/dependencies.service.ts',
      'modules/calendars/calendars.service.ts',
      'modules/resources/resources.service.ts',
      'modules/baselines/baselines.service.ts',
      'modules/plans/plans.service.ts',
      // The retention expiry (ADR-0096 D8). The strongest case for the rule in the catalogue: the
      // deletion is permanent, so "the row failed and the delete committed" would destroy customer
      // work with nothing anywhere saying it happened.
      'common/hierarchy/hierarchy-expiry.service.ts',
    ];
    for (const file of transactional) {
      const calls = auditCalls(sourceOf(file));
      expect(calls.length, `${file}: expected at least one audit call`).toBeGreaterThan(0);
      expect(calls, file).not.toContain('recordBestEffort');
    }
  });
});
