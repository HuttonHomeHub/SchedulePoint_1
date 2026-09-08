import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **One definition of each side's projection, and this is what says so.**
 *
 * `computeRevisionDelta` cannot tell which side came from `baseline_activities` and which from
 * `activities` — the property that made baseline-vs-baseline free at ADR-0125 and makes a
 * cross-plan comparison a change of the correlation key and nothing else. It is a property of the
 * PROJECTIONS, not of the delta: the delta cannot tell the sides apart precisely because these four
 * mappings converge before it is called.
 *
 * They were closures inside `revisionCompare`, which was right while it was the only caller. The
 * second caller would have copied them, and the copy would drift — the ADR-0065 `routeOrthogonal`
 * argument, whose sharp half is that **the drift would be invisible**: each projection looks right
 * alone, and only a reader comparing a same-plan report against a cross-plan one over the same
 * activity would ever see one side missing a field the other carries. ADR-0125's own M8
 * backend-performance review found exactly that class of defect in this method once already.
 *
 * **What this catches and what it does not**, stated because a gate whose reach is unwritten gets
 * cited for more than it proves: it catches a second `activityId: r.sourceActivityId` or
 * `activityId: r.id` mapping being written anywhere in `apps/api/src` outside this module, which is
 * the shape a contributor writes when they need "the same thing but for the new route". It does NOT
 * catch a copy that renames the fields, nor one built by spreading. Those are not the failure mode;
 * copying the block is.
 */
const API_SRC = join(__dirname, '..', '..');
/** The one file entitled to define them. */
const OWNER = join('modules', 'baselines', 'revision-projections.ts');

/** The two mappings that make a row a `RevisionRow` — the head of each projection. */
const SIGNATURES = [
  /activityId:\s*r\.sourceActivityId/,
  /activityId:\s*r\.id\s*,[\s\S]{0,200}?totalFloatDays:\s*r\.totalFloat/,
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (entry.name.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('the revision projections are defined once', () => {
  const files = sourceFiles(API_SRC);

  it('scanned a non-zero number of API sources, and found the owning module among them', () => {
    // The pinned positive case. "No file re-defines them" passes perfectly against a scan that read
    // nothing at all — ADR-0108's own census gate caught itself on exactly this, and ADR-0093
    // records a green suite that could not tell "all classified" from "found nothing".
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(OWNER))).toBe(true);
  });

  it.each(SIGNATURES.map((s, i) => [i, s] as const))(
    'signature %i appears only in revision-projections.ts',
    (_i, signature) => {
      const owners = files.filter((f) => signature.test(readFileSync(f, 'utf8')));
      expect(owners.map((f) => f.slice(API_SRC.length + 1))).toEqual([OWNER]);
    },
  );

  it('the scan discriminates — it finds the signature in text that contains it', () => {
    // Verified against the scan rather than against the tree: an assertion that has never been made
    // to match is indistinguishable from one that cannot match, and this repository has shipped a
    // gate whose pattern could not see the control class it existed to protect.
    expect(SIGNATURES[0]!.test('const x = { activityId: r.sourceActivityId, code: r.code };')).toBe(
      true,
    );
    expect(
      SIGNATURES[1]!.test('{ activityId: r.id, code: r.code, totalFloatDays: r.totalFloat }'),
    ).toBe(true);
  });
});
