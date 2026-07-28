import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GanttPrintSurface, printGanttSchedule, PRINT_DOCUMENT_WIDTH } from './GanttPrintSurface';

import { PRINT_TEARDOWN_FALLBACK_MS } from '@/lib/print-document';
import { anActivity } from '@/test/activity-fixture';

/**
 * The printed programme (ADR-0059 M4). The contract worth defending here is **completeness**: a
 * printed schedule that omits work is worse than no print at all, because it looks authoritative.
 */

const bodyRows = (container: HTMLElement): HTMLCollection | never[] =>
  container.querySelector('tbody')?.children ?? [];

const varianceRow = (over: Partial<BaselineVarianceRow> = {}): BaselineVarianceRow => ({
  activityId: 'a1',
  code: 'A100',
  name: 'Excavate',
  inBaseline: true,
  removed: false,
  currentStart: '2026-02-02',
  currentFinish: '2026-02-06',
  currentTotalFloat: 0,
  baselineStart: '2026-01-26',
  baselineFinish: '2026-01-30',
  baselineTotalFloat: 0,
  startVarianceDays: 5,
  finishVarianceDays: 5,
  floatVarianceDays: 0,
  ...over,
});

describe('GanttPrintSurface', () => {
  it('renders the plan name and the as-of line', () => {
    const { container } = render(
      <GanttPrintSurface
        title="North Tower"
        subtitle="As of 2026-02-01"
        activities={[anActivity()]}
      />,
    );
    expect(container.textContent).toContain('North Tower');
    expect(container.textContent).toContain('As of 2026-02-01');
  });

  /**
   * **The reason this surface exists.** The live panel virtualizes, so printing it would emit
   * whichever rows happened to be on screen — a programme silently truncated to a scroll position.
   * Every activity gets a row here, at any size.
   */
  it('renders a row for every activity, far past any viewport', () => {
    const activities: ActivitySummary[] = Array.from({ length: 400 }, (_, i) =>
      anActivity({ id: `a${i}`, code: `A${i}`, name: `Activity ${i}`, laneIndex: i }),
    );
    const { container } = render(
      <GanttPrintSurface title="Big" subtitle="As of 2026-02-01" activities={activities} />,
    );
    expect(bodyRows(container)).toHaveLength(400);
  });

  /**
   * Pagination is delegated to the browser's native `thead` repetition. Without a real `<thead>`
   * page four would carry unlabelled columns and no time axis, and we would be writing pagination
   * code by hand.
   */
  it('puts the headings and the time ruler in a thead so they repeat on every page', () => {
    const { container } = render(
      <GanttPrintSurface title="North Tower" subtitle="—" activities={[anActivity()]} />,
    );
    const head = container.querySelector('thead');
    expect(head).not.toBeNull();
    expect(head?.textContent).toContain('Activity');
    expect(head?.textContent).toContain('Finish');
    // The ruler labels months, which is what makes the repeated header useful.
    expect(head?.textContent).toMatch(/Feb|Mar/);
  });

  // Paper cannot be panned, so the whole span is fitted to the sheet rather than windowed.
  it('fits the document to a fixed page width whatever the plan length', () => {
    const short = render(
      <GanttPrintSurface
        title="Short"
        subtitle="—"
        activities={[anActivity({ earlyStart: '2026-02-02', earlyFinish: '2026-02-06' })]}
      />,
    );
    const long = render(
      <GanttPrintSurface
        title="Long"
        subtitle="—"
        activities={[anActivity({ earlyStart: '2026-02-02', earlyFinish: '2036-02-06' })]}
      />,
    );
    for (const { container } of [short, long]) {
      expect(container.querySelector('table')).toHaveStyle({ width: `${PRINT_DOCUMENT_WIDTH}px` });
    }
  });

  it('says the plan is uncalculated rather than printing an empty grid', () => {
    const { container } = render(
      <GanttPrintSurface
        title="North Tower"
        subtitle="—"
        activities={[anActivity({ earlyStart: null, earlyFinish: null })]}
      />,
    );
    expect(container.textContent).toContain('has not been calculated');
    expect(container.querySelector('table')).toBeNull();
  });

  it('says the plan is empty when there are no activities at all', () => {
    const { container } = render(
      <GanttPrintSurface title="North Tower" subtitle="—" activities={[]} />,
    );
    expect(container.textContent).toContain('no activities');
  });

  it('adds the variance column only when a baseline is active', () => {
    const withoutBaseline = render(
      <GanttPrintSurface title="N" subtitle="—" activities={[anActivity()]} />,
    );
    expect(withoutBaseline.container.textContent).not.toContain('vs baseline');

    const withBaseline = render(
      <GanttPrintSurface
        title="N"
        subtitle="—"
        activities={[anActivity({ id: 'a1' })]}
        varianceByActivityId={new Map([['a1', varianceRow()]])}
      />,
    );
    expect(withBaseline.container.textContent).toContain('vs baseline');
    expect(withBaseline.container.textContent).toContain('+5d late');
  });

  /**
   * A photocopied programme is the normal case. Every mark has to be nameable without colour, so
   * the legend is part of the document rather than app chrome that does not print.
   */
  it('prints a legend naming each mark', () => {
    const { container } = render(
      <GanttPrintSurface title="N" subtitle="—" activities={[anActivity()]} />,
    );
    const legend = container.querySelector('.gantt-print-legend');
    expect(legend?.textContent).toContain('Critical');
    expect(legend?.textContent).toContain('Baseline');
    expect(legend?.textContent).toContain('Milestone');
  });
});

describe('printGanttSchedule (mount / teardown lifecycle)', () => {
  afterEach(() => {
    document.querySelector('.tsld-print-container')?.remove();
    vi.useRealTimers();
  });

  const container = (): HTMLElement | null => document.querySelector('.tsld-print-container');

  it('mounts the programme, opens the dialog, then tears down and restores focus', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const print = vi.fn();
    act(() => {
      printGanttSchedule(
        { title: 'North Tower', subtitle: 'As of 2026-02-01', activities: [anActivity()] },
        { print },
      );
    });

    expect(container()?.textContent).toContain('North Tower');
    expect(print).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(container()).toBeNull();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it('tears down on the fallback timeout when `afterprint` never fires', () => {
    vi.useFakeTimers();
    act(() => {
      printGanttSchedule(
        { title: 'North Tower', subtitle: '—', activities: [anActivity()] },
        { print: vi.fn() },
      );
    });
    expect(container()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(PRINT_TEARDOWN_FALLBACK_MS);
    });
    expect(container()).toBeNull();
  });
});
