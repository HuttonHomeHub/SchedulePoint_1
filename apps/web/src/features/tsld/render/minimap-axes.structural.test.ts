import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The minimap's axis asymmetry is deliberate, and both halves are pinned** (M1-T2).
 *
 * x MUST go through `screenXOfDay` — the one day→px transform — so the minimap can never
 * disagree with the scene, the ruler or the export about where a day is (the ADR-0059
 * "the time axis is shared, not reimplemented" rule).
 *
 * y MUST NOT go through `screenYOfLane` or `LANE_HEIGHT`: both hardcode the 28 px lane row,
 * and the minimap's whole point on the lane axis is to compress it. The same pin refuses
 * `cull()`/`activityRect()` — measured to return 255 of 2,160 bars at a whole-plan viewport
 * (input-performance §5), because `Viewport` can pan Y but never compress lane spacing.
 * Each of these is the "obvious reuse" a future simplification would reach for, and each
 * one is a correctness bug here; a docblock alone would not stop the PR that looks like a
 * tidy-up.
 */
describe('minimap axis asymmetry', () => {
  const source = readFileSync(join(import.meta.dirname, 'minimap.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('x goes through screenXOfDay', () => {
    expect(code).toMatch(/screenXOfDay\(/);
  });

  it('y does not go through screenYOfLane, LANE_HEIGHT, cull or activityRect', () => {
    for (const banned of ['screenYOfLane', 'LANE_HEIGHT', 'cull(', 'activityRect(']) {
      expect(code, `minimap.ts must not reference ${banned}`).not.toContain(banned);
    }
  });
});
