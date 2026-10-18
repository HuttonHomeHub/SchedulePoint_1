import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { KeyValueList, KeyValueListSkeleton } from './key-value-list';
import { PageHeader, PageHeaderSkeleton } from './page-header';
import { StatGrid, StatGridSkeleton } from './stat-grid';

/**
 * The panel and page-header skeletons draw their archetype's real labels in the archetype's own grid, so a
 * panel that settles moves nothing above or beside its labels. Geometry itself is judged in a
 * browser (`measure-loading-shapes.mjs`); jsdom lays nothing out, so these pin the shared classes.
 */
describe('StatGridSkeleton', () => {
  const items = [{ label: 'Failed in the last hour' }, { label: 'Last failure', sub: true }];

  it('shows the real labels and hides the whole grid from assistive technology', () => {
    const { container } = render(<StatGridSkeleton columns={3} items={items} />);
    expect(screen.getByText('Failed in the last hour')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the settled grid’s own layout classes', () => {
    const settled = render(
      <StatGrid
        columns={3}
        items={[
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
        ]}
      />,
    ).container.querySelector('dl');
    const skeleton = render(
      <StatGridSkeleton columns={3} items={[{ label: 'A' }, { label: 'B' }]} />,
    ).container.querySelector('dl');
    expect(skeleton?.className).toBe(settled?.className);
  });

  it('draws a value block of the figure’s line height and a sub block only where asked', () => {
    const { container } = render(<StatGridSkeleton items={items} />);
    expect(container.querySelectorAll('.h-7')).toHaveLength(2);
    expect(container.querySelectorAll('.h-4')).toHaveLength(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(<StatGridSkeleton items={items} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('KeyValueListSkeleton', () => {
  const items = [{ label: 'App version' }, { label: 'Email confirmation', consequence: true }];

  it('shows the real labels and hides the whole list from assistive technology', () => {
    const { container } = render(<KeyValueListSkeleton items={items} />);
    expect(screen.getByText('Email confirmation')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the settled list’s own layout classes', () => {
    const settled = render(
      <KeyValueList items={[{ label: 'A', value: 'x' }]} />,
    ).container.querySelector('dl');
    const skeleton = render(
      <KeyValueListSkeleton items={[{ label: 'A' }]} />,
    ).container.querySelector('dl');
    expect(skeleton?.className).toBe(settled?.className);
  });

  it('draws a consequence line only for an item that has one', () => {
    const { container } = render(<KeyValueListSkeleton items={items} />);
    expect(container.querySelectorAll('.h-5')).toHaveLength(2);
    expect(container.querySelectorAll('.h-4')).toHaveLength(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(<KeyValueListSkeleton items={items} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('PageHeaderSkeleton', () => {
  it('hides itself and renders no heading or live control', () => {
    const { container } = render(<PageHeaderSkeleton description aside actions={2} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('h1, button, a, input')).toBeNull();
  });

  it('draws a title block plus one block per action asked for, and nothing else', () => {
    // title + 2 actions; no description, no aside.
    expect(
      render(<PageHeaderSkeleton actions={2} />).container.querySelectorAll('[data-skeleton]'),
    ).toHaveLength(3);
    expect(
      render(<PageHeaderSkeleton />).container.querySelectorAll('[data-skeleton]'),
    ).toHaveLength(1);
  });

  it('uses the settled header’s own row and title-column classes', () => {
    const settled = render(<PageHeader title="Northgate" />).container.firstElementChild;
    const skeleton = render(<PageHeaderSkeleton />).container.firstElementChild;
    expect(skeleton?.className).toBe(settled?.className);
    expect(skeleton?.firstElementChild?.className).toBe(settled?.firstElementChild?.className);
  });

  it('takes the title line height of the h1 (text-2xl, 2rem)', () => {
    const { container } = render(<PageHeaderSkeleton />);
    expect(container.querySelector('.h-8')).not.toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<PageHeaderSkeleton description aside actions={1} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
