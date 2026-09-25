import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { WIDEST_LINK_STROKE_PX } from './link-tracks';

const RENDER = dirname(fileURLToPath(import.meta.url));

/**
 * **The port offset's upper bound reads the painter's widest stroke** (links-and-labels M4 component
 * review). `portOffsetBounds` keeps a split track's stroke inside the node's disc using
 * `WIDEST_LINK_STROKE_PX`, and the painter writes that width as a bare literal (the highlighted
 * driving link). Nothing tied the two but a comment, so a heavier highlight would have broken the
 * bound with every test green. This asserts the constant equals the widest literal stroke the
 * painter sets, in either direction.
 */
describe('WIDEST_LINK_STROKE_PX', () => {
  it('equals the widest literal line width the painter writes', () => {
    const paint = readFileSync(join(RENDER, 'paint.ts'), 'utf8');
    const widths = [...paint.matchAll(/\.lineWidth = (\d+(?:\.\d+)?);/g)].map((m) => Number(m[1]));
    // Not vacuous: the painter writes literal widths, among them the highlighted driving link's.
    expect(widths.length).toBeGreaterThan(10);
    expect(Math.max(...widths)).toBe(WIDEST_LINK_STROKE_PX);
  });
});
