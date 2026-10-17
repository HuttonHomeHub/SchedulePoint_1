import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **The keyboard rollback contract** (`docs/specs/canvas-multi-select/` M3).
 *
 * The sibling suite proves what the listbox does with the flag on. This one proves what it does
 * with the flag off, which is the only thing that matters on the day someone has to turn it off:
 * **Space still announces the logic summary, `i` is unbound, and the listbox does not advertise
 * itself as multi-selectable.**
 *
 * Kept and pinned rather than weakened, the ADR-0053 M6 rule. A rebinding is the easiest kind of
 * change to half-revert — the new binding goes, the old one does not come back, and nothing fails.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_MULTI_SELECT_ENABLED: false };
});
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_MULTI_SELECT_ENABLED: false };
});

const NO_DEPS: DependencySummary[] = [];

function activity(id: string, name: string, laneIndex: number): ActivitySummary {
  return anActivity({
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
}

const ACTIVITIES = [
  activity('a', 'Excavate', 0),
  activity('b', 'Pour', 1),
  activity('c', 'Cure', 2),
  activity('d', 'Strike', 3),
];

function renderPanel() {
  render(
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit={false}
      fill
    />,
  );
  const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
  // Wrapped: focusing the list selects row 0 through `onFocus`, and an unflushed state update
  // leaves the keyboard cursor null — which quietly turns the first arrow press into "select row
  // 0" instead of "move to row 1". That is a test artefact, and it cost two red assertions before
  // it was believed rather than blamed on the product.
  act(() => list.focus());
  return list;
}

const options = () => screen.getAllByRole('option');
const selectedNames = () =>
  options()
    .filter((o) => o.getAttribute('aria-selected') === 'true')
    .map((o) => o.textContent ?? '');

describe('flag-off, the listbox keymap is the one it always had', () => {
  it('does not advertise multi-selection', () => {
    expect(renderPanel()).not.toHaveAttribute('aria-multiselectable');
  });

  it('Space announces the logic summary — the binding `i` takes flag-on', () => {
    const list = renderPanel();
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: ' ' });
    expect(announceSpy).toHaveBeenCalledExactlyOnceWith('0 predecessors, 0 successors');
  });

  it('`i` is unbound', () => {
    const list = renderPanel();
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'i' });
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('Shift+ArrowDown moves the selection rather than extending it', () => {
    const list = renderPanel();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(selectedNames()).toHaveLength(1);
  });

  it('Ctrl+A does nothing', () => {
    const list = renderPanel();
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    expect(selectedNames()).toHaveLength(1);
  });
});
