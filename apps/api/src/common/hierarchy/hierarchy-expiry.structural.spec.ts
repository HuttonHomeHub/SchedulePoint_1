import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The gates on the product's first aimable hard delete.**
 *
 * `retention-boundary.structural.spec.ts` protects the OTHER sweep and gives this one nothing: its
 * `OPERATIONAL_DIR` is `join(__dirname)` and non-recursive, and the accessors it forbids
 * (`prisma.plan`, `prisma.activity`, `prisma.client`…) are precisely the ones this code exists to
 * call. So the boundary is named here, scoped to this directory explicitly.
 *
 * Four things are pinned, each for a failure that is silent in production:
 *
 * 1. **The audit log is unreachable.** ADR-0085 D1 refused to relax the `ENABLE ALWAYS` triggers,
 *    so a `deleteMany` here would fail loudly — but the pin costs nothing and states the rule where
 *    the next reader is.
 * 2. **No raw SQL.** Everything is a Prisma accessor, so an identifier can never reach SQL from the
 *    data path (§14).
 * 3. **Ownership scope, never `delete_batch_id`.** The cascade leaves `resource_assignments` and
 *    `cross_plan_dependencies` unstamped (`docs/TECH_DEBT.md` #139), so a batch-keyed delete passes
 *    on an empty plan and violates a foreign key on exactly the plans that matter. The failure is
 *    invisible to every unit suite that seeds a bare plan.
 * 4. **The delete order.** Enumerated from `pg_constraint` and run end to end. A reorder is a
 *    23503 the batch can never recover from, retried hourly forever with nothing user-facing
 *    saying so — and it only fires on a resourced or programme-linked plan.
 *
 * Comments are stripped before scanning, the `staff-boundary.structural.spec.ts` lesson: this
 * file's own prose names `delete_batch_id` repeatedly and would fail its own scan otherwise.
 */
const DIR = join(__dirname);
const RUNNER = join(DIR, 'hierarchy-expiry.runner.ts');
const SERVICE = join(DIR, 'hierarchy-expiry.service.ts');
const MODULE = join(DIR, 'hierarchy.module.ts');

function sourcesUnder(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...sourcesUnder(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the hierarchy expiry cannot reach what it must not', () => {
  it('never touches the append-only audit log', () => {
    const offenders: string[] = [];
    for (const file of [RUNNER, SERVICE]) {
      const source = code(file);
      for (const name of ['auditEvent', 'audit_events']) {
        if (source.includes(name)) offenders.push(`${file} → ${name}`);
      }
    }
    expect(offenders, 'the expiry writes audit rows through AuditService and deletes none').toEqual(
      [],
    );
  });

  it('builds no raw SQL', () => {
    const offenders: string[] = [];
    for (const file of [RUNNER, SERVICE]) {
      const source = code(file);
      for (const name of ['$queryRaw', '$executeRaw', 'DELETE FROM']) {
        if (source.includes(name)) offenders.push(`${file} → ${name}`);
      }
    }
    expect(offenders, 'every delete is a Prisma accessor with a literal model name').toEqual([]);
  });

  it('derives its scope from ownership, never from delete_batch_id', () => {
    // The runner takes ids and nothing else. A `deleteBatchId` appearing in it means somebody
    // reintroduced the batch key — which passes every bare-plan test and fails on resourced plans.
    expect(code(RUNNER)).not.toContain('deleteBatchId');
    expect(code(RUNNER)).not.toContain('delete_batch_id');
  });

  it('deletes in the verified foreign-key order', () => {
    // **Consecutive repeats collapse; non-adjacent ones do not.** One table may take several
    // statements — the cross-plan pass is split in two and every list is chunked — so a raw
    // sequence would change whenever the chunking did. What must never happen is returning to a
    // table after moving past it, and that still fails here.
    const raw = [...code(RUNNER).matchAll(/tx\.(\w+)\.deleteMany/g)].map((m) => m[1]);
    const order = raw.filter((name, i) => name !== raw[i - 1]);
    expect(order).toEqual([
      'crossPlanDependency',
      'activityDependency',
      'resourceAssignment',
      'activityStep',
      'note',
      'baselineAssignment',
      'baselineActivity',
      'baseline',
      'planShare',
      'activity',
      'plan',
      'calendarException',
      'calendar',
      'project',
      'client',
    ]);
  });

  it('is not exported from its module, and no controller can call it', () => {
    // A sweep that anything can invoke is an endpoint that permanently deletes customer work.
    // Nest's `exports` array is the whole boundary: unexported, no other module can inject it.
    const moduleSource = code(MODULE);
    expect(moduleSource).toContain('HierarchyExpiryService');
    const exportsBlock = /exports:\s*\[([^\]]*)\]/.exec(moduleSource)?.[1] ?? '';
    expect(exportsBlock).not.toContain('HierarchyExpiryService');
  });

  it('is imported by nothing outside this directory', () => {
    // The module boundary above is Nest's. This is the language's: a direct import would let any
    // file construct one and call `sweepNow()` on demand.
    const offenders: string[] = [];
    for (const file of sourcesUnder(join(__dirname, '..', '..'))) {
      if (file.startsWith(DIR)) continue;
      const source = code(file);
      if (source.includes('HierarchyExpiryService') || source.includes('deleteExpiredScope')) {
        offenders.push(file);
      }
    }
    expect(offenders, 'nothing outside common/hierarchy may reach the expiry').toEqual([]);
  });
});
