import type { BaselineVarianceRow } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * jsdom has no layout, so the real virtualizer measures a zero-height scroller and yields no rows.
 * Stub it to a pass-through that renders every row — the same treatment the Project Explorer's
 * suite gives it — so this file tests the panel's own behaviour (semantics, sorting, keyboard,
 * hierarchy) rather than jsdom's layout engine. That virtualization actually windows is a
 * browser-level property, and belongs to the Playwright journey.
 */
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * GANTT_ROW_HEIGHT,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * GANTT_ROW_HEIGHT,
        size: GANTT_ROW_HEIGHT,
      })),
    scrollToIndex: () => {},
  }),
}));

const TWO = [
  anActivity({
    id: 'a',
    code: 'A10',
    name: 'Excavate',
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
  }),
  anActivity({
    id: 'b',
    code: 'B20',
    name: 'Piling',
    earlyStart: '2026-02-09',
    earlyFinish: '2026-02-20',
  }),
];

const rows = (): HTMLElement[] =>
  screen.getAllByRole('row').filter((r) => r.getAttribute('aria-rowindex') !== '1');

describe('GanttPanel — states', () => {
  it('offers a retry when the schedule could not be loaded', () => {
    const retry = vi.fn();
    render(<GanttPanel activities={[]} error={{ message: 'Network down', retry }} />);

    expect(screen.getByText('Network down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('announces loading rather than showing an empty chart', () => {
    render(<GanttPanel activities={[]} loading />);
    expect(screen.getByText('Loading the schedule…')).toBeInTheDocument();
    expect(screen.queryByRole('treegrid')).not.toBeInTheDocument();
  });

  it('says the plan is empty rather than rendering a bare grid', () => {
    render(<GanttPanel activities={[]} />);
    expect(screen.getByText('No activities yet')).toBeInTheDocument();
  });

  // Drawing a chart here would mean inventing an anchor date and presenting it as fact.
  it('refuses to draw a chart for a plan that has never been calculated', () => {
    render(<GanttPanel activities={[anActivity({ earlyStart: null, earlyFinish: null })]} />);
    expect(screen.getByText('This plan has not been calculated')).toBeInTheDocument();
    expect(screen.queryByRole('treegrid')).not.toBeInTheDocument();
  });

  it('counts the activities correctly in the not-calculated copy', () => {
    render(
      <GanttPanel
        activities={[
          anActivity({ id: '1', earlyStart: null, earlyFinish: null }),
          anActivity({ id: '2', earlyStart: null, earlyFinish: null }),
        ]}
      />,
    );
    expect(screen.getByText(/All 2 activities have/)).toBeInTheDocument();
  });
});

describe('GanttPanel — the grid', () => {
  it('renders one row per activity, plus the header', () => {
    render(<GanttPanel activities={TWO} />);
    expect(rows()).toHaveLength(2);
  });

  // The row index must describe the FULL set, not the rendered window — that is what makes
  // virtualization invisible to assistive technology.
  it('numbers rows against the whole plan and declares the total', () => {
    render(<GanttPanel activities={TWO} />);
    expect(screen.getByRole('treegrid')).toHaveAttribute('aria-rowcount', '3');
    expect(rows()[0]).toHaveAttribute('aria-rowindex', '2');
    expect(rows()[1]).toHaveAttribute('aria-rowindex', '3');
  });

  // The bar is reinforcement; the row text is the information. A screen-reader user must get the
  // dates and float without it.
  it('gives every bar a text equivalent in the row', () => {
    render(<GanttPanel activities={TWO} />);
    const first = rows()[0]!;
    expect(within(first).getByText('A10')).toBeInTheDocument();
    expect(within(first).getByText('Excavate')).toBeInTheDocument();
    expect(within(first).getAllByRole('gridcell').length).toBeGreaterThan(3);
  });

  it('shows an em dash rather than a blank cell for missing values', () => {
    render(<GanttPanel activities={[anActivity({ code: null, totalFloat: null })]} />);
    expect(within(rows()[0]!).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});

describe('GanttPanel — sorting', () => {
  it('declares the sorted column and no other', () => {
    render(<GanttPanel activities={TWO} />);
    const headers = screen.getAllByRole('columnheader');
    const sorted = headers.filter((h) => h.getAttribute('aria-sort') !== 'none');
    expect(sorted).toHaveLength(0); // default is the WBS order, which is not a visible column
  });

  it('sorts on a column header click and reflects the direction', () => {
    render(<GanttPanel activities={TWO} />);
    fireEvent.click(screen.getByRole('button', { name: /Activity/ }));

    const nameHeader = screen
      .getAllByRole('columnheader')
      .find((h) => within(h).queryByRole('button', { name: /Activity/ }));
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(within(rows()[0]!).getByText('Excavate')).toBeInTheDocument();
  });

  it('toggles to descending on a second click of the same column', () => {
    render(<GanttPanel activities={TWO} />);
    const button = screen.getByRole('button', { name: /Activity/ });
    fireEvent.click(button);
    fireEvent.click(button);

    const nameHeader = screen
      .getAllByRole('columnheader')
      .find((h) => within(h).queryByRole('button', { name: /Activity/ }));
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    expect(within(rows()[0]!).getByText('Piling')).toBeInTheDocument();
  });
});

describe('GanttPanel — selection and keyboard', () => {
  it('reports the chosen activity so selection stays shared with the diagram', () => {
    const onSelect = vi.fn();
    render(<GanttPanel activities={TWO} onSelectActivity={onSelect} />);

    fireEvent.click(rows()[1]!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  // A row that only responds to a mouse is unreachable for a keyboard user.
  it.each([['Enter'], [' ']])('activates a row with %s', (key) => {
    const onSelect = vi.fn();
    render(<GanttPanel activities={TWO} onSelectActivity={onSelect} />);

    fireEvent.keyDown(rows()[0]!, { key });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('marks the selected row and exposes exactly one tab stop', () => {
    render(<GanttPanel activities={TWO} selectedActivityId="b" />);
    expect(rows()[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows().filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('moves the tab stop with the arrow keys', () => {
    render(<GanttPanel activities={TWO} />);
    fireEvent.keyDown(screen.getByRole('treegrid'), { key: 'ArrowDown' });
    expect(rows()[1]).toHaveAttribute('tabindex', '0');
    expect(rows()[0]).toHaveAttribute('tabindex', '-1');
  });

  it('does not run off the ends of the list', () => {
    render(<GanttPanel activities={TWO} />);
    const grid = screen.getByRole('treegrid');
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(rows()[0]).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(grid, { key: 'End' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(rows()[1]).toHaveAttribute('tabindex', '0');
  });
});

describe('GanttPanel — WBS hierarchy', () => {
  const PARENT = anActivity({
    id: 'p',
    type: 'WBS_SUMMARY',
    name: 'Substructure',
    laneIndex: 0,
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-20',
  });
  const CHILD = anActivity({
    id: 'c',
    parentId: 'p',
    name: 'Piling',
    laneIndex: 1,
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
  });

  it('nests a child a level below its summary', () => {
    render(<GanttPanel activities={[PARENT, CHILD]} />);
    expect(rows()[0]).toHaveAttribute('aria-level', '1');
    expect(rows()[1]).toHaveAttribute('aria-level', '2');
  });

  it('declares the disclosure state on the summary row only', () => {
    render(<GanttPanel activities={[PARENT, CHILD]} />);
    expect(rows()[0]).toHaveAttribute('aria-expanded', 'true');
    expect(rows()[1]).not.toHaveAttribute('aria-expanded');
  });

  it('collapses and expands the subtree with the arrow keys', () => {
    render(<GanttPanel activities={[PARENT, CHILD]} />);
    const grid = screen.getByRole('treegrid');

    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(rows()).toHaveLength(2);
  });
});

describe('GanttPanel — scroll lockstep', () => {
  // The whole ADR-0059 argument: grid and bars share ONE scroller, so they cannot desync. If a
  // future change introduces a second scroll container this test is the one that notices.
  it('keeps grid and bars inside a single scroll container', () => {
    const { container } = render(<GanttPanel activities={TWO} />);
    const scrollers = container.querySelectorAll(
      '.overflow-auto, .overflow-x-auto, .overflow-y-auto',
    );
    expect(scrollers).toHaveLength(1);
    expect(within(scrollers[0] as HTMLElement).getByRole('treegrid')).toBeInTheDocument();
  });
});

describe('GanttPanel — the bar encodings', () => {
  const barCell = (row: HTMLElement): HTMLElement => within(row).getAllByRole('gridcell').at(-1)!;

  it('draws a bar for a scheduled task', () => {
    render(<GanttPanel activities={TWO} />);
    expect(barCell(rows()[0]!).querySelectorAll('span').length).toBeGreaterThan(0);
  });

  // Criticality must not rest on hue alone (WCAG 1.4.1) — the defect class ADR-0055 exists for.
  it('gives a critical bar a second, non-colour cue', () => {
    render(<GanttPanel activities={[anActivity({ isCritical: true })]} />);
    const bar = barCell(rows()[0]!).querySelector('span');
    expect(bar?.className).toMatch(/ring/);
  });

  it('draws a float tail only when there is slack', () => {
    const { rerender } = render(<GanttPanel activities={[anActivity({ totalFloat: 5 })]} />);
    const withFloat = barCell(rows()[0]!).querySelectorAll('span').length;

    rerender(<GanttPanel activities={[anActivity({ totalFloat: -5 })]} />);
    const withNegative = barCell(rows()[0]!).querySelectorAll('span').length;

    expect(withFloat).toBeGreaterThan(withNegative);
  });

  it('fills a bar in proportion to progress', () => {
    render(<GanttPanel activities={[anActivity({ percentComplete: 40 })]} />);
    const fill = barCell(rows()[0]!).querySelector<HTMLElement>('span > span');
    expect(fill?.style.width).toBe('40%');
  });

  it('draws no progress fill at zero', () => {
    render(<GanttPanel activities={[anActivity({ percentComplete: 0 })]} />);
    expect(barCell(rows()[0]!).querySelector('span > span')).toBeNull();
  });

  it('renders a milestone as a rotated diamond, not a bar', () => {
    render(
      <GanttPanel
        activities={[
          anActivity({ type: 'START_MILESTONE', durationDays: 0, earlyFinish: '2026-02-02' }),
        ]}
      />,
    );
    expect(barCell(rows()[0]!).querySelector('span')?.className).toMatch(/rotate-45/);
  });

  // A row whose activity has no dates still renders — it is in the grid, just not on the chart.
  it('leaves the chart cell empty for an uncalculated activity among calculated ones', () => {
    render(
      <GanttPanel
        activities={[
          anActivity({ id: 'ok', laneIndex: 0 }),
          anActivity({ id: 'none', laneIndex: 1, earlyStart: null, earlyFinish: null }),
        ]}
      />,
    );
    expect(rows()).toHaveLength(2);
    // The row is present in the grid; only its chart cell is empty, because there is nowhere
    // honest to draw it.
    const [calculated, uncalculated] = rows();
    expect(barCell(calculated!).querySelectorAll('span').length).toBeGreaterThan(0);
    expect(barCell(uncalculated!).querySelectorAll('span')).toHaveLength(0);
  });

  it('labels the timeline column for assistive technology', () => {
    render(<GanttPanel activities={TWO} />);
    expect(screen.getByText('Timeline')).toBeInTheDocument();
  });
});

describe('GanttPanel — the shared time axis', () => {
  // jsdom reports clientWidth 0, so without this the scale always falls back and the assertion
  // below cannot discriminate — it would pass for a component that ignored the preset entirely.
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 1200,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  });

  const chartScale = (container: HTMLElement): string =>
    (container.querySelector('[role="treegrid"]') as HTMLElement).style.width;

  // ADR-0059 §2: the Gantt consumes ADR-0056's presets rather than carrying its own scale. If a
  // future change reintroduces a private constant, this stops discriminating.
  it('changes the chart scale with the zoom preset', () => {
    const year = render(<GanttPanel activities={TWO} zoomLevel="year" />);
    const day = render(<GanttPanel activities={TWO} zoomLevel="day" />);
    expect(chartScale(year.container)).not.toBe(chartScale(day.container));
  });

  it('scales up as the preset gets finer', () => {
    const px = (c: HTMLElement): number => Number.parseFloat(chartScale(c));
    const month = render(<GanttPanel activities={TWO} zoomLevel="month" />);
    const day = render(<GanttPanel activities={TWO} zoomLevel="day" />);
    expect(px(day.container)).toBeGreaterThan(px(month.container));
  });

  it('defaults to a preset rather than an arbitrary constant', () => {
    const explicit = render(<GanttPanel activities={TWO} zoomLevel="month" />);
    const implicit = render(<GanttPanel activities={TWO} />);
    expect(chartScale(implicit.container)).toBe(chartScale(explicit.container));
  });
});

describe('GanttPanel — baseline variance (ADR-0025)', () => {
  const varianceRow = (over: Partial<BaselineVarianceRow> = {}): BaselineVarianceRow => ({
    activityId: 'a',
    code: 'A10',
    name: 'Excavate',
    inBaseline: true,
    removed: false,
    currentStart: '2026-02-04',
    currentFinish: '2026-02-08',
    currentTotalFloat: null,
    baselineStart: '2026-02-02',
    baselineFinish: '2026-02-06',
    baselineTotalFloat: null,
    startVarianceDays: 2,
    finishVarianceDays: 2,
    ...over,
  });

  const withVariance = (rows: BaselineVarianceRow[]) =>
    render(
      <GanttPanel
        activities={TWO}
        varianceByActivityId={new Map(rows.map((r) => [r.activityId, r]))}
      />,
    );

  it('adds the variance column only when a baseline is active', () => {
    render(<GanttPanel activities={TWO} />);
    expect(screen.queryByText('vs baseline')).not.toBeInTheDocument();
  });

  it('shows the column when variance rows are supplied', () => {
    withVariance([varianceRow()]);
    expect(screen.getByText('vs baseline')).toBeInTheDocument();
  });

  // Direction must be carried by the WORD, not by colour alone (WCAG 1.4.1) — and it has to
  // survive a black-and-white print, which is the whole point of this view.
  it.each([
    [2, '+2d late'],
    [-3, '-3d early'],
    [0, 'On plan'],
  ])('states a %d-day variance in words', (days, expected) => {
    withVariance([varianceRow({ startVarianceDays: days })]);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('marks an activity added since the baseline as New', () => {
    withVariance([varianceRow({ inBaseline: false })]);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows an em dash when the two are not comparable', () => {
    withVariance([varianceRow({ startVarianceDays: null })]);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('draws a ghost bar for a baselined activity', () => {
    const { container } = withVariance([varianceRow()]);
    expect(container.querySelector('.border-dashed')).not.toBeNull();
  });

  it('draws no ghost for an activity that was not in the baseline', () => {
    const { container } = withVariance([varianceRow({ inBaseline: false })]);
    expect(container.querySelector('.border-dashed')).toBeNull();
  });

  it('keeps the chart column index correct when the variance column is present', () => {
    withVariance([varianceRow()]);
    const grid = screen.getByRole('treegrid');
    // Five sortable columns + variance + the chart.
    expect(grid).toHaveAttribute('aria-colcount', '7');
  });
});

describe('GanttPanel — variance honesty', () => {
  // "Not compared" and "added since the baseline" are different facts. Collapsing them would
  // report a comparison the API never made.
  it('does not claim an un-compared activity is New', () => {
    const row: BaselineVarianceRow = {
      activityId: 'a',
      code: 'A10',
      name: 'Excavate',
      inBaseline: false,
      removed: false,
      currentStart: null,
      currentFinish: null,
      currentTotalFloat: null,
      baselineStart: null,
      baselineFinish: null,
      baselineTotalFloat: null,
      startVarianceDays: null,
      finishVarianceDays: null,
    };
    render(<GanttPanel activities={TWO} varianceByActivityId={new Map([['a', row]])} />);
    // Activity 'a' is genuinely new; 'b' has no row and must not borrow that label.
    expect(screen.getAllByText('New')).toHaveLength(1);
  });
});
