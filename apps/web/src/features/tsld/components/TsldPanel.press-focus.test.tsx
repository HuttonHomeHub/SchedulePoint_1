import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));
vi.mock(
  '../render/run-optimise-layout',
  () => import('../render/test-support/in-process-optimise'),
);

import { BAR_HEIGHT, BAR_PAD, DEFAULT_VIEWPORT, LANE_HEIGHT } from '../render/render-model';

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **A press on the canvas gives the diagram the keyboard** (ADR-0218 D1,
 * `docs/specs/diagram-keys-and-selection/` M1).
 *
 * The canvas is `aria-hidden` and takes no focus, so the browser leaves focus on the shell's `<main>`
 * after a press, and every key the diagram answers (Escape, the arrows) and every key the workspace
 * scope answers (Ctrl+Z, Ctrl+C/V) is dead. The panel moves focus to its list on release. What this
 * file pins is the shape of that move: where it happens, where it must NOT, and that the list's own
 * "no selection, so select row 0" default is not allowed to turn an empty-ground click into a
 * selection.
 */
const laneMid = (lane: number): number =>
  DEFAULT_VIEWPORT.originY + lane * LANE_HEIGHT + BAR_PAD + BAR_HEIGHT / 2;
const ON_BAR = { clientX: 60, clientY: laneMid(0), pointerId: 1 };
// Well below the two seeded lanes and right of every bar.
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

const selected = (): number =>
  document.querySelectorAll('[role="option"][aria-selected="true"]').length;

function press(canvas: Element, at: typeof ON_BAR, upAt: typeof ON_BAR = at): void {
  fireEvent.pointerDown(canvas, at);
  fireEvent.pointerUp(canvas, upAt);
}

beforeEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
});

describe('TsldPanel — a press gives the diagram the keyboard', () => {
  it('focuses the list on the release of a click on a bar, without scrolling', () => {
    const { canvas, list } = mount();
    const focus = vi.spyOn(list, 'focus');
    press(canvas, ON_BAR);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(list).toHaveFocus();
    expect(selected()).toBe(1);
  });

  it('focuses the list after a drag that moves nothing (a pan), too', () => {
    const { canvas, list } = mount();
    press(canvas, ON_GROUND, { ...ON_GROUND, clientX: ON_GROUND.clientX - 80 });
    expect(list).toHaveFocus();
  });

  it('focuses the list from the click that follows the release, for a touch that lost it', () => {
    // On touch the browser's compatibility mousedown arrives AFTER pointerup and takes focus back to
    // <main>; the `click` is after it. Modelled by moving focus away between the two.
    const { canvas, list } = mount();
    press(canvas, ON_BAR);
    screen.getByLabelText('outside field').focus();
    // The field is a text input, so the move is refused: nothing is taken from it.
    fireEvent.click(canvas);
    expect(screen.getByLabelText('outside field')).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(canvas);
    expect(list).toHaveFocus();
  });

  it('never invents a selection: an empty-ground click with nothing selected selects nothing', () => {
    const { canvas, list } = mount();
    expect(selected()).toBe(0);
    press(canvas, ON_GROUND);
    expect(list).toHaveFocus();
    expect(selected()).toBe(0);
  });

  it('clears the selection on empty ground and still holds focus', () => {
    const { canvas, list } = mount();
    press(canvas, ON_BAR);
    expect(selected()).toBe(1);
    press(canvas, ON_GROUND);
    expect(selected()).toBe(0);
    expect(list).toHaveFocus();
  });

  it('leaves the list default intact for the keyboard: tabbing in with nothing selected picks row 0', () => {
    // The suppression is for the duration of the pointer-driven focus() only. If it leaked, a
    // keyboard user arriving at the list would stop getting their first row.
    const { canvas, list } = mount();
    press(canvas, ON_GROUND);
    (document.activeElement as HTMLElement).blur();
    act(() => list.focus());
    expect(selected()).toBe(1);
  });

  it('does not take focus from a text field', () => {
    const { canvas } = mount();
    const field = screen.getByLabelText('outside field');
    field.focus();
    press(canvas, ON_BAR);
    expect(field).toHaveFocus();
  });

  it('does not take focus from an open dialog or a form', () => {
    const { canvas, list } = mount();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    button.focus();
    press(canvas, ON_BAR);
    expect(button).toHaveFocus();
    expect(list).not.toHaveFocus();
    dialog.remove();
  });

  it('does not move focus in the Add tool, where the release opens the name popover', async () => {
    const { canvas, list } = mount(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    press(canvas, ON_BAR);
    fireEvent.click(canvas);
    expect(list).not.toHaveFocus();
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
  });

  it('is a no-op when the list already has focus (the second call costs nothing)', () => {
    const { canvas, list } = mount();
    press(canvas, ON_BAR);
    const focus = vi.spyOn(list, 'focus');
    fireEvent.click(canvas);
    expect(focus).not.toHaveBeenCalled();
  });
});
