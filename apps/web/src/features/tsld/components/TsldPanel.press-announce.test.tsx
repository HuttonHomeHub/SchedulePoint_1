import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
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

const laneMid = (lane: number): number =>
  DEFAULT_VIEWPORT.originY + lane * LANE_HEIGHT + BAR_PAD + BAR_HEIGHT / 2;
const ON_BAR = { clientX: 60, clientY: laneMid(0), pointerId: 1 };

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

function mount(canEdit = false) {
  const utils = render(
    <>
      <input aria-label="outside field" />
      <TsldPanel
        activities={[activity('a', 'Excavate', 0), activity('b', 'Pour', 1)]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit={canEdit}
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        fill
      />
    </>,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  const list = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  return { ...utils, canvas, list };
}

/**
 * **One telling per press** (ADR-0218 D1, the accessibility review of M1). A click that hands the
 * keyboard to the list is spoken by the list's own focus announcement (active option and description),
 * so the polite row text must not repeat it; a click that cannot move focus has nothing else speaking
 * and keeps the announcement.
 */
function press(canvas: Element): void {
  fireEvent.pointerDown(canvas, ON_BAR);
  fireEvent.pointerUp(canvas, ON_BAR);
}

beforeEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
  announce.mockClear();
});

describe('TsldPanel — a press announces once', () => {
  it('stays silent in the live region when the press moves focus to the list', () => {
    const { canvas, list } = mount();
    press(canvas);
    expect(list).toHaveFocus();
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces the row when the guards leave focus where it was', () => {
    const { canvas, list } = mount();
    screen.getByLabelText('outside field').focus();
    press(canvas);
    expect(list).not.toHaveFocus();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(String(announce.mock.calls[0]?.[0])).toContain('Excavate');
  });

  it('keeps announcing for a keyboard selection, which has no pointer focus move', () => {
    const { list } = mount();
    list.focus();
    announce.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(announce).toHaveBeenCalled();
  });
});
