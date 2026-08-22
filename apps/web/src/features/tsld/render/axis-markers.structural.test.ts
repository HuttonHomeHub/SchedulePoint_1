import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RENDER = dirname(fileURLToPath(import.meta.url));

/**
 * **The calm-band invariant, as a structural claim** (`docs/specs/canvas-axis-markers/` §4.2).
 *
 * The persistent marker row is a function of `(viewport, scene)` only; the transient cursor row is a
 * function of the pointer only. Disjoint inputs mean "a persistent label jumped when I moved the
 * mouse" is impossible by construction rather than by care.
 *
 * **The compiler is the real enforcement** — `axisMarkers()` takes no pointer parameter and
 * `cursorReadout()` takes no marker parameter, so making one depend on the other requires changing
 * a signature a reviewer sees. This file is the weaker instrument on top, and its blind spot is
 * worth stating: it reads source text, so it would not notice a pointer reaching `axisMarkers`
 * through a field of `AxisMarkerScene` that a caller had stuffed a cursor day into. What it does
 * catch is the cheap, likely edit — an import of one module by the other, or a parameter added.
 */
describe('the two marker rows cannot see each other', () => {
  const axis = readFileSync(join(RENDER, 'axis-markers.ts'), 'utf8');
  const cursor = readFileSync(join(RENDER, 'cursor-readout.ts'), 'utf8');

  it('axis-markers imports neither the cursor readout nor the gesture machine', () => {
    expect(axis).not.toMatch(/from\s+['"][^'"]*cursor-readout/);
    expect(axis).not.toMatch(/from\s+['"][^'"]*gesture-machine/);
  });

  it('the cursor readout does not import the marker model', () => {
    expect(cursor).not.toMatch(/from\s+['"][^'"]*axis-markers/);
  });

  it('axisMarkers names no pointer in its parameter list', () => {
    const signature = /export function axisMarkers\(([\s\S]*?)\): AxisMarkerModel/.exec(axis)?.[1];
    expect(signature, 'axisMarkers signature not found').toBeDefined();
    expect(signature ?? '').not.toMatch(/point|pointer|cursor|gesture/i);
  });

  it('axis-markers imports the geometry LEAF, never the barrel', () => {
    // ADR-0078 §3a: `render-model` re-exports everything, so any import back through it rebuilds
    // the cycle #106 removed. Asserted here as well as in `geometry-is-a-leaf.structural.test.ts`
    // so a reader of this module finds the rule beside the module it governs.
    expect(axis).not.toMatch(/from\s+['"][^'"]*render-model(\.js|\.ts)?['"]/);
    expect(axis).toMatch(/from\s+['"]\.\/geometry['"]/);
  });
});
