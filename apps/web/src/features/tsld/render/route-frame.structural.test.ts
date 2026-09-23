import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RENDER = dirname(fileURLToPath(import.meta.url));

/** Source with comments removed, so a docblock that names a function cannot count as calling it. */
function code(file: string): string {
  return readFileSync(join(RENDER, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/**
 * **The painter routes through `routeFrame`, and nowhere else** (NetPoint-layout M4-T1).
 *
 * The layout optimiser scores a layout on `routeFrame`'s output, so it is judging the picture only
 * while the painter draws that same output. A second router inside `paintScene`, such as a route call
 * added there for a new layer, would let the optimiser's score and the diagram part ways with no
 * test failing. ADR-0065's `routeOrthogonal` rule, applied one level up.
 *
 * Blind spot: this reads source text. It sees a direct call in `paint.ts` and not one reached
 * through a helper module the painter imports.
 */
describe('one router per frame', () => {
  const paint = code('paint.ts');

  it('paintScene calls routeFrame exactly once', () => {
    expect(paint.match(/\brouteFrame\(/g) ?? []).toHaveLength(1);
  });

  it('the painter calls none of the routing primitives itself', () => {
    for (const fn of [
      'routeOrthogonal',
      'dependencyPolyline',
      'dependencyPolylineTimeTrue',
      'chooseCorridorsByCrossing',
      'bundleCorridors',
      'packGutterChannels',
      'laneIntervalIndex',
    ]) {
      expect(paint, fn).not.toMatch(new RegExp(`\\b${fn}\\(`));
    }
  });

  it('route-frame does not import the painter at runtime', () => {
    // A type import is erased; a value import would make the optimiser load the whole painter.
    const src = readFileSync(join(RENDER, 'route-frame.ts'), 'utf8');
    expect(src).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+['"]\.\/paint['"]/m);
  });
});
