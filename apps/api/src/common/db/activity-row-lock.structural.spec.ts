import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every multi-row write to `activities` locks its rows in id order first, or says why it need not
 * (`docs/TECH_DEBT.md` #440, widened by #492).
 *
 * The defect is a deadlock between writers that do not exclude each other (the lock-free placement
 * writers, the recalculation's result write, the delete cascade), and it is a statement about the
 * ORDER of two statements inside a method, so no behavioural test can pin it for every future
 * writer: a new bulk write that forgets the seam passes every suite until two batches overlap in
 * production. This reads the shape instead.
 *
 * **Found by structure, refused by declaration** (ADR-0124): a raw template whose text updates
 * `activities`, or a Prisma `activity.updateMany` / `updateManyAndReturn` that is not a single-row
 * write by primary key, is a writer wherever it lives under `modules/` or `common/`, whatever the
 * method is called. (#440 scanned `modules/` and raw templates only, which is why the delete
 * cascade, a Prisma `updateMany` in `common/`, was invisible to it until #492.) It passes when its
 * method calls one of the id-order seams before the statement, or when the method's docblock ends
 * in `lock-order: <kind> — <reason>` and the reason names BOTH the recalculation engine and the
 * placement writers. Both, because the placement writers take the pen and not the plan lock: the
 * old `plan-lock` declaration named only the engine, and was true of neither writer it excused.
 */

const SRC = join(__dirname, '../..');
const SCANNED = [join(SRC, 'modules'), join(SRC, 'common')];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const RAW_TAGS = new Set(['$executeRaw', '$queryRaw']);
const UPDATES_ACTIVITIES = /\bUPDATE\s+activities\b/i;
const SEAMS = [
  'lockActivityRowsInIdOrder(',
  'lockPlanActivityRowsInIdOrder(',
  'lockActivityIdsInIdOrder(',
];
const PRISMA_ACTIVITY_WRITE = /(?:^|\.)activity\.(?:updateMany|updateManyAndReturn)$/;
/** An equality on the primary key (`id: x`, shorthand `id,`) writes one row, which cannot interleave. */
const SINGLE_ROW_BY_ID = /[{,]\s*id\s*(?:,|:(?!\s*\{)|\})/;
const DECLARATION = /lock-order:\s*[\w-]+\s*[—-]\s*([^]*?)\*\//;

/** True when a docblock's `lock-order:` reason names both the engine and the placement writers. */
function declares(docblock: string): boolean {
  const reason = DECLARATION.exec(docblock)?.[1] ?? '';
  return /\b(?:engine|recalculation)\b/i.test(reason) && /\bplacement\b/i.test(reason);
}

function isActivityWrite(node: ts.Node, file: ts.SourceFile): boolean {
  if (ts.isTaggedTemplateExpression(node)) {
    return (
      RAW_TAGS.has(node.tag.getText(file).split('.').pop() ?? '') &&
      UPDATES_ACTIVITIES.test(node.template.getText(file))
    );
  }
  if (!ts.isCallExpression(node) || !PRISMA_ACTIVITY_WRITE.test(node.expression.getText(file))) {
    return false;
  }
  return !SINGLE_ROW_BY_ID.test(node.arguments[0]?.getText(file) ?? '');
}

interface Writer {
  method: string;
  ordered: boolean;
}

/** Every multi-row activity write in `source`, and whether its method locks or declares. */
export function activityWriters(source: string): Writer[] {
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true);
  const writers: Writer[] = [];
  const visit = (node: ts.Node): void => {
    if (isActivityWrite(node, file)) {
      let method: ts.Node | undefined = node.parent;
      while (method && !ts.isMethodDeclaration(method) && !ts.isFunctionDeclaration(method)) {
        method = method.parent;
      }
      const name = method && 'name' in method ? (method.name?.getText(file) ?? '?') : '<top level>';
      const before = method ? source.slice(method.getFullStart(), node.getStart(file)) : '';
      const locks = SEAMS.some((seam) => before.includes(seam));
      const declared = method
        ? declares(source.slice(method.getFullStart(), method.getStart(file)))
        : false;
      writers.push({ method: name, ordered: locks || declared });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return writers;
}

/** The methods of `source` that write many activity rows and neither lock nor declare. */
export function unorderedActivityWriters(source: string): string[] {
  return activityWriters(source)
    .filter((writer) => !writer.ordered)
    .map((writer) => writer.method);
}

describe('multi-row activity writers lock in id order', () => {
  it('finds every multi-row activity write under modules/ and common/ and holds each to the rule', () => {
    const writers = new Set<string>();
    const offenders: string[] = [];
    for (const path of SCANNED.flatMap(sourceFiles)) {
      const found = activityWriters(readFileSync(path, 'utf8'));
      if (found.length === 0) continue;
      writers.add(relative(SRC, path));
      offenders.push(
        ...found.filter((w) => !w.ordered).map((w) => `${relative(SRC, path)} ${w.method}`),
      );
    }
    // Pinned so a rename that hides the writers from this scan fails here rather than passing empty.
    expect([...writers].sort()).toEqual([
      'common/hierarchy/hierarchy-lifecycle.service.ts',
      'modules/activities/activities.service.ts',
      'modules/activities/activity.repository.ts',
      'modules/schedule/schedule.repository.ts',
    ]);
    expect(offenders).toEqual([]);
  });

  it('is red when a writer forgets the seam', () => {
    const forgot = `
      class R {
        async bulk(db: Tx) {
          return db.$executeRaw\`UPDATE activities AS a SET lane_index = 1 FROM unnest(\${ids}::uuid[]) AS v(id) WHERE a.id = v.id\`;
        }
      }`;
    expect(unorderedActivityWriters(forgot)).toEqual(['bulk']);
  });

  it('is red when a Prisma updateMany over many rows forgets the seam', () => {
    const cascade = `
      class S {
        async sweep(tx: Tx, planIds: string[]) {
          return tx.activity.updateMany({ where: { planId: { in: planIds }, deletedAt: null }, data });
        }
        async sweepReturning(tx: Tx, ids: string[]) {
          return tx.activity.updateManyAndReturn({ where: { id: { in: ids } }, data });
        }
      }`;
    expect(unorderedActivityWriters(cascade)).toEqual(['sweep', 'sweepReturning']);
  });

  it('lets a single-row write by primary key through', () => {
    const single = `
      class S {
        async bump(tx: Tx, activityId: string) {
          return tx.activity.updateMany({ where: { id: activityId, version: 1 }, data });
        }
        async bumpShorthand(db: Tx, id: string) {
          return db.activity.updateManyAndReturn({ where: this.active({ id, version: 1 }), data });
        }
      }`;
    expect(unorderedActivityWriters(single)).toEqual([]);
  });

  it('is green when the seam runs first, or the lock order is declared with a reason', () => {
    const locked = `
      class R {
        async bulk(db: Tx) {
          await lockActivityRowsInIdOrder(db, org, plan, ids);
          return db.$executeRaw\`UPDATE activities AS a SET lane_index = 1 WHERE true\`;
        }
      }`;
    const cascadeLocked = `
      class S {
        async sweep(tx: Tx, planIds: string[]) {
          await lockPlanActivityRowsInIdOrder(tx, planIds);
          return tx.activity.updateMany({ where: { planId: { in: planIds } }, data });
        }
      }`;
    const declared = `
      class R {
        /**
         * lock-order: disjoint-rows — the recalculation engine and the placement writers only
         * select active rows, and this writes soft-deleted ones.
         */
        async restore(tx: Tx) {
          return tx.activity.updateMany({ where: { deleteBatchId: batch }, data });
        }
      }`;
    expect(unorderedActivityWriters(locked)).toEqual([]);
    expect(unorderedActivityWriters(cascadeLocked)).toEqual([]);
    expect(unorderedActivityWriters(declared)).toEqual([]);
  });

  it('refuses a declaration with no reason, or one that names only the engine', () => {
    const base = (reason: string) => `
      class R {
        /**
         * lock-order: plan-lock${reason}
         */
        async parents(db: Tx) {
          return db.$executeRaw\`UPDATE activities AS a SET parent_id = null WHERE true\`;
        }
      }`;
    expect(unorderedActivityWriters(base(''))).toEqual(['parents']);
    // The old #440 wording: true of the engine, silent about the pen-only placement writers.
    expect(
      unorderedActivityWriters(
        base(' — the plan advisory lock excludes the recalculation, so no row pre-lock is needed.'),
      ),
    ).toEqual(['parents']);
    expect(
      unorderedActivityWriters(
        base(
          ' — the plan lock excludes the recalculation engine, and the placement writers never touch parent_id.',
        ),
      ),
    ).toEqual([]);
  });

  it('is red when the seam runs after the statement rather than before it', () => {
    const late = `
      class R {
        async bulk(db: Tx) {
          await db.$executeRaw\`UPDATE activities SET lane_index = 1 WHERE true\`;
          await lockActivityRowsInIdOrder(db, org, plan, ids);
        }
      }`;
    expect(unorderedActivityWriters(late)).toEqual(['bulk']);
  });

  it('has the single DELETE take the plan advisory lock', () => {
    const text = readFileSync(join(SRC, 'modules/activities/activities.service.ts'), 'utf8');
    const start = text.indexOf('\n  async remove(');
    const end = text.indexOf('\n  /**', start);
    expect(start).toBeGreaterThan(-1);
    expect(text.slice(start, end)).toContain('acquirePlanWriteLock(tx, existing.planId)');
  });
});
