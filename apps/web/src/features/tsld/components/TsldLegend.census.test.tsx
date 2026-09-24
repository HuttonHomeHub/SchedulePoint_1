import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PRINT_TOKEN_SOURCES } from '../render/palette';
import { NODE_RIM_W } from '../render/render-model';

import { TsldLegend } from './TsldLegend';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * **FC-G8, the legend census for the marks the NetPoint grammar adds** (spec §4.12, conditions.md).
 *
 * A key that names a mark the canvas does not draw is worse than no key, because a planner hunts for
 * it (the logic-legibility M6 finding). So the census runs both ways: every mark key the painter
 * reads has a legend entry drawn in that key's own token, and every entry's token is one a key
 * the painter reads resolves to. The token for each key is read from `PRINT_TOKEN_SOURCES`, never
 * restated here, so a key re-pointed in the palette re-points the census with it.
 *
 * It grows by milestone: M2 adds the three node rims and their ground fill; M3 adds the link family.
 */
const NODE_MARKS = [
  { key: 'nodeRimCritical', rung: 'critical', label: 'Critical' },
  { key: 'nodeRimNear', rung: 'near', label: 'Near-critical' },
  { key: 'nodeRim', rung: 'none', label: 'On schedule' },
] as const;

const tokenOf = (key: keyof typeof PRINT_TOKEN_SOURCES): string => PRINT_TOKEN_SOURCES[key][0];

/** The painter's source without comments, so a key named only in prose does not count as read. */
const painter = readFileSync(join(HERE, '../render/paint.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('FC-G8 — the legend keys every node mark the painter draws, and nothing else', () => {
  it.each(NODE_MARKS)('the painter reads palette.$key', ({ key }) => {
    expect(painter).toMatch(new RegExp(String.raw`palette\.${key}\b`));
  });

  it.each(NODE_MARKS)(
    '$label: a node swatch ringed in var($key’s token) at the rung’s weight, filled with the ground',
    ({ key, rung, label }) => {
      render(<TsldLegend />);
      const item = screen.getByText(label).closest('li');
      const node = item?.querySelector<HTMLElement>('[data-legend-node]');
      expect(node, `${label} has no node swatch`).not.toBeNull();
      expect(node!.style.border).toBe(`${NODE_RIM_W[rung]}px solid var(${tokenOf(key)})`);
      // The screen's ground: paper's is `--print` (PRINT_TOKEN_SOURCES), the legend is on screen.
      expect(node!.style.backgroundColor).toBe('var(--canvas)');
    },
  );

  it('every node swatch in the legend is ringed in a token a painted node key resolves to', () => {
    render(<TsldLegend />);
    const allowed = new Set(NODE_MARKS.map(({ key }) => `var(${tokenOf(key)})`));
    const nodes = screen
      .getByRole('list', { name: 'Legend' })
      .querySelectorAll<HTMLElement>('[data-legend-node]');
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      const ink = /var\(--[\w-]+\)/.exec(node.style.border)?.[0] ?? node.style.border;
      // A node swatch in a non-criticality lens mode is ringed in the foreground: the lens owns
      // the colour there and the swatch shows weight alone, which is the channel that survives.
      expect(allowed.has(ink) || ink === 'var(--foreground)', ink).toBe(true);
    }
  });
});

/** M3 (spec §4.2 G5): the violet link family and its marks. */
const LINK_LINES = [
  { key: 'linkDriving', label: 'Driving link' },
  { key: 'linkMinor', label: 'Non-driving link' },
] as const;

describe('FC-G8 — the legend keys the link family the painter draws (M3)', () => {
  it.each([...LINK_LINES.map(({ key }) => key), 'linkMark', 'attachDot'] as const)(
    'the painter reads palette.%s',
    (key) => {
      expect(painter).toMatch(new RegExp(String.raw`palette\.${key}\b`));
    },
  );

  it.each(LINK_LINES)('$label: a line swatch in var($key’s token)', ({ key, label }) => {
    render(<TsldLegend />);
    const item = screen.getByText(label, { exact: true }).closest('li');
    const line = item?.querySelector<HTMLElement>('span[style*="border-top"]');
    expect(line, `${label} has no line swatch`).not.toBeNull();
    expect(line!.style.borderTopColor).toBe(`var(${tokenOf(key)})`);
  });

  it('Direction: the chevron is filled in the mark shade the painter fills violet marks with', () => {
    render(<TsldLegend />);
    const item = screen.getByText('Direction', { exact: true }).closest('li');
    const mark = item?.querySelector<SVGPathElement>('[data-legend-mark]');
    expect(mark, 'Direction has no mark swatch').not.toBeNull();
    expect(mark!.style.fill).toBe(`var(${tokenOf('linkMark')})`);
  });

  it('Link joins partway along: the dot is filled in the token the painter fills dots with', () => {
    render(<TsldLegend />);
    const item = screen.getByText('Link joins partway along', { exact: true }).closest('li');
    const dot = item?.querySelector<HTMLElement>('[data-legend-attach]');
    expect(dot, 'the attachment row has no dot swatch').not.toBeNull();
    expect(dot!.style.backgroundColor).toBe(`var(${tokenOf('attachDot')})`);
  });
});
