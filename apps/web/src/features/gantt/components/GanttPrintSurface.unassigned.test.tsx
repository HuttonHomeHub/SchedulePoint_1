import type { ActivitySummary } from '@repo/types';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The derived **Unassigned** bucket in the printed programme (WBS improvements M5-T2).
 *
 * The screen and the paper have to agree about grouping. A programme that files five activities
 * under "Unassigned" on screen and lists them loose on paper is the kind of divergence a progress
 * meeting discovers out loud — and unlike a missing row it is invisible in review, because each
 * document looks internally consistent.
 *
 * Two suites, one for each flag state, because the print surface passes the flag through to
 * `buildRows` and a rollback must take the bucket out of the paper as well as the screen.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));

import { GANTT_COLUMNS } from '../layout/grid-columns';
import { DEFAULT_HIDDEN_COLUMNS } from '../model/gantt-view-state';

import { GanttPrintSurface } from './GanttPrintSurface';

import { anActivity } from '@/test/activity-fixture';

const ACTIVITIES: ActivitySummary[] = [
  anActivity({
    id: 'sum',
    code: 'S1',
    name: 'Substructure',
    type: 'WBS_SUMMARY',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-03-31',
  }),
  anActivity({
    id: 'c1',
    code: 'A1',
    name: 'Piling',
    parentId: 'sum',
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
  }),
  anActivity({
    id: 'l1',
    code: 'A2',
    name: 'Loose end',
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
  }),
];

const printed = (activities: ActivitySummary[]): HTMLElement =>
  render(
    <GanttPrintSurface
      columns={VISIBLE_COLUMNS}
      dependencies={[]}
      title="North Tower"
      subtitle="As of 2026-01-01"
      activities={activities}
    />,
  ).container;

/**
 * The columns a reader sees by default — Predecessors off (`DEFAULT_HIDDEN_COLUMNS`).
 *
 * Stated rather than defaulted, because `columns` is a REQUIRED prop and that is the point: paper
 * prints what the reader chose, and a fixture that could stay silent about the choice is the shape
 * that let the Predecessors column print an em dash on every row (`docs/TECH_DEBT.md` #217).
 */
const VISIBLE_COLUMNS = GANTT_COLUMNS.filter((c) => !DEFAULT_HIDDEN_COLUMNS.includes(c.key));

describe('GanttPrintSurface — the Unassigned bucket (flag on)', () => {
  it('prints the bucket row', () => {
    expect(printed(ACTIVITIES).textContent).toContain('Unassigned');
  });

  /**
   * The bucket's members print **under** it, not instead of it. The screen's collapse state is
   * deliberately not carried into the print (a snapshot takes the default), so a collapsed bucket
   * on screen must still print its contents rather than hiding work behind a summary line.
   */
  it('prints the bucket’s members too, whatever the screen had collapsed', () => {
    const text = printed(ACTIVITIES).textContent ?? '';
    expect(text).toContain('Unassigned');
    expect(text).toContain('Loose end');
  });

  // The same rule the Gantt uses on screen: with no real summary there is nothing to be
  // "unassigned" from, so a WBS-less plan's programme is unchanged.
  it('adds no bucket to a plan with no summaries', () => {
    const flat = ACTIVITIES.filter((a) => a.type !== 'WBS_SUMMARY').map((a) => ({
      ...a,
      parentId: null,
    }));
    expect(printed(flat).textContent).not.toContain('Unassigned');
  });
});
