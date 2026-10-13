import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GanttBarDrag } from '../model/bar-drag';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import {
  FORCED_ARMED_OUTLINE,
  FORCED_BAND_IN_OUTLINED_BAR,
  FORCED_BAND_IN_SOLID_BAR,
  FORCED_EDGED_SOLID_BAR,
  FORCED_HEAVY_EDGE_BAR,
  FORCED_OUTLINED_BAR,
  FORCED_SELECTED_EDGE,
  FORCED_SOLID_MARK,
} from '@/components/ui/forced-colors';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The Gantt's forced-colours forms sit on the right elements and on no others**
 * (`docs/TECH_DEBT.md` #505, ADR-0191 D2).
 *
 * jsdom applies no forced colours, so this proves where the variants are and not what a browser
 * paints; `apps/web/e2e-gantt/forced-colors.spec.ts` is the half that reads computed colours.
 * The vocabulary is asserted through the exported constants of `components/ui/forced-colors.ts`
 * rather than echoed literals, so a renamed colour changes one place and this file still checks
 * the PLACEMENT, which is the contract: a bar that loses its form vanishes in a contrast theme and
 * nothing else in the unit tier can notice.
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
const progressOf = (row: HTMLElement): HTMLElement =>
  barCell(row).querySelector<HTMLElement>('span > span')!;
const classes = (tokens: string): string[] => tokens.split(' ');

function expectHas(element: HTMLElement, tokens: string): void {
  expect(element).toHaveClass(...classes(tokens));
}
function expectLacks(element: HTMLElement, tokens: string): void {
  for (const token of classes(tokens)) expect(element).not.toHaveClass(token);
}

describe('GanttPanel, forced colours', () => {
  it('gives a task bar a 1 px CanvasText edge on Canvas, and no solid fill', () => {
    render(<GanttPanel activities={[anActivity({})]} />);
    const bar = firstMark(rows()[0]!);
    expectHas(bar, FORCED_OUTLINED_BAR);
    expect(bar).not.toHaveClass('forced-colors:border-3');
    expectLacks(bar, FORCED_SOLID_MARK);
  });

  it('draws a critical bar with an edge three times a task bar, the width being the cue', () => {
    render(<GanttPanel activities={[anActivity({ isCritical: true })]} />);
    const bar = firstMark(rows()[0]!);
    expectHas(bar, FORCED_HEAVY_EDGE_BAR);
    expect(bar).not.toHaveClass('forced-colors:border');
  });

  it('draws a summary bar solid CanvasText with an edge of its own', () => {
    render(<GanttPanel activities={[anActivity({ type: 'WBS_SUMMARY' })]} />);
    expectHas(firstMark(rows()[0]!), FORCED_EDGED_SOLID_BAR);
  });

  it('draws a milestone solid CanvasText', () => {
    render(
      <GanttPanel
        activities={[
          anActivity({ type: 'START_MILESTONE', durationDays: 0, earlyFinish: '2026-02-02' }),
        ]}
      />,
    );
    expectHas(firstMark(rows()[0]!), FORCED_SOLID_MARK);
  });

  it('inks progress inside an outlined bar and inverts it inside a solid summary', () => {
    const { rerender } = render(<GanttPanel activities={[anActivity({ percentComplete: 40 })]} />);
    expectHas(progressOf(rows()[0]!), FORCED_BAND_IN_OUTLINED_BAR);

    rerender(
      <GanttPanel activities={[anActivity({ type: 'WBS_SUMMARY', percentComplete: 40 })]} />,
    );
    expectHas(progressOf(rows()[0]!), FORCED_BAND_IN_SOLID_BAR);
  });

  it("puts a summary's progress on a parent that has its own edge, so its start stays visible", () => {
    render(<GanttPanel activities={[anActivity({ type: 'WBS_SUMMARY', percentComplete: 40 })]} />);
    const parent = firstMark(rows()[0]!);
    expect(parent).toHaveClass('forced-colors:border', 'forced-colors:border-[CanvasText]');
    expect(progressOf(rows()[0]!).parentElement).toBe(parent);
  });

  it('holds a band 1 px inside the edge, so a finished task still reads as an outlined bar', () => {
    render(<GanttPanel activities={[anActivity({ percentComplete: 100 })]} />);
    expect(progressOf(rows()[0]!)).toHaveClass(
      'forced-colors:inset-y-px',
      'forced-colors:left-px',
      'forced-colors:[max-width:calc(100%-2px)]',
    );
  });

  it('keys a critical summary on its bar: outlined bar, outlined band', () => {
    render(
      <GanttPanel
        activities={[anActivity({ type: 'WBS_SUMMARY', isCritical: true, percentComplete: 40 })]}
      />,
    );
    expectHas(firstMark(rows()[0]!), FORCED_HEAVY_EDGE_BAR);
    expectHas(progressOf(rows()[0]!), FORCED_BAND_IN_OUTLINED_BAR);
  });

  it('leaves the float tail and the baseline ghost to the borders that already survive', () => {
    render(<GanttPanel activities={[anActivity({ totalFloat: 5 })]} />);
    const tail = barCell(rows()[0]!).querySelectorAll('span')[0]!;
    expect(tail.className).toContain('border-dashed');
    expect(tail.className).not.toContain('forced-colors:');
  });

  it('marks only the selected row, with an edge on its sticky cell and no fill anywhere', () => {
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
    const stickyOf = (row: HTMLElement) => within(row).getAllByRole('gridcell')[0]!.parentElement!;
    expectHas(stickyOf(second!), FORCED_SELECTED_EDGE);
    expectLacks(stickyOf(first!), FORCED_SELECTED_EDGE);
    // The fill that was tried and withdrawn: `forced-color-adjust: none` on the row would inherit
    // into every control inside it and un-force them (ADR-0191 D2).
    for (const row of [first!, second!]) {
      expect(row.className).not.toContain('forced-colors:bg-[Highlight]');
      expect(row.className).not.toContain('forced-color-adjust');
      expect(stickyOf(row).className).not.toContain('forced-colors:bg-[Highlight]');
    }
  });

  it('draws the armed outline and its grips in CanvasText, on an outlined bar only', () => {
    const drag: GanttBarDrag = {
      canEdit: true,
      reason: null,
      plannedStartIso: '2026-01-01',
      isWorkingDay: null,
      moveTo: vi.fn(() => Promise.resolve()),
      resizeTo: vi.fn(() => Promise.resolve()),
      resizeStart: vi.fn(() => Promise.resolve()),
      announce: vi.fn(),
    };
    const { container } = render(
      <GanttPanel activities={[anActivity({ id: 'a1' })]} drag={drag} selectedActivityId="a1" />,
    );
    const armed = container.querySelector<HTMLElement>('[data-bar-armed="true"]')!;
    expectHas(armed, FORCED_ARMED_OUTLINE);
    expectHas(armed, FORCED_OUTLINED_BAR);
    const grips = container.querySelector('[data-bar-grip]')!.children;
    expect(grips).toHaveLength(3);
    for (const grip of Array.from(grips)) expectHas(grip as HTMLElement, FORCED_SOLID_MARK);
  });

  it('does not arm the bar of an unselected row', () => {
    const { container } = render(<GanttPanel activities={[anActivity({ id: 'a1' })]} />);
    expect(container.querySelector('[data-bar-armed]')).toBeNull();
    expect(container.querySelector('[data-bar-grip]')).toBeNull();
  });
});
