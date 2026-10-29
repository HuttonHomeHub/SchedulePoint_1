import type { ActivitySummary } from '@repo/types';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GANTT_COLUMNS } from '../layout/grid-columns';
import { DEFAULT_HIDDEN_COLUMNS } from '../model/gantt-view-state';

import { GanttPrintSurface, printGanttSchedule } from './GanttPrintSurface';

import type { CodeColumn } from '@/lib/code-columns';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The Gantt's code columns on paper** (P6 activity codes, M3-T2; `m3-spec.md` §4.6, the owner's print
 * decision): the switched-on code columns print after the standard ones in on-screen order, **as many as
 * leave the chart 240 px**, and one line under the chart names the rest.
 */

// What `printGanttSchedule` hands the surface: the swimlane column never prints (`shownColumns`).
const VISIBLE_COLUMNS = GANTT_COLUMNS.filter(
  (c) => !DEFAULT_HIDDEN_COLUMNS.includes(c.key) && c.swimlanesOnly !== true,
);

const ACTIVITIES: ActivitySummary[] = [
  anActivity({
    id: 'sum',
    code: 'S1',
    name: 'Services',
    type: 'WBS_SUMMARY',
    earlyStart: '2026-01-05',
    earlyFinish: '2026-02-27',
  }),
  anActivity({
    id: 'a4',
    code: 'CD_4',
    name: 'First fix',
    parentId: 'sum',
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-16',
  }),
  anActivity({
    id: 'a8',
    code: 'CD_8',
    name: 'Handover',
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
  }),
];

const column = (key: string, label: string, over: Partial<CodeColumn> = {}): CodeColumn => ({
  key,
  label,
  status: 'ready',
  text: (activity) =>
    activity.id === 'a4'
      ? 'Mechanical, electrical and plumbing'
      : activity.id === 'sum'
        ? 'MEP'
        : '—',
  ...over,
});

/** Every heading but the last, which is the time ruler. */
const headersOf = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('thead th')].slice(0, -1).map((th) => th.textContent ?? '');

const render_ = (codeColumns: readonly CodeColumn[], columns = VISIBLE_COLUMNS) =>
  render(
    <GanttPrintSurface
      columns={columns}
      dependencies={[]}
      codeColumns={codeColumns}
      title="North Tower"
      subtitle="As of 2026-01-01"
      activities={ACTIVITIES}
    />,
  ).container;

describe('GanttPrintSurface — code columns', () => {
  it('prints no code column and no sentence when none is switched on', () => {
    const container = render_([]);
    expect(headersOf(container)).toEqual([
      'Code',
      'Activity',
      'Duration',
      'Start',
      'Finish',
      'Float left',
    ]);
    expect(container.querySelector('.gantt-print-omitted')).toBeNull();
  });

  it('heads each column with the type’s name, after the standard headings and before the chart', () => {
    const headers = headersOf(render_([column('trade', 'Trade'), column('area', 'Area')]));
    expect(headers.slice(0, 6)).toEqual([
      'Code',
      'Activity',
      'Duration',
      'Start',
      'Finish',
      'Float left',
    ]);
    expect(headers.slice(6, 8)).toEqual(['Trade', 'Area']);
  });

  it('reads each cell as the value’s name, and a summary’s own value', () => {
    const container = render_([column('trade', 'Trade')]);
    const rows = [...container.querySelectorAll('tbody tr')];
    const cellsOf = (name: string) =>
      [...(rows.find((r) => r.textContent?.includes(name))?.querySelectorAll('td') ?? [])].map(
        (td) => td.textContent,
      );
    // Column 7 of the row is the first code cell (six standard columns precede it).
    expect(cellsOf('First fix')[6]).toBe('Mechanical, electrical and plumbing');
    expect(cellsOf('Services')[6]).toBe('MEP');
    expect(cellsOf('Handover')[6]).toBe('—');
  });

  it('leaves the chart at least 240 px, printing three and naming the rest', () => {
    const six = ['System', 'Phase', 'Area', 'Trade', 'Zone', 'Block'].map((n) => column(n, n));
    const container = render_(six);
    expect(headersOf(container).slice(6, 9)).toEqual(['System', 'Phase', 'Area']);
    expect(headersOf(container)).not.toContain('Trade');
    expect(container.querySelector('.gantt-print-omitted')?.textContent).toBe(
      'Not printed, to leave room for the chart: Trade, Zone, Block.',
    );
    const chart = container.querySelector('thead th:last-child') as HTMLElement;
    expect(parseFloat(chart.style.width)).toBeGreaterThanOrEqual(240);
  });

  it('prints none beside Predecessors and a baseline, and says so', () => {
    const container = render(
      <GanttPrintSurface
        columns={GANTT_COLUMNS.filter((c) => c.swimlanesOnly !== true)}
        dependencies={[]}
        codeColumns={[column('trade', 'Trade'), column('area', 'Area')]}
        title="North Tower"
        subtitle="As of 2026-01-01"
        activities={ACTIVITIES}
        varianceByActivityId={
          new Map([
            [
              'a4',
              {
                activityId: 'a4',
                code: 'CD_4',
                name: 'First fix',
                inBaseline: true,
                removed: false,
                currentStart: '2026-01-05',
                currentFinish: '2026-01-16',
                currentTotalFloat: 0,
                baselineStart: '2026-01-05',
                baselineFinish: '2026-01-16',
                baselineTotalFloat: 0,
                startVarianceDays: 0,
                finishVarianceDays: 0,
                floatVarianceDays: 0,
              },
            ],
          ])
        }
      />,
    ).container;
    expect(headersOf(container)).not.toContain('Trade');
    expect(container.querySelector('.gantt-print-omitted')?.textContent).toBe(
      'Not printed, to leave room for the chart: Trade, Area.',
    );
  });

  it('never prints a column that is not ready', () => {
    // The toolbar refuses to print rather than pass one; the surface does not paper over it either.
    const container = render_([column('trade', 'Trade', { status: 'ready' })]);
    expect(container.textContent).not.toContain('Loading…');
    expect(container.textContent).not.toContain('Unavailable');
  });
});

describe('printGanttSchedule — code columns reach paper', () => {
  afterEach(() => document.querySelector('.tsld-print-container')?.remove());

  /** A prop threaded onto the surface and not onto this entry point is the #135/#217 failure. */
  it('carries the code columns from the input to the document', () => {
    act(() => {
      printGanttSchedule(
        {
          title: 'North Tower',
          subtitle: '—',
          activities: ACTIVITIES,
          hiddenColumns: new Set(DEFAULT_HIDDEN_COLUMNS),
          dependencies: [],
          codeColumns: [column('trade', 'Trade')],
        },
        { print: vi.fn() },
      );
    });
    const root = document.querySelector('.gantt-print-root');
    expect([...(root?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent)).toContain(
      'Trade',
    );
    expect(root?.textContent).toContain('Mechanical, electrical and plumbing');
  });
});
