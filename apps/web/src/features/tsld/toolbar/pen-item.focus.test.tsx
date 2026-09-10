import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import {
  PenStatusHost,
  PenStatusOutlet,
  PlanSlotProvider,
} from '@/components/layout/workspace/plan-slot-host';
import { Deck } from '@/components/ui/toolbar';
import {
  HANDOFF_ACTIONS,
  PenStatusCluster,
  usePenLockView,
  type PenLockView,
} from '@/features/plan-lock';
import type { PlanPen } from '@/features/plan-lock/api/use-plan-edit-lock';

/**
 * **Where focus goes when the pen changes hands** (console epic M5-T4).
 *
 * The pen's verb moved to the command deck and its badge, sentence and seven hand-off controls
 * stayed in the plan's foot row — two surfaces reading ONE `usePenLockView`. That hook has pulled
 * focus back to its `containerRef` since ADR-0028, and the reason is specific: the control the
 * planner pressed **unmounts**, because Start and Stop were different members of
 * `EditLockControls` and an action that succeeds removes the button that ran it. Focus would
 * otherwise fall to `<body>`, which is WCAG 2.2 §2.4.3 and also silently kills every workspace
 * keyboard accelerator, since they are a React `onKeyDown` on the workspace root.
 *
 * **That premise is FALSE for the deck's pen control and this is the case that says so.** The deck
 * renders one registry item whose label flips between `Start editing` and `Stop editing`; the
 * element is the same element across the transition, so focus was never lost and there is nothing
 * to restore. Restoring anyway takes focus from the button the planner is still standing on and
 * throws it to the other end of the screen — a regression introduced by a mechanism that exists to
 * prevent exactly that.
 *
 * Asserted on the ELEMENT, never on "focus is not on `<body>`": the weaker assertion passes against
 * the defect, because the foot cluster is a perfectly good element to be focused on.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PLAN_EDIT_LOCK_ENABLED: true,
}));

const ME = { id: 'u-me', name: 'Mo Hale' };
const JANE = { id: 'u-jane', name: 'Jane Okonkwo' };

function pen(over: Partial<PlanPen> = {}): PlanPen {
  return {
    penManaged: true,
    status: undefined,
    holdsPen: false,
    isPending: false,
    lostControl: null,
    dismissLost: vi.fn(),
    startEditing: vi.fn(),
    stopEditing: vi.fn(),
    requestControl: vi.fn(),
    handoff: vi.fn(),
    takeOver: vi.fn(),
    onWriteRejected: vi.fn(),
    ...over,
  };
}

function status(over: Record<string, unknown>): PlanPen['status'] {
  return {
    state: 'FREE',
    holder: null,
    requestedBy: null,
    heartbeatAt: null,
    graceEndsAt: null,
    canAcquire: false,
    canRequest: false,
    canTakeOver: false,
    canOverride: false,
    ...over,
  } as unknown as PlanPen['status'];
}

/**
 * The shipped arrangement: the deck and the foot cluster driven by one hook, with a real outlet
 * registered — the only configuration in which "focus is on the pen" and "focus is in the cluster"
 * give different answers (the `CompactPenStatus` suite's own reasoning, one surface along).
 */
function Workspace({ planPen }: { planPen: PlanPen }): React.ReactElement {
  const penLock: PenLockView = usePenLockView(planPen, ME.id, 1_700_000_000_000);
  return (
    <PlanSlotProvider>
      <div data-testid="foot-row">
        <PenStatusOutlet />
      </div>
      <div data-testid="command-deck">
        <Deck
          items={buildTsldToolbarItems()}
          context={makeTsldToolbarContext({ penLock, hasDiagram: true, canvasActive: true })}
          label="Author and act"
          authoringEnabled={false}
        />
      </div>
      <PenStatusHost>
        <PenStatusCluster penLock={penLock} only={HANDOFF_ACTIONS} portalSentence={false} />
      </PenStatusHost>
    </PlanSlotProvider>
  );
}

const penButton = (): HTMLElement =>
  screen.getByRole('button', { name: /^(start|stop) editing$/i });

describe('focus when the pen changes hands', () => {
  it('leaves focus on the deck control the planner pressed', async () => {
    const free = pen({ status: status({ state: 'FREE', canAcquire: true }) });
    const { rerender } = render(<Workspace planPen={free} />);

    // The split really happened: the verb is in the deck, the hand-off cluster is in the foot row.
    expect(screen.getByTestId('command-deck')).toContainElement(penButton());

    const pressed = penButton();
    pressed.focus();
    fireEvent.click(pressed);

    rerender(
      <Workspace
        planPen={pen({
          ...free,
          status: status({ state: 'HELD_BY_ME', holder: ME }),
          holdsPen: true,
        })}
      />,
    );

    // The transition happened, and it relabelled rather than replaced.
    expect(penButton()).toHaveAccessibleName(/stop editing/i);

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(penButton());
    });
    expect(document.activeElement?.getAttribute('data-toolbar-item')).toBe('pen');
    expect(screen.getByTestId('foot-row')).not.toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('still returns focus to the cluster when a hand-off control unmounts itself', async () => {
    // The behaviour the restore exists for, unchanged: a peer presses Request control, the button
    // is replaced by the disabled `Take over now`, and without the restore focus falls to `<body>`.
    const held = pen({
      status: status({ state: 'HELD_BY_OTHER', holder: JANE, canRequest: true }),
    });
    const { rerender } = render(<Workspace planPen={held} />);

    const request = screen.getByRole('button', { name: /request control/i });
    expect(screen.getByTestId('foot-row')).toContainElement(request);
    request.focus();
    fireEvent.click(request);

    rerender(
      <Workspace
        planPen={pen({
          ...held,
          status: status({
            state: 'HELD_BY_OTHER',
            holder: JANE,
            canRequest: true,
            requestedBy: ME,
          }),
        })}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('foot-row')).toContainElement(
        document.activeElement as HTMLElement,
      );
    });
    expect(document.activeElement).not.toBe(document.body);
  });
});
