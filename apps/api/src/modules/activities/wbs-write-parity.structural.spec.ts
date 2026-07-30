import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf8');
}

/**
 * The recalc parity gate for the WBS-improvements epic, argued STRUCTURALLY rather than observed.
 *
 * The epic adds two WBS write paths — the batch membership write (`updateParents`) and dissolve
 * (`dissolveSummary`) — and both change `parent_id`, which the engine's WBS rollup reads. The claim
 * being pinned here is narrow but load-bearing: **they change what the engine will be given, never
 * what the engine does with it.** They write a column and stop; the next `POST …/schedule/recalculate`
 * produces whatever it produces. So ADR-0034's golden and conformance suites remain valid without
 * rebaselining, and that is a property of the code's shape rather than a claim in a commit message.
 *
 * The behavioural half — that dissolve loses no activity, and that a batch is all-or-nothing — lives
 * in `test/activities.e2e-spec.ts` against a real Postgres.
 */
describe('WBS write parity (structural)', () => {
  const service = readSource('./activities.service.ts');

  it('the activities service never imports the CPM engine', () => {
    // `schedule/duration-type/resolve-triad` is a pure service-boundary helper and deliberately NOT
    // under `engine/` (ADR-0040) — this asserts the engine directory specifically.
    const engineImports = [...service.matchAll(/from '[^']*schedule\/engine[^']*'/g)];
    expect(engineImports).toEqual([]);
  });

  it('neither WBS write path calls computeSchedule or recalculate', () => {
    for (const method of ['updateParents', 'dissolveSummary']) {
      const start = service.indexOf(`async ${method}(`);
      expect(start, `${method} should exist`).toBeGreaterThan(-1);
      // Up to the next top-level method — enough to cover the whole body.
      const body = service.slice(start, service.indexOf('\n  }\n', start));
      expect(body).not.toMatch(/computeSchedule|\brecalculate\b/);
    }
  });

  it('the batch write touches parent_id and nothing else the engine consumes', () => {
    const repository = readSource('./activity.repository.ts');
    const start = repository.indexOf('async updateParents(');
    const statement = repository.slice(start, repository.indexOf('`;', start));
    // The SET list: parent_id plus the three bookkeeping columns every user write bumps. A date or
    // duration appearing here would mean a membership edit had silently become a scheduling one.
    const setColumns = [...statement.matchAll(/^\s{10}(\w+) =/gm)].map((m) => m[1]);
    expect(setColumns).toEqual(['version', 'updated_by', 'updated_at']);
    expect(statement).toMatch(/SET parent_id = NULLIF\(v\.parent_id, ''\)::uuid/);
  });
});
