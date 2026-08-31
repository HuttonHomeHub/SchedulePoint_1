import type { ResourceHistogramBucket, ResourceHistogramSeries } from '@repo/types';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_STACK_CAP, stackSeries } from '../model/stack-series';

import { ResourceStackChart } from './ResourceStackChart';

/**
 * **The chart had no test file at all**, which three reviews found separately and the plan had
 * required in writing. Everything below is a property somebody could otherwise break silently:
 * every legend entry is real text (the chart itself is `aria-hidden`, so the legend is the only
 * place a colour is named), the aggregate says how many resources it stands for, a zero-load plan
 * does not produce `NaN` geometry, and adjacent bands carry the ground-coloured boundary the whole
 * WCAG 1.4.11 argument rests on.
 */
const BUCKETS: ResourceHistogramBucket[] = [
  { start: '2026-01-05', end: '2026-01-12' },
  { start: '2026-01-12', end: '2026-01-19' },
];

function series(id: string, values: number[]): ResourceHistogramSeries {
  return { resourceId: id, values, total: values.reduce((a, b) => a + b, 0) };
}

const NEUTRAL = { fill: 'var(--muted-foreground)', ink: 'var(--background)' };

function stacked(input: readonly ResourceHistogramSeries[], cap?: number) {
  return stackSeries(input, BUCKETS.length, {
    resourceName: (id) => `Resource ${id}`,
    neutral: NEUTRAL,
    ...(cap === undefined ? {} : { cap }),
  });
}

describe('ResourceStackChart', () => {
  it('names every band in the legend, in rank order, with its total', () => {
    const model = stacked([series('a', [4, 2]), series('b', [10, 8])]);
    render(<ResourceStackChart stacked={model} buckets={BUCKETS} />);

    const legend = screen.getByRole('list', { name: 'Legend' });
    const items = within(legend).getAllByRole('listitem');
    // Descending total: 'b' totals 18, 'a' totals 6.
    expect(items.map((li) => li.textContent)).toEqual(['Resource b18', 'Resource a6']);
  });

  it('names the aggregate with the number of resources it stands for', () => {
    const many = Array.from({ length: DEFAULT_STACK_CAP + 3 }, (_, i) =>
      series(`r${String(i).padStart(2, '0')}`, [DEFAULT_STACK_CAP + 3 - i, 1]),
    );
    render(<ResourceStackChart stacked={stacked(many)} buckets={BUCKETS} />);

    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText('Other (3 resources)')).toBeInTheDocument();
    // Capped bands plus one aggregate — the chart summarises, and says by how much.
    expect(within(legend).getAllByRole('listitem')).toHaveLength(DEFAULT_STACK_CAP + 1);
  });

  it('uses the singular for a one-resource aggregate', () => {
    const many = Array.from({ length: DEFAULT_STACK_CAP + 1 }, (_, i) =>
      series(`r${String(i).padStart(2, '0')}`, [DEFAULT_STACK_CAP + 1 - i, 1]),
    );
    render(<ResourceStackChart stacked={stacked(many)} buckets={BUCKETS} />);
    expect(screen.getByText('Other (1 resource)')).toBeInTheDocument();
  });

  it('renders a plan whose every value is zero without producing NaN geometry', () => {
    // Assignments with no budgeted units are a real state, and `PLOT_HEIGHT / 0` is not a number.
    const model = stacked([series('a', [0, 0]), series('b', [0, 0])]);
    const { container } = render(<ResourceStackChart stacked={model} buckets={BUCKETS} />);
    expect(container.innerHTML).not.toContain('NaN');
    expect(screen.getByRole('list', { name: 'Legend' })).toBeInTheDocument();
  });

  it('keeps the plot out of the accessibility tree', () => {
    // The table is the text equivalent; a second, wordless copy of the same numbers is noise.
    const { container } = render(
      <ResourceStackChart stacked={stacked([series('a', [4, 2])])} buckets={BUCKETS} />,
    );
    expect(container.querySelector('[aria-hidden="true"][style*="height"]')).not.toBeNull();
  });

  it('separates adjacent bands with a ground-coloured boundary', () => {
    // WCAG 1.4.11: adjacent fills never have to clear 3:1 against each other because a boundary in
    // the ground colour always sits between them. This chart shipped with bare backgrounds and no
    // boundary at all, while the canvas painter drew one — the argument was true of one renderer
    // and asserted of both. Verified red against that state.
    const model = stacked([series('a', [40, 20]), series('b', [40, 20])]);
    const { container } = render(<ResourceStackChart stacked={model} buckets={BUCKETS} />);
    const bordered = [...container.querySelectorAll('span[style]')].filter((el) =>
      el.getAttribute('style')?.includes('border-bottom'),
    );
    expect(bordered.length).toBeGreaterThan(0);
    for (const el of bordered) {
      expect(el.getAttribute('style')).toContain('var(--card)');
    }
  });

  it('omits the boundary where a band is too thin for it to separate anything', () => {
    // One dominant trade and a sliver: a 1 px rule on a sub-2 px band is half the band.
    const model = stacked([series('a', [1000, 1000]), series('b', [1, 1])]);
    const { container } = render(<ResourceStackChart stacked={model} buckets={BUCKETS} />);
    const bordered = [...container.querySelectorAll('span[style]')].filter((el) =>
      el.getAttribute('style')?.includes('border-bottom'),
    );
    expect(bordered).toHaveLength(0);
  });
});
