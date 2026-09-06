import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

/**
 * **The gates on the product's first aimable hard delete.**
 *
 * `retention-boundary.structural.spec.ts` protects the OTHER sweep and gives this one nothing: its
 * `OPERATIONAL_DIR` is `join(__dirname)` and non-recursive, and the accessors it forbids
 * (`prisma.plan`, `prisma.activity`, `prisma.client`…) are precisely the ones this code exists to
 * call. So the boundary is named here, scoped to this directory explicitly.
 *
 * Five things are pinned, each for a failure that is silent in production:
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
 * 5. **Completeness, derived from the schema.** Item 4 compares the runner against a literal, so
 *    it catches a REORDER and is structurally blind to a MISSING TABLE. The census below asks the
 *    Prisma DMMF instead, and is the reason a new child of `baselines`, `plans` or `activities`
 *    cannot ship without a delete. See its own docblock.
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
      'baselineDependency',
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

  /**
   * **The completeness census — derived, because the list above structurally cannot be.**
   *
   * The order assertion catches a REORDER and is blind to a MISSING TABLE: it compares the runner
   * against a literal somebody hand-maintains, so a new child table with a RESTRICT foreign key
   * into this hierarchy ships, nothing here changes, and the list stays green while describing a
   * runner that can no longer delete a plan. The cost of that is not a failing test — it is
   * `hierarchy-expiry.service.ts` catching a 23503 and logging `hierarchy_expiry.permanent_failure`
   * hourly, forever, for every plan holding one of the new rows, with nothing user-facing saying
   * so. This is exactly what happened at `baseline_dependencies` and was caught by hand.
   *
   * So the requirement is DERIVED FROM THE SCHEMA at both ends. For every table the runner
   * deletes, the Prisma DMMF is asked which models hold a to-one foreign key into it; each of
   * those must itself be deleted by the runner, EARLIER in the order. Deriving the owner set from
   * the runner's own list rather than from a constant means adding a table to the sweep
   * automatically extends the census to that table's children.
   *
   * Two exclusions, both derived rather than assumed:
   *   * `onDelete: Cascade` — the database removes the row itself, so the runner must NOT name it.
   *     `plan_locks` is the live example and the runner says so.
   *   * a self-reference (`activities.parent_id`) — a table cannot be deleted before itself. The
   *     runner's own comment records why one statement suffices: the RI check is an AFTER ROW
   *     trigger evaluated at the END of the statement (ADR-0096 D7).
   *
   * And ONE hand-written exemption, which is stated rather than hidden because a census with a
   * silent carve-out is worse than none: `resources.calendar_id → calendars` is RESTRICT and
   * `resources` is deliberately absent from the sweep. The sweep deletes only PROJECT-scoped
   * calendars (`tx.calendar.findMany({ where: { projectId … } })`), and a resource may never bind
   * one — `calendar-scope.guard.ts:92` refuses it with RESOURCE_REQUIRES_ORG_CALENDAR (ADR-0053
   * §2) — so a resource can never reference a calendar this sweep can delete. It is a pair, not a
   * table: `Resource` is exempt only for its edge into `Calendar`, so a future `resources.plan_id`
   * would still fail here.
   *
   * **The pinned positive case is not decoration.** "Every required model appears" passes
   * perfectly over an empty derived set — the green-for-having-found-nothing failure this
   * repository keeps recording — so the census first asserts it found a substantial set including
   * the specific members whose absence this test exists to catch.
   */
  it('deletes every model that holds a RESTRICT foreign key into what it deletes', () => {
    const accessorOf = (model: string): string => model.charAt(0).toLowerCase() + model.slice(1);

    const raw = [...code(RUNNER).matchAll(/tx\.(\w+)\.deleteMany/g)].map((m) => m[1] as string);
    const order = raw.filter((name, i) => name !== raw[i - 1]);
    const positionOf = new Map(order.map((name, i) => [name, i]));

    /** `Resource` is exempt for its edge into `Calendar` ONLY — see the docblock. */
    const EXEMPT_EDGES = new Set(['Resource→Calendar']);

    const required: string[] = [];
    const missing: string[] = [];
    const misordered: string[] = [];

    for (const target of Prisma.dmmf.datamodel.models) {
      if (!positionOf.has(accessorOf(target.name))) continue;
      for (const referrer of Prisma.dmmf.datamodel.models) {
        if (referrer.name === target.name) continue; // a self-FK; see the docblock
        for (const field of referrer.fields) {
          if (field.kind !== 'object' || field.isList) continue;
          if (field.type !== target.name) continue;
          if ((field.relationFromFields ?? []).length === 0) continue; // the back-relation side
          if (field.relationOnDelete !== 'Restrict') continue; // the database handles CASCADE
          const edge = `${referrer.name}→${target.name}`;
          if (EXEMPT_EDGES.has(edge)) continue;

          required.push(edge);
          const child = positionOf.get(accessorOf(referrer.name));
          if (child === undefined) missing.push(edge);
          else if (child > (positionOf.get(accessorOf(target.name)) as number)) {
            misordered.push(edge);
          }
        }
      }
    }

    // Pinned positive case FIRST: a census over an empty set agrees with itself.
    expect(required.length).toBeGreaterThanOrEqual(15);
    expect(required).toContain('BaselineDependency→Baseline');
    expect(required).toContain('BaselineActivity→Baseline');
    expect(required).toContain('Baseline→Plan');
    expect(required).toContain('Activity→Plan');

    expect(
      missing,
      'a model with a RESTRICT foreign key into a table the expiry deletes is not deleted by it — ' +
        'the sweep will raise 23503 and retry the batch hourly, forever',
    ).toEqual([]);
    expect(misordered, 'a referencing table is deleted AFTER the table it references').toEqual([]);
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
