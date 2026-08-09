import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **`geometry.ts` imports nothing from the barrel** (ADR-0078 §3, `docs/TECH_DEBT.md` #106).
 *
 * This is the whole of what #106 bought, and it needs a test because the defect it prevents is
 * **invisible**. `render-model.ts` re-exports link routing; link routing needs `activityRect`,
 * `screenXOfDay` and `BAR_HEIGHT` back. Written as one module that re-exports another which imports
 * from it, that is a genuine import cycle — and ES modules tolerate cycles at runtime, so it
 * compiles, typechecks, and passes every suite in this repository. It surfaces later, as an
 * undefined binding at module-initialisation time, in whichever consumer happens to load first
 * after somebody reorders an import.
 *
 * So the acyclicity cannot be left to a docblock: nothing would fail if a future extraction reached
 * back through the barrel for convenience, and the person doing it would have no signal at all.
 * ADR-0078 says nothing after S8 may be built on the cycle; this is what makes that enforceable
 * rather than advisory.
 *
 * The assertion is deliberately about the **core**, not about the whole tree. Other modules may and
 * do import the barrel — that is what a barrel is for. The one rule is that the leaf stays a leaf.
 */
const RENDER = import.meta.dirname;

describe('the geometry core is a leaf', () => {
  it('does not import from render-model, directly or by relative path', () => {
    const geometry = readFileSync(join(RENDER, 'geometry.ts'), 'utf8');
    // Any import specifier ending in `render-model`, with or without an extension.
    expect(geometry).not.toMatch(/from\s+['"][^'"]*render-model(\.js|\.ts)?['"]/);
  });

  it('imports only the day arithmetic and shared types', () => {
    // Pinned so a future edit has to think about what it is adding rather than adding it. A core
    // that grows dependencies stops being a core; `working-time` is here because day arithmetic is
    // upstream of geometry, and it is itself a leaf.
    const geometry = readFileSync(join(RENDER, 'geometry.ts'), 'utf8');
    const specifiers = [...geometry.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specifiers.sort()).toEqual(['./working-time', '@/lib/constraint-format', '@repo/types']);
  });

  it('the barrel re-exports the core, so no consumer import changed', () => {
    // The barrel-preserving rule (ADR-0078 §3): a refactor that moves code must not move imports.
    // Thirty consumers import from `render-model`; none of them was touched by #106, and this is
    // what keeps that true.
    const barrel = readFileSync(join(RENDER, 'render-model.ts'), 'utf8');
    expect(barrel).toMatch(/export \* from '\.\/geometry';/);
  });
});
