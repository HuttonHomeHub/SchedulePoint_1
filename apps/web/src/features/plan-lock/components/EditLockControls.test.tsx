import type { PlanEditLockActor } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LockAction } from '../lib/lock-view';

import { EditLockControls } from './EditLockControls';

const JANE: PlanEditLockActor = { id: 'j', name: 'Jane Doe', email: 'jane@x.com' };

function handlers() {
  return {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRequest: vi.fn(),
    onTakeOver: vi.fn(),
    onOverride: vi.fn(),
    onHandover: vi.fn(),
    onKeep: vi.fn(),
    onDismiss: vi.fn(),
  };
}

function renderControls(
  actions: LockAction[],
  extra: Partial<Parameters<typeof EditLockControls>[0]> = {},
) {
  const h = handlers();
  render(<EditLockControls actions={actions} holder={JANE} isPending={false} {...h} {...extra} />);
  return h;
}

describe('EditLockControls', () => {
  it('renders nothing when there are no actions', () => {
    const { container } = render(
      <EditLockControls actions={[]} holder={null} isPending={false} {...handlers()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['start', 'Start editing', 'onStart'],
    ['stop', 'Stop editing', 'onStop'],
    ['request', 'Request control', 'onRequest'],
    ['takeover', 'Take over now', 'onTakeOver'],
    ['handover', 'Hand over', 'onHandover'],
    ['keep', 'Keep editing', 'onKeep'],
    ['dismiss', 'Dismiss', 'onDismiss'],
  ] as const)('maps the %s action to its button and handler', (action, label, handler) => {
    const h = renderControls([action]);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(h[handler]).toHaveBeenCalled();
  });

  it('renders the "waiting" action as a disabled Take over now (no handler)', () => {
    renderControls(['waiting']);
    expect(screen.getByRole('button', { name: 'Take over now' })).toBeDisabled();
  });

  it('confirms the admin override through a dialog before calling onOverride', () => {
    const h = renderControls(['override']);
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    expect(h.onOverride).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Take over' }));
    expect(h.onOverride).toHaveBeenCalledTimes(1);
  });

  it('disables the actionable buttons while a mutation is pending', () => {
    renderControls(['start'], { isPending: true });
    expect(screen.getByRole('button', { name: 'Start editing' })).toBeDisabled();
  });

  /**
   * **`only` — the subset filter the console epic's M5 added, and its direct coverage** (a component
   * review finding: it shipped exercised once, indirectly, through a workspace fixture).
   *
   * The plan workspace passes `HANDOFF_ACTIONS` because the pen's verb renders in the command deck
   * instead. The decision to keep the subset at the CALL SITE rather than defaulting it here is what
   * preserved this suite as the extraction's oracle — three cases above are about `start`/`stop`,
   * and a default that dropped them would have made a refactor into a behaviour change wearing its
   * clothes.
   */
  describe('the `only` subset filter', () => {
    it('renders just the named actions, dropping the rest', () => {
      renderControls(['start', 'stop', 'request'], { only: ['request'] });
      expect(screen.getByRole('button', { name: 'Request control' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Start editing' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Stop editing' })).toBeNull();
    });

    it('renders nothing when the subset and the actions do not intersect', () => {
      // The state the plan workspace reaches on eight of the thirteen lock branches: the pen offers
      // a verb and no hand-off, so the foot row's controls resolve to an empty list. It must fall
      // through to the same "no actions" path as an empty array — an empty `<div>` with a gap would
      // leave the foot row's spacing arguing with itself for a control that is not there.
      const { container } = render(
        <EditLockControls
          actions={['start']}
          only={['request', 'handover']}
          holder={null}
          isPending={false}
          {...handlers()}
        />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('is absent-means-everything, which is what keeps every pre-M5 caller unchanged', () => {
      renderControls(['start', 'request']);
      expect(screen.getByRole('button', { name: 'Start editing' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Request control' })).toBeVisible();
    });
  });
});
