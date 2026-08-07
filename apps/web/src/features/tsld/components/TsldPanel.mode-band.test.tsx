import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

/**
 * The mode band **inside the panel** (ADR-0064 T4), flag-on. The band's own copy is covered by
 * `CanvasModeBand.test.tsx`; what matters here is that the panel derives the statement from the
 * mode the canvas actually obeys, and that nothing armed renders nothing.
 *
 * The flag-off half is the rollback contract and lives in `TsldPanel.mode-band-off.test.tsx`.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: true,
    TSLD_EDITING_ENABLED: true,
    CANVAS_AUTHORING_FLOW_ENABLED: true,
  };
});

const NO_DEPS: DependencySummary[] = [];

function activity(id: string, name: string, laneIndex: number): ActivitySummary {
  return {
    id,
    planId: 'p1',
    code: null,
    name,
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const A = activity('a', 'Set out', 0);
const B = activity('b', 'Reinforce', 1);

function Harness({
  arm,
  activities = [A, B],
  canEdit = true,
  onLink,
  onOpenLogic,
  onUndoLastEdit,
  recalcHold,
}: {
  arm: 'select' | 'add-activity' | 'link' | 'loe';
  activities?: ActivitySummary[];
  canEdit?: boolean;
  onLink?: React.ComponentProps<typeof TsldPanel>['onLink'];
  onOpenLogic?: (activity: ActivitySummary) => void;
  onUndoLastEdit?: () => void;
  recalcHold?: React.ComponentProps<typeof TsldPanel>['recalcHold'];
}): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode(arm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arm once on mount
  }, []);
  return (
    <>
      {/* Lets a test start a FRESH arming of a tool — the state the stale-confirmation
          regression below is about. Nothing in the panel exposes this from outside. */}
      <button type="button" onClick={() => canvasUi.setMode('link')}>
        re-arm link
      </button>
      <TsldPanel
        activities={activities}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit={canEdit}
        canvasUi={canvasUi}
        onCreate={() => Promise.resolve({ recalcConflict: null })}
        {...(onLink ? { onLink } : {})}
        {...(onOpenLogic ? { onOpenLogic } : {})}
        {...(onUndoLastEdit ? { onUndoLastEdit } : {})}
        {...(recalcHold ? { recalcHold } : {})}
        fill
      />
    </>
  );
}

describe('TsldPanel — mode statement band (flag on)', () => {
  it('says nothing in select mode', () => {
    render(<Harness arm="select" />);
    expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();
  });

  it.each([
    ['add-activity', /^Adding task — drag on the diagram to draw its length, or click for one day/],
    ['link', /^Linking FS — click the predecessor/],
    ['loe', /^Level of effort — click the start driver/],
  ] as const)('states the %s tool', (arm, text) => {
    render(<Harness arm={arm} />);
    expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent(text);
  });

  it('disappears again when the tool disarms', () => {
    render(<Harness arm="add-activity" />);
    expect(screen.getByTestId('canvas-mode-band')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();
  });
});

describe('TsldPanel — keyboard pick parity for the Link tool (T6)', () => {
  it('Enter picks the predecessor, then commits on a different activity', () => {
    const onLink = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(<Harness arm="link" onLink={onLink} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });

    fireEvent.focus(listbox); // default-selects A
    fireEvent.keyDown(listbox, { key: 'Enter' }); // picks A as predecessor
    expect(onLink, 'the first Enter picks; it must not commit').not.toHaveBeenCalled();
    expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent(
      'Linking FS from “Set out” — click the successor.',
    );

    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // → B
    fireEvent.keyDown(listbox, { key: 'Enter' }); // commits
    expect(onLink).toHaveBeenCalledExactlyOnceWith({
      predecessorId: 'a',
      successorId: 'b',
      type: 'FS',
    });
  });

  it('rejects re-picking the same activity as both endpoints', () => {
    const onLink = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(<Harness arm="link" onLink={onLink} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'Enter' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onLink).not.toHaveBeenCalled();
    expect(announceSpy).toHaveBeenCalledWith(
      'That’s the predecessor — pick a different activity as the successor.',
    );
  });

  it('leaves Enter alone outside link mode — it still opens the Logic tab', () => {
    const onOpenLogic = vi.fn();
    const onLink = vi.fn();
    render(<Harness arm="select" onLink={onLink} onOpenLogic={onOpenLogic} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'Enter' });
    // Stealing Enter from the Logic path would remove a capability to add one.
    expect(onOpenLogic).toHaveBeenCalledOnce();
    expect(onLink).not.toHaveBeenCalled();
  });
});

describe('TsldPanel — canvas empty state (T9)', () => {
  it('names the first gesture on an empty plan, and arms Add', () => {
    render(<Harness arm="select" activities={[]} />);
    const draw = screen.getByRole('button', { name: 'Draw the first activity' });
    expect(screen.getByTestId('canvas-empty-state')).toHaveTextContent(
      'This plan has no activities yet.',
    );
    fireEvent.click(draw);
    expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent(/^Adding task/);
  });

  it('shades the affordance with a reason without the pen, rather than hiding it', () => {
    render(<Harness arm="select" activities={[]} canEdit={false} />);
    const draw = screen.getByRole('button', { name: 'Draw the first activity' });
    // Hidden, a Viewer cannot tell "the plan is empty" from "I am not allowed" (ADR-0062 M6).
    expect(draw).toHaveAttribute('aria-disabled', 'true');
    const reason = document.getElementById(draw.getAttribute('aria-describedby') ?? '');
    expect(reason).toHaveTextContent('Start editing this plan to draw activities.');
    fireEvent.click(draw);
    expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();
  });

  it('says nothing once the plan has any activity at all', () => {
    render(<Harness arm="select" />);
    expect(screen.queryByTestId('canvas-empty-state')).not.toBeInTheDocument();
  });

  /**
   * **One instruction at a time** (the epic's M3). Pressing "Draw the first activity" arms the tool
   * and the band starts telling the planner what to do next — but the notice stayed up, still
   * offering the button they had just pressed. Two strips above the same empty canvas, giving
   * different instructions, one of them already obeyed.
   */
  it('yields the empty-plan notice to the armed tool, and takes it back on disarm', () => {
    render(<Harness arm="select" activities={[]} />);
    expect(screen.getByTestId('canvas-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Draw the first activity' }));
    expect(screen.queryByTestId('canvas-empty-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('canvas-mode-band')).toBeInTheDocument();

    // Both directions: disarming must give the notice back, or an empty plan whose tool was
    // cancelled would offer no way in at all.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('canvas-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();
  });

  /**
   * **The handoff must not strand focus** (WCAG 2.4.3, the M6 gate finding). Yielding the notice to
   * the armed tool (the test above) unmounts the very button the planner just pressed — and the mode
   * band deliberately renders no focusable element for the `adding` statement. So focus reverted to
   * `<body>` and the next Tab restarted from the top of the document, on a brand-new empty plan:
   * the one screen the epic exists to make self-explanatory.
   *
   * The listbox is the destination because it is where drawing is next operated from, and it is the
   * pattern already in the file (the Next-conflict cycle focuses it the same way).
   */
  it('hands focus to the diagram listbox rather than stranding it on the unmounted button', () => {
    render(<Harness arm="select" activities={[]} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });

    fireEvent.click(screen.getByRole('button', { name: 'Draw the first activity' }));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(listbox);

    // The disarm direction: Escape gives the notice back, and focus must still be somewhere the
    // keyboard can carry on from — NOT pulled back to the restored button, which would be a focus
    // move the planner did not ask for (Escape can be pressed from anywhere).
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('canvas-empty-state')).toBeInTheDocument();
    expect(document.activeElement).toBe(listbox);
  });

  /**
   * The other half of the same rule: a focus move with no user gesture behind it is its own defect.
   * Arming the tool from anywhere else (the toolbar, a shortcut) must leave focus where the planner
   * put it — only the notice button's own click owns the handoff.
   */
  it('does not steal focus when the tool is armed from somewhere else', () => {
    render(<Harness arm="select" activities={[]} />);
    const elsewhere = screen.getByRole('button', { name: 're-arm link' });
    elsewhere.focus();

    fireEvent.click(elsewhere); // arms `link` from outside the notice
    expect(screen.getByTestId('canvas-mode-band')).toBeInTheDocument();
    expect(document.activeElement).toBe(elsewhere);
  });
});

/**
 * **The Add statement describes the gesture the armed type actually wants** (the epic's M3). The
 * band and the announcement are the same string by construction (`modeStatementText`), and this
 * proves it at the panel, where the type is resolved — the leaf suite cannot see `ActivityType`.
 */
describe('TsldPanel — the Add statement is gesture-accurate', () => {
  it('offers drag-or-click for a task, and says the same thing aloud', () => {
    announceSpy.mockClear();
    render(<Harness arm="add-activity" activities={[]} />);
    const band = screen.getByTestId('canvas-mode-band');
    expect(band).toHaveTextContent(
      'Adding task — drag on the diagram to draw its length, or click for one day. Esc to stop.',
    );
    expect(announceSpy).toHaveBeenCalledWith(band.textContent);
  });
});

/**
 * **The link confirmation and its Undo** (ADR-0064 T5). The leaf component's own suite proves it
 * calls a passed-in `onUndo`; what was untested is the thing a planner actually does — create a
 * link, read what it says, press Undo. The component review flagged it as the ADR-0062 M6 shape: a
 * feature that reads as covered because a suite with the right name exists.
 */
describe('TsldPanel — the link confirmation names the direction and undoes it (T5)', () => {
  it('states the created link, then hands the Undo back to the host', async () => {
    const onLink = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    const onUndoLastEdit = vi.fn();
    render(<Harness arm="link" onLink={onLink} onUndoLastEdit={onUndoLastEdit} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });

    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'Enter' }); // picks A
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // → B
    fireEvent.keyDown(listbox, { key: 'Enter' }); // commits

    // The direction is the whole point of the sentence — "linked" without it is what the planner
    // could not verify in the driving session that opened this epic.
    // `findByTestId` is the WRONG wait here and it flaked in CI: the band is already on screen
    // saying "Linking FS — click the predecessor", so the query resolves on the first tick and the
    // text assertion then runs synchronously — before `onLink`'s promise has flushed. The thing to
    // wait for is the SENTENCE, not the element, so the wait must wrap the assertion.
    const band = screen.getByTestId('canvas-mode-band');
    await waitFor(() => expect(band).toHaveTextContent('Linked “Set out” → “Reinforce” (FS).'));

    fireEvent.click(within(band).getByRole('button', { name: 'Undo' }));
    expect(onUndoLastEdit).toHaveBeenCalledOnce();
  });

  it('does not replay the confirmation the next time the tool is armed', async () => {
    // THE regression. `lastLink` used to be guarded by an `atMode` field that was always `'link'`
    // and only read inside a `mode === 'link'` branch — a condition that could never be false. So
    // once a planner had made one link, every later arming replayed "Linked A → B" beside an Undo
    // bound to the top of the command stack, which by then was a different, more recent edit.
    const onLink = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(<Harness arm="link" onLink={onLink} onUndoLastEdit={vi.fn()} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'Enter' });
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    // Same wrong-wait as above — it had simply not lost the race yet. Fixed in step with it, since
    // a flake fixed on one of two identical call sites is a flake that comes back.
    await waitFor(() =>
      expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent('Linked “Set out”'),
    );

    fireEvent.keyDown(window, { key: 'Escape' }); // disarm
    expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();

    // Re-arm: a fresh session, so the band must prompt rather than congratulate.
    fireEvent.click(screen.getByRole('button', { name: 're-arm link' }));
    const band = screen.getByTestId('canvas-mode-band');
    expect(band).toHaveTextContent('Linking FS — click the predecessor');
    expect(band).not.toHaveTextContent('Linked');
    // …and no Undo, which is the half that could have discarded the wrong edit.
    expect(within(band).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('says nothing when the API rejected the link', async () => {
    // A cycle or duplicate resolves `applied: false`. Announcing a link that does not exist is
    // worse than announcing nothing.
    const onLink = vi
      .fn()
      .mockResolvedValue({ applied: false, conflict: 'That would make a loop.' });
    render(<Harness arm="link" onLink={onLink} onUndoLastEdit={vi.fn()} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'Enter' });
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    await waitFor(() => expect(onLink).toHaveBeenCalled());
    expect(screen.queryByTestId('canvas-mode-band')).not.toHaveTextContent('Linked');
  });
});

/**
 * **The recalculation hold** (ADR-0064 T7), at the composition rather than the hook.
 *
 * `use-plan-auto-recalc.test.ts` covers the token API thoroughly; what had no fast test is that the
 * PANEL takes exactly one hold while a pick is open and releases it on every exit path. The epic's
 * own framing is why that matters: a leaked hold does not fail loudly — the plan's dates simply
 * stop updating for the rest of the session.
 */
describe('TsldPanel — recalculation quiescence while a pick is open (T7)', () => {
  function seam(): {
    hold: Mock<(token: symbol) => void>;
    release: Mock<(token: symbol) => void>;
  } {
    return { hold: vi.fn<(token: symbol) => void>(), release: vi.fn<(token: symbol) => void>() };
  }

  it('holds while the pick is open and releases when it commits', async () => {
    const recalcHold = seam();
    const onLink = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(<Harness arm="link" onLink={onLink} recalcHold={recalcHold} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });

    expect(recalcHold.hold, 'nothing is held before a pick opens').not.toHaveBeenCalled();
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'Enter' }); // opens the pick
    expect(recalcHold.hold).toHaveBeenCalledOnce();
    expect(recalcHold.release).not.toHaveBeenCalled();

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' }); // commits
    await waitFor(() => expect(recalcHold.release).toHaveBeenCalledOnce());
    // Same token both ways: a mismatched release would silently free someone else's hold.
    expect(recalcHold.release.mock.calls[0]?.[0]).toBe(recalcHold.hold.mock.calls[0]?.[0]);
  });

  it('releases when the tool is disarmed mid-pick', () => {
    const recalcHold = seam();
    render(<Harness arm="link" onLink={vi.fn()} recalcHold={recalcHold} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(recalcHold.hold).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(recalcHold.release).toHaveBeenCalledOnce();
  });

  it('releases on unmount — the exit path nobody remembers', () => {
    const recalcHold = seam();
    const { unmount } = render(<Harness arm="link" onLink={vi.fn()} recalcHold={recalcHold} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(recalcHold.hold).toHaveBeenCalledOnce();
    unmount();
    expect(recalcHold.release).toHaveBeenCalledOnce();
  });
});
