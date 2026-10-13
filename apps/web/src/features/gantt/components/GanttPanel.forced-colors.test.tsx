import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **The Gantt's forced-colours forms sit on the right elements and on no others**
 * (`docs/TECH_DEBT.md` #505, ADR-0191 D2).
 *
 * jsdom applies no forced colours, so this proves where the variants are and not what a browser
 * paints; `apps/web/e2e-gantt/forced-colors.spec.ts` is the half that reads computed colours.
 * Class names are asserted here because the variant IS the contract: a bar that loses it vanishes
 * in a contrast theme and nothing else in the unit tier can notice.
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

const rows = (): HTMLElement[] =>
  screen.getAllByRole('row').filter((r) => r.getAttribute('aria-rowindex') !== '1');
const barCell = (row: HTMLElement): HTMLElement => within(row).getAllByRole('gridcell').at(-1)!;
const firstMark = (row: HTMLElement): HTMLElement => barCell(row).querySelector('span')!;

describe('GanttPanel, forced colours', () => {
  it('gives a task bar a 1 px CanvasText edge on Canvas, and no solid fill', () => {
    render(<GanttPanel activities={[anActivity({})]} />);
    const bar = firstMark(rows()[0]!);
    expect(bar).toHaveClass('forced-colors:border', 'forced-colors:border-[CanvasText]');
    expect(bar).toHaveClass('forced-colors:bg-[Canvas]');
    expect(bar).not.toHaveClass('forced-colors:border-2');
    expect(bar).not.toHaveClass('forced-colors:bg-[CanvasText]');
  });

  it('draws a critical bar with a wider edge than a task bar, the width being the cue', () => {
    render(<GanttPanel activities={[anActivity({ isCritical: true })]} />);
    const bar = firstMark(rows()[0]!);
    expect(bar).toHaveClass('forced-colors:border-2', 'forced-colors:border-[CanvasText]');
    expect(bar).not.toHaveClass('forced-colors:border');
  });

  it('draws a summary bar solid CanvasText, without the task bar edge', () => {
    render(<GanttPanel activities={[anActivity({ type: 'WBS_SUMMARY' })]} />);
    const bar = firstMark(rows()[0]!);
    expect(bar).toHaveClass(
      'forced-colors:bg-[CanvasText]',
      'forced-colors:[forced-color-adjust:none]',
    );
    expect(bar).not.toHaveClass('forced-colors:border');
  });

  it('draws a milestone solid CanvasText', () => {
    render(
      <GanttPanel
        activities={[
          anActivity({ type: 'START_MILESTONE', durationDays: 0, earlyFinish: '2026-02-02' }),
        ]}
      />,
    );
    expect(firstMark(rows()[0]!)).toHaveClass(
      'forced-colors:bg-[CanvasText]',
      'forced-colors:[forced-color-adjust:none]',
    );
  });

  it('inks progress with CanvasText on a task bar and Canvas on a summary', () => {
    const { rerender } = render(<GanttPanel activities={[anActivity({ percentComplete: 40 })]} />);
    const task = barCell(rows()[0]!).querySelector<HTMLElement>('span > span')!;
    expect(task).toHaveClass('forced-colors:bg-[CanvasText]');

    rerender(
      <GanttPanel activities={[anActivity({ type: 'WBS_SUMMARY', percentComplete: 40 })]} />,
    );
    const summary = barCell(rows()[0]!).querySelector<HTMLElement>('span > span')!;
    expect(summary).toHaveClass('forced-colors:bg-[Canvas]');
    expect(summary).not.toHaveClass('forced-colors:bg-[CanvasText]');
  });

  it('leaves the float tail and the baseline ghost to the borders that already survive', () => {
    render(<GanttPanel activities={[anActivity({ totalFloat: 5 })]} />);
    const tail = barCell(rows()[0]!).querySelectorAll('span')[0]!;
    expect(tail.className).toContain('border-dashed');
    expect(tail.className).not.toContain('forced-colors:');
  });

  it('marks only the selected row in Highlight', () => {
    render(
      <GanttPanel
        activities={[
          anActivity({ id: 'a', name: 'Excavate' }),
          anActivity({ id: 'b', name: 'Piling' }),
        ]}
        selectedActivityId="b"
      />,
    );
    const [first, second] = rows();
    expect(second).toHaveClass(
      'forced-colors:bg-[Highlight]',
      'forced-colors:text-[HighlightText]',
    );
    expect(first!.className).not.toContain('forced-colors:bg-[Highlight]');
    // The sticky grid half repeats it: it paints its own background over the row's.
    expect(within(second!).getAllByRole('gridcell')[0]!.parentElement).toHaveClass(
      'forced-colors:bg-[Highlight]',
    );
  });
});
