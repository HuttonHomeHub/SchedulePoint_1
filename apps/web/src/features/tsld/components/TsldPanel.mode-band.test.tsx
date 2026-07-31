import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
}: {
  arm: 'select' | 'add-activity' | 'link' | 'loe';
  activities?: ActivitySummary[];
  canEdit?: boolean;
  onLink?: React.ComponentProps<typeof TsldPanel>['onLink'];
  onOpenLogic?: (activity: ActivitySummary) => void;
}): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode(arm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arm once on mount
  }, []);
  return (
    <TsldPanel
      activities={activities}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit={canEdit}
      canvasUi={canvasUi}
      onCreate={() => Promise.resolve({ recalcConflict: null })}
      {...(onLink ? { onLink } : {})}
      {...(onOpenLogic ? { onOpenLogic } : {})}
      fill
    />
  );
}

describe('TsldPanel — mode statement band (flag on)', () => {
  it('says nothing in select mode', () => {
    render(<Harness arm="select" />);
    expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();
  });

  it.each([
    ['add-activity', /^Adding task — click the diagram to draw/],
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
});
