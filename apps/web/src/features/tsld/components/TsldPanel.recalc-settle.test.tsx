import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/**
 * **The coalesced recalculation used to settle in silence** (M5 T5.3).
 *
 * Moving a bar announced a promise — "Moved “Excavate”; dates will update." — and then the ADR-0032
 * coalescer recalculated the plan half a second later and said nothing whatsoever, so the only
 * sentence a screen-reader user ever heard about the edit was the one made **before** the dates
 * existed. (The manual Recalculate button did confirm, but with a status word carrying no fact —
 * the two gaps in the spec's §0 correction. This suite covers the silent one.)
 *
 * Every assertion here drives the panel exactly as the workspace does: a real pointer gesture on the
 * canvas, then the coalescer's `recalcPending` going true and back to false with whatever the server
 * produced. `recalcPending` is the SHARED flag, so the manual flush travels this same path.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  TSLD_EDITING_ENABLED: true,
  CANVAS_DIRECT_MANIPULATION_ENABLED: true,
}));

const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

import { TsldPanel } from './TsldPanel';

/** The manual Recalculate button's confirmation (`use-tsld-toolbar-context.tsx`), for the
 * distinguishability assertion below — a settle must never speak this generic sentence. */
const MANUAL_CONFIRMATION = 'Schedule recalculated.';

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: 'A100',
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
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
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
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
    ...overrides,
  };
}

const NO_DEPS: DependencySummary[] = [];
const MOVED = activity({ earlyStart: '2026-01-08', earlyFinish: '2026-01-10' });

interface PanelState {
  activities: readonly ActivitySummary[];
  recalcPending: boolean;
  projectFinish: string | null;
}

type PanelProps = React.ComponentProps<typeof TsldPanel>;
type RepositionMock = Mock<NonNullable<PanelProps['onReposition']>>;
type ResizeMock = Mock<NonNullable<PanelProps['onResize']>>;

function renderPanel(
  initial: PanelState,
  handlers: { onReposition?: RepositionMock; onResize?: ResizeMock } = {},
) {
  const onReposition: RepositionMock =
    handlers.onReposition ??
    vi.fn<NonNullable<PanelProps['onReposition']>>().mockResolvedValue({
      applied: true,
      conflict: null,
    });
  const onResize: ResizeMock =
    handlers.onResize ??
    vi.fn<NonNullable<PanelProps['onResize']>>().mockResolvedValue({
      applied: true,
      conflict: null,
    });
  const view = (state: PanelState) => (
    <TsldPanel
      activities={state.activities}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit
      onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
      onReposition={onReposition}
      onResize={onResize}
      recalcPending={state.recalcPending}
      projectFinish={state.projectFinish}
    />
  );
  const utils = render(view(initial));
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return {
    canvas,
    onReposition,
    onResize,
    container: utils.container,
    update: (state: PanelState) => utils.rerender(view(state)),
  };
}

/** Focus the parallel listbox (which default-selects the first activity) and return it. */
function focusedListbox(): HTMLElement {
  const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  fireEvent.focus(listbox);
  return listbox;
}

/** Drag the lane-0 bar's body to the right — the canonical reposition-in-time gesture. */
function dragBarRight(canvas: Element): void {
  fireEvent.pointerDown(canvas, { clientX: 60, clientY: 54, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 110, clientY: 54, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 110, clientY: 54, pointerId: 1 });
}

/** Drag the lane-0 bar straight down — a lane-only move, which triggers no recalculation. */
function dragBarDown(canvas: Element): void {
  fireEvent.pointerDown(canvas, { clientX: 60, clientY: 54, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 60, clientY: 82, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 60, clientY: 82, pointerId: 1 });
}

beforeEach(() => announceSpy.mockClear());

describe('TsldPanel — the recalculation settle', () => {
  const idle: PanelState = {
    activities: [activity()],
    recalcPending: false,
    projectFinish: '2026-03-01',
  };

  it('states the edited activity’s new dates once the coalesced recalculation settles', async () => {
    const { canvas, onReposition, update } = renderPanel(idle);
    dragBarRight(canvas);
    await waitFor(() => expect(onReposition).toHaveBeenCalled());
    announceSpy.mockClear(); // drop the pre-settle "dates will update" promise

    update({ ...idle, recalcPending: true });
    update({ ...idle, activities: [MOVED], recalcPending: false });

    expect(announceSpy).toHaveBeenCalledExactlyOnceWith(
      '“Excavate” now 08 Jan 2026 to 10 Jan 2026.',
    );
  });

  it('adds the project finish as a second sentence when the settle moved it too', async () => {
    const { canvas, onReposition, update } = renderPanel(idle);
    dragBarRight(canvas);
    await waitFor(() => expect(onReposition).toHaveBeenCalled());
    announceSpy.mockClear();

    update({ ...idle, recalcPending: true });
    update({ activities: [MOVED], recalcPending: false, projectFinish: '2026-03-14' });

    expect(announceSpy).toHaveBeenCalledExactlyOnceWith(
      '“Excavate” now 08 Jan 2026 to 10 Jan 2026. Project finish moved to 14 Mar 2026.',
    );
  });

  it('says nothing when the recalculation moved neither the activity nor the finish', async () => {
    const { canvas, onReposition, update } = renderPanel(idle);
    dragBarRight(canvas);
    await waitFor(() => expect(onReposition).toHaveBeenCalled());
    announceSpy.mockClear();

    update({ ...idle, recalcPending: true });
    update({ ...idle, recalcPending: false });

    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('says nothing about a recalculation the planner did not cause here', () => {
    const { update } = renderPanel(idle);

    update({ ...idle, recalcPending: true });
    update({ activities: [MOVED], recalcPending: false, projectFinish: '2026-03-14' });

    expect(announceSpy).not.toHaveBeenCalled();
  });

  /**
   * A pure lane move is layout only — the route takes the no-recalc path (`TsldPanel.editing.test`
   * pins that it sends `laneIndex` alone). Noting it would leave an open note that the next
   * unrelated recalculation consumed, narrating somebody else's change as this planner's.
   */
  it('does not claim a lane-only move as the cause of the next recalculation', async () => {
    const { canvas, onReposition, update } = renderPanel(idle);
    dragBarDown(canvas);
    await waitFor(() => expect(onReposition).toHaveBeenCalled());
    expect(onReposition.mock.calls[0]?.[0]).toEqual({ activityId: 'a1', laneIndex: 1 });
    announceSpy.mockClear();

    update({ ...idle, recalcPending: true });
    update({ activities: [MOVED], recalcPending: false, projectFinish: '2026-03-14' });

    expect(announceSpy).not.toHaveBeenCalled();
  });

  /**
   * **The promise and the result are different sentences, one per phase** (ADR-0073: distinct facts
   * must not collapse into one channel's worth of wording). The edit says what it *did*, before the
   * dates exist; the settle says what they *are*. Neither is the manual button's status word.
   */
  it('keeps the pre-settle promise, the settle result and the manual confirmation distinct', async () => {
    const { canvas, onReposition, update } = renderPanel(idle);
    dragBarRight(canvas);
    await waitFor(() => expect(onReposition).toHaveBeenCalled());

    const promise = announceSpy.mock.calls.at(-1)?.[0] as string;
    expect(promise).toContain('dates will update');
    expect(promise).not.toBe(MANUAL_CONFIRMATION);

    update({ ...idle, recalcPending: true });
    // The promise is spoken in the edit phase and never again — the settle fires exactly one more.
    expect(announceSpy).toHaveBeenCalledTimes(1);
    update({ ...idle, activities: [MOVED], recalcPending: false });

    expect(announceSpy).toHaveBeenCalledTimes(2);
    const result = announceSpy.mock.calls.at(-1)?.[0] as string;
    expect(result).not.toBe(promise);
    expect(result).not.toBe(MANUAL_CONFIRMATION);
    expect(result).not.toContain('will update');
  });
});

/**
 * **The same edit, made from the keyboard** (the M6 gate finding, WCAG 4.1.3).
 *
 * The settle was noted only from the panel's pointer-gesture handler (`onIntent`), and the keyboard
 * equivalents commit through their own coalescing hooks — so `Alt`+arrow and `Shift`+arrow reached
 * the API without ever noting the edit. The announcer then returned early on every settle
 * (`if (!baseline) return;`), and a keyboard user heard the promise ("…dates will update.") followed
 * by permanent silence, while the identical mouse edit got both sentences.
 *
 * The note now happens at the ONE seam both routes share — the host's `onReposition`/`onResize`
 * callbacks — rather than at three call sites kept in step by hand, which is why these assertions
 * mirror the pointer ones above rather than describing a second mechanism.
 */
describe('TsldPanel — the settle speaks for keyboard edits too', () => {
  const idle: PanelState = {
    activities: [activity()],
    recalcPending: false,
    projectFinish: '2026-03-01',
  };

  it('states the new dates after an Alt+→ time nudge settles', async () => {
    const { onReposition, update } = renderPanel(idle);
    fireEvent.keyDown(focusedListbox(), { key: 'ArrowRight', altKey: true });
    await waitFor(() =>
      expect(onReposition).toHaveBeenCalledWith({ activityId: 'a1', startDay: 1 }),
    );
    announceSpy.mockClear(); // drop the pre-settle "dates will update" promise

    update({ ...idle, recalcPending: true });
    update({ ...idle, activities: [MOVED], recalcPending: false });

    expect(announceSpy).toHaveBeenCalledExactlyOnceWith(
      '“Excavate” now 08 Jan 2026 to 10 Jan 2026.',
    );
  });

  it('states the new dates after a Shift+→ duration nudge settles', async () => {
    const { onResize, update } = renderPanel(idle);
    fireEvent.keyDown(focusedListbox(), { key: 'ArrowRight', shiftKey: true });
    await waitFor(() =>
      expect(onResize).toHaveBeenCalledWith({ activityId: 'a1', durationDays: 4 }),
    );
    announceSpy.mockClear();

    update({ ...idle, recalcPending: true });
    update({ activities: [MOVED], recalcPending: false, projectFinish: '2026-03-14' });

    expect(announceSpy).toHaveBeenCalledExactlyOnceWith(
      '“Excavate” now 08 Jan 2026 to 10 Jan 2026. Project finish moved to 14 Mar 2026.',
    );
  });

  /**
   * The keyboard half of the pointer suite's lane-only rule, and the reason the shared seam notes on
   * the WRITE rather than on the keystroke: `Alt`+↓ sends `laneIndex` alone, which recalculates
   * nothing. A note taken there would sit open until some unrelated recalculation settled, and then
   * be narrated as this planner's doing.
   */
  it('does not claim an Alt+↓ lane nudge as the cause of the next recalculation', async () => {
    const { onReposition, update } = renderPanel(idle);
    fireEvent.keyDown(focusedListbox(), { key: 'ArrowDown', altKey: true });
    await waitFor(() =>
      expect(onReposition).toHaveBeenCalledExactlyOnceWith({ activityId: 'a1', laneIndex: 1 }),
    );
    announceSpy.mockClear();

    update({ ...idle, recalcPending: true });
    update({ activities: [MOVED], recalcPending: false, projectFinish: '2026-03-14' });

    expect(announceSpy).not.toHaveBeenCalled();
  });

  /**
   * **The interim state, on the surface the keyboard user is actually on.** `aria-busy` for an
   * in-flight write sat only on the canvas's outer container — a `div` with no role and no
   * accessible name, structurally separate from the `role="listbox"` a keyboard planner is focused
   * on and nudging from. So the pointer path had a busy cursor AND a busy state, and the keyboard
   * path had neither: the write was simply invisible until it settled.
   */
  it('marks the listbox busy while a keyboard nudge’s write is in flight', async () => {
    let settle: ((outcome: { applied: boolean; conflict: null }) => void) | undefined;
    const onReposition = vi.fn<NonNullable<PanelProps['onReposition']>>().mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderPanel(idle, { onReposition });
    const listbox = focusedListbox();
    expect(listbox).not.toHaveAttribute('aria-busy');

    fireEvent.keyDown(listbox, { key: 'ArrowRight', altKey: true });
    await waitFor(() => expect(onReposition).toHaveBeenCalled());
    await waitFor(() => expect(listbox).toHaveAttribute('aria-busy', 'true'));

    settle?.({ applied: true, conflict: null });
    await waitFor(() => expect(listbox).not.toHaveAttribute('aria-busy'));
  });
});
