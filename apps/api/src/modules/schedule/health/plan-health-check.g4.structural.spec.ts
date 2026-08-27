import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **G4 — the no-cost-egress gate (spec §3.2, security review S1).**
 *
 * The health report's role-invariance rests on one fact: no cost, rate or budget field exists in
 * the response at any depth, so `cost:read` changes nothing and one URL produces one document.
 * Until this gate existed that was enforced only *by construction* — by nobody having added such a
 * field — and the plausible failure is a well-meant later edit adding `budgetedExpenseTotal` to
 * metric 10 "for completeness", which no other test would notice and which would silently make a
 * handover artefact role-dependent.
 *
 * It is a NAME check over the health sources and the response DTO — property declarations and
 * object-literal keys alike, so a cost-shaped key smuggled through `detail` (an open record) is
 * caught the same as a declared DTO field.
 *
 * **Verified red first** (ADR-0110 D5): a `budgetedExpenseTotal` property was added to the DTO,
 * this test failed naming it, and the property was removed.
 *
 * Blind spot, stated: a nested type imported from OUTSIDE these files (e.g. a future
 * `offenders: ActivitySummary[]`) is invisible to a source scan of this directory. The M5 security
 * pass reads the response shape end to end; this pins the local temptation.
 */
describe('G4 — no cost-shaped field in the health report', () => {
  const files = [
    ...readdirSync(join(__dirname))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .map((f) => join(__dirname, f)),
    join(__dirname, '..', 'dto', 'plan-health-check.dto.ts'),
  ];

  const KEY_PATTERN = /^\s+([A-Za-z_][A-Za-z0-9_]*)[!?]?\s*:/;
  const BANNED = /cost|budget|rate|expense/i;

  it('walked a non-zero number of keys (the gate cannot pass by traversing nothing)', () => {
    const keys = files.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line) => KEY_PATTERN.exec(line)?.[1])
        .filter((k): k is string => k !== undefined),
    );
    expect(keys.length).toBeGreaterThan(50);
  });

  it.each(files.map((f) => [f.split('/').slice(-2).join('/'), f]))(
    '%s declares no cost-shaped key',
    (_, file) => {
      const offending = readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ key: KEY_PATTERN.exec(line)?.[1], n: i + 1 }))
        .filter((x): x is { key: string; n: number } => x.key !== undefined && BANNED.test(x.key));
      expect(
        offending,
        `cost-shaped keys: ${offending.map((o) => `${o.key} (line ${o.n})`).join(', ')}`,
      ).toEqual([]);
    },
  );
});
