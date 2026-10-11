import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every raw multi-row `UPDATE activities` locks its rows in id order first, or says why it need not
 * (`docs/TECH_DEBT.md` #440).
 *
 * The defect is a deadlock between the lock-free placement writers and the recalculation's result
 * write, and it is a statement about the ORDER of two statements inside a method, so no behavioural
 * test can pin it for every future writer: a new bulk `UPDATE activities` that forgets the seam
 * passes every suite until two batches overlap in production. This reads the shape instead.
 *
 * **Found by structure, refused by declaration** (ADR-0124): a raw template whose text updates
 * `activities` is a writer wherever it lives under `modules/`, whatever the method is called. It
 * passes when its method calls {@link lockActivityRowsInIdOrder} before the statement, or when the
 * method's docblock carries `lock-order: plan-lock — <reason>`, the claim that the plan advisory
 * lock already excludes the other writers. A declaration with no reason is refused.
 */

const SRC = join(__dirname, '../..');
const MODULES = join(SRC, 'modules');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const RAW_TAGS = new Set(['$executeRaw', '$queryRaw']);
const UPDATES_ACTIVITIES = /\bUPDATE\s+activities\b/i;
const DECLARATION = /lock-order:\s*plan-lock\s*[—-]\s*[^*\n]{10,}/;

/** The methods of `source` that hold a raw `UPDATE activities` and neither lock nor declare. */
export function unorderedActivityWriters(source: string): string[] {
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true);
  const offenders: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isTaggedTemplateExpression(node) &&
      RAW_TAGS.has(node.tag.getText(file).split('.').pop() ?? '') &&
      UPDATES_ACTIVITIES.test(node.template.getText(file))
    ) {
      let method: ts.Node | undefined = node.parent;
      while (method && !ts.isMethodDeclaration(method) && !ts.isFunctionDeclaration(method)) {
        method = method.parent;
      }
      const name = method && 'name' in method ? (method.name?.getText(file) ?? '?') : '<top level>';
      const before = method ? source.slice(method.getFullStart(), node.getStart(file)) : '';
      const locks = before.includes('lockActivityRowsInIdOrder(');
      const declared = method
        ? DECLARATION.test(source.slice(method.getFullStart(), method.getStart(file)))
        : false;
      if (!locks && !declared) offenders.push(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return offenders;
}

describe('multi-row activity writers lock in id order', () => {
  it('finds every raw UPDATE activities under modules/ and holds each to the rule', () => {
    const writers: string[] = [];
    const offenders: string[] = [];
    for (const path of sourceFiles(MODULES)) {
      const text = readFileSync(path, 'utf8');
      if (!UPDATES_ACTIVITIES.test(text)) continue;
      writers.push(relative(SRC, path));
      offenders.push(
        ...unorderedActivityWriters(text).map((name) => `${relative(SRC, path)} ${name}`),
      );
    }
    // Pinned so a rename that hides the writers from this scan fails here rather than passing empty.
    expect(writers.sort()).toEqual([
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

  it('is green when the seam runs first, or the plan lock is declared with a reason', () => {
    const locked = `
      class R {
        async bulk(db: Tx) {
          await lockActivityRowsInIdOrder(db, org, plan, ids);
          return db.$executeRaw\`UPDATE activities AS a SET lane_index = 1 WHERE true\`;
        }
      }`;
    const declared = `
      class R {
        /** lock-order: plan-lock — the caller holds the plan advisory lock, which excludes the engine. */
        async parents(db: Tx) {
          return db.$executeRaw\`UPDATE activities AS a SET parent_id = null WHERE true\`;
        }
      }`;
    const noReason = declared.replace(
      ' — the caller holds the plan advisory lock, which excludes the engine.',
      '',
    );
    expect(unorderedActivityWriters(locked)).toEqual([]);
    expect(unorderedActivityWriters(declared)).toEqual([]);
    expect(unorderedActivityWriters(noReason)).toEqual(['parents']);
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
    const text = readFileSync(join(MODULES, 'activities/activities.service.ts'), 'utf8');
    const start = text.indexOf('\n  async remove(');
    const end = text.indexOf('\n  /**', start);
    expect(start).toBeGreaterThan(-1);
    expect(text.slice(start, end)).toContain('acquirePlanWriteLock(tx, existing.planId)');
  });
});
