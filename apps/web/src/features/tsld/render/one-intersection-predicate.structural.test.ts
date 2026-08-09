import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **There is one rectangle-overlap predicate** (`docs/specs/canvas-multi-select/` M2-T2).
 *
 * A marquee sweep and a shift-click span both ask the same question — "which bars does this
 * rectangle touch?" — and both answer it through `idsIntersecting`, which answers it through
 * `rectsIntersect`. A second implementation would drift, and the drift would be **invisible**: each
 * gesture looks right on its own, and only a planner who swept and shift-clicked the same region
 * would ever see one catch a bar the other missed. That is the ADR-0065 `routeOrthogonal` argument
 * applied to selection, and it is a rule about the tree rather than about one file, so it is
 * asserted here rather than left to a docblock.
 *
 * The scan is deliberately narrow: it looks for the **arithmetic**, not for the word. Anyone can
 * call `rectsIntersect`; nobody should be writing `a.x < b.x + b.w` again.
 *
 * **Updated 2026-08-08 (ADR-0078 §3 / `docs/TECH_DEBT.md` #106): the home moved, the rule did not.**
 * `rectsIntersect` now lives in `render/geometry.ts`, the acyclic core, and `render-model.ts`
 * re-exports it — so it is still in exactly one place and every consumer's import is unchanged.
 * That distinction matters, because "a structural test was edited during a refactor" is exactly how
 * an invariant gets quietly weakened: what changed here is a path, and the assertion that there is
 * only one implementation is the same assertion, still failing if a second one appears.
 */
const TSLD = join(import.meta.dirname, '..');

/** Every `.ts`/`.tsx` source under `features/tsld`, tests excluded. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__snapshots__') continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('rectangle overlap is computed in exactly one place', () => {
  it('no module other than render-model writes the overlap arithmetic by hand', () => {
    // The shape of an AABB overlap test, however the operands are named: two `<` comparisons where
    // one side adds a width or height to a coordinate.
    const overlapArithmetic = /\.x\s*<\s*\w+\.x\s*\+\s*\w+\.w|\.y\s*<\s*\w+\.y\s*\+\s*\w+\.h/;
    const offenders = sourceFiles(TSLD)
      .filter((file) => !file.endsWith(join('render', 'geometry.ts')))
      .filter((file) => overlapArithmetic.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(TSLD.length + 1));
    expect(offenders).toEqual([]);
  });

  it('the geometry core exports the predicate the gestures share', () => {
    const model = readFileSync(join(TSLD, 'render', 'geometry.ts'), 'utf8');
    expect(model).toMatch(/export function idsIntersecting\(/);
    expect(model).toMatch(/export function rectsIntersect\(/);
    // `idsIntersecting` must go through `rectsIntersect` rather than re-deriving overlap — the
    // whole point of having one function is that the second one calls it.
    const body = /export function idsIntersecting\([\s\S]*?\n}/.exec(model)?.[0] ?? '';
    expect(body).toMatch(/rectsIntersect\(/);
  });
});
