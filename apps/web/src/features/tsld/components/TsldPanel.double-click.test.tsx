import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const announce = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));
vi.mock(
  '../render/run-optimise-layout',
  () => import('../render/test-support/in-process-optimise'),
);

import { BAR_HEIGHT, BAR_PAD, DEFAULT_VIEWPORT, LANE_HEIGHT } from '../render/render-model';

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **A double-click on a bar opens the editor where the reader can work** (ADR-0218 D4,
 * `docs/specs/diagram-keys-and-selection/` M3).
 *
 * General for someone who can edit right now, Progress for someone who can only report progress (a
 * Contributor), otherwise nothing opens and Edit's own sentence is announced. The routing reads the
 * same gates the Edit and Progress buttons read; what this file pins is that the panel acts on it and
 * that the gesture exists only where the host wired the object actions.
 */
const laneMid = (lane: number): number =>
  DEFAULT_VIEWPORT.originY + lane * LANE_HEIGHT + BAR_PAD + BAR_HEIGHT / 2;
const ON_BAR = { clientX: 60, clientY: laneMid(0), pointerId: 1 };
const ON_GROUND = { clientX: 420, clientY: laneMid(0) + 6 * LANE_HEIGHT, pointerId: 1 };

function activity(id: string, name: string, laneIndex: number): ActivitySummary {
  const row = anActivity({
    id,
    code: null,
    name,
    durationDays: 3,
    durationMinutes: 1440,
    laneIndex,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    accrualType: 'UNIFORM',
  });
  return { ...row, visualEffectiveStart: row.earlyStart, visualEffectiveFinish: row.earlyFinish };
}
const NO_DEPS: DependencySummary[] = [];

function mount(
  over: { canEdit?: boolean; canReportProgress?: boolean; wired?: boolean; mode?: 'link' } = {},
) {
  const onEditActivity = vi.fn();
  const onProgress = vi.fn();
  const utils = render(
    <TsldPanel
      activities={[activity('a', 'Excavate', 0), activity('b', 'Pour', 1)]}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit={over.canEdit ?? false}
      canReportProgress={over.canReportProgress ?? false}
      scheduleRefusal={() => 'Take the pen to change this activity.'}
      {...(over.wired === false
        ? {}
        : { onOpenLogic: vi.fn(), onEditActivity, onDeleteActivity: vi.fn(), onProgress })}
      fill
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return { canvas, onEditActivity, onProgress };
}

function doubleClick(canvas: Element, at = ON_BAR): void {
  for (let i = 0; i < 2; i += 1) {
    fireEvent.pointerDown(canvas, at);
    fireEvent.pointerUp(canvas, at);
    fireEvent.click(canvas);
  }
  fireEvent.doubleClick(canvas, at);
}

beforeEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
  announce.mockClear();
});

describe('TsldPanel — double-click a bar', () => {
  it('opens General for someone who can edit right now, and selects the bar', () => {
    const { canvas, onEditActivity, onProgress } = mount({
      canEdit: true,
      canReportProgress: true,
    });
    doubleClick(canvas);
    expect(onEditActivity).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'a' }));
    expect(onProgress).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1);
  });

  it('opens Progress for a reader who can report progress but not edit', () => {
    const { canvas, onEditActivity, onProgress } = mount({ canReportProgress: true });
    doubleClick(canvas);
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'a' }));
    expect(onEditActivity).not.toHaveBeenCalled();
  });

  it('opens nothing for a reader who can do neither, and says why in Edit’s own words', () => {
    const { canvas, onEditActivity, onProgress } = mount();
    doubleClick(canvas);
    expect(onEditActivity).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Take the pen to change this activity.');
  });

  it('does nothing on empty ground', () => {
    const { canvas, onEditActivity, onProgress } = mount({
      canEdit: true,
      canReportProgress: true,
    });
    doubleClick(canvas, ON_GROUND);
    expect(onEditActivity).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('does nothing in a host that wired no object actions', () => {
    const { canvas, onEditActivity } = mount({ wired: false });
    doubleClick(canvas);
    expect(onEditActivity).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalledWith('Take the pen to change this activity.');
  });
});
