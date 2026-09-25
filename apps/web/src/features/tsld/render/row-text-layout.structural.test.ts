import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RENDER = dirname(fileURLToPath(import.meta.url));

/** Source with comments removed, so prose about a rule cannot satisfy or break it (ADR-0106). */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * The two `truncateToWidth` calls `paint.ts` keeps, and why: neither is row text. One fits the drag
 * ghost's inside label (transient feedback at the pointer), the other a pinned WBS band bar's label
 * (a separate band above the scene, which no link routes through). Each is identified by the text it
 * truncates, so moving a row-text call back under one of these names still fails.
 */
const ALLOWED_TRUNCATIONS = ['detail.label', 'bar.label'] as const;

/** What the rule refuses in `paint.ts`: placement calls outside the two allowed truncations. */
export function placementCallsIn(source: string): string[] {
  const found: string[] = [];
  for (const line of code(source).split('\n')) {
    if (/\bwrapTwoLines\(/.test(line)) found.push(line.trim());
    if (/\bdateLabelSlot\(/.test(line)) found.push(line.trim());
    if (
      /\btruncateToWidth\(/.test(line) &&
      !ALLOWED_TRUNCATIONS.some((a) => line.includes(`truncateToWidth(${a},`))
    ) {
      found.push(line.trim());
    }
  }
  return found;
}

/**
 * **The row's text is placed in one place** (links-and-labels M1-T2, spec §4.2).
 *
 * `row-text-layout.ts` places every name, date and centre item; the painter only draws what it
 * returns, and the router (M2) reads the same result. The day a layer in `paint.ts` truncates,
 * wraps or slots a label of its own again, the painter and the router hold two opinions about where
 * the text is, and each would look right alone. So the three placement helpers are refused in
 * `paint.ts`.
 *
 * **One deviation from the spec, found by writing this test.** Spec §4.2 refuses `truncateToWidth`
 * in `paint.ts` outright, and two calls there are not row text (`ALLOWED_TRUNCATIONS`). They are
 * pinned by name and count rather than moved, because moving them would put transient and
 * band-only text into the module the router reads.
 *
 * Its blind spot: it reads source text, so a placement written without these helpers (inline
 * arithmetic) would pass. What it catches is the likely edit, restoring a helper call in a layer.
 */
describe('placement lives in row-text-layout.ts, not in the painter', () => {
  const paint = readFileSync(join(RENDER, 'paint.ts'), 'utf8');

  it('paint.ts makes no placement call outside the two named truncations', () => {
    expect(placementCallsIn(paint)).toEqual([]);
  });

  it('the two allowed truncations are exactly the two that exist', () => {
    const calls = code(paint)
      .split('\n')
      .filter((l) => /\btruncateToWidth\(/.test(l));
    expect(calls).toHaveLength(ALLOWED_TRUNCATIONS.length);
  });

  it('the module holds the three helpers the painter gave up', () => {
    const layout = code(readFileSync(join(RENDER, 'row-text-layout.ts'), 'utf8'));
    for (const helper of ['truncateToWidth(', 'wrapTwoLines(', 'dateLabelSlot(']) {
      expect(layout).toContain(helper);
    }
  });

  it('pinned positive case: a placement call restored in a layer is found', () => {
    const restored = `${paint}\n  const text = truncateToWidth(labelOf(activity), budget, fit);\n`;
    expect(placementCallsIn(restored)).toHaveLength(1);
    const wrapped = `${paint}\n  const lines = wrapTwoLines(full, budget, fit);\n`;
    expect(placementCallsIn(wrapped)).toHaveLength(1);
  });

  it('pinned negative case: the same call inside a comment is not code', () => {
    const commented = `${paint}\n  // truncateToWidth(labelOf(activity), budget, fit)\n`;
    expect(placementCallsIn(commented)).toEqual([]);
  });
});
