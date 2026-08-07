import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { liveLag, liveResize, TsldCanvas, type TsldCanvasHandle } from './TsldCanvas';

import type { RenderActivity } from '@/features/tsld/render/render-model';

const ACTIVITIES: RenderActivity[] = [
  {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    label: 'a1',
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: true,
    isNearCritical: false,
  },
];

function renderCanvas(onSelect = vi.fn()) {
  const utils = render(
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate="2026-01-01"
      selectedId={null}
      onSelect={onSelect}
      fitSignal={0}
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return { ...utils, canvas, onSelect };
}

describe('TsldCanvas', () => {
  it('renders an aria-hidden canvas (the sighted-only surface)', () => {
    const { canvas } = renderCanvas();
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('prevents default on wheel so zooming does not scroll the page', () => {
    const { canvas } = renderCanvas();
    const event = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('treats a pointer down+up without movement as a click and calls onSelect', () => {
    const { canvas, onSelect } = renderCanvas();
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('treats a drag past the threshold as a pan, not a click (no onSelect)', () => {
    const { canvas, onSelect } = renderCanvas();
    fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 40, clientY: 0, pointerId: 1 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('populates the aria-hidden date ruler with year + month labels for the data date', async () => {
    const { container } = render(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-03-16"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
      />,
    );
    const ruler = container.querySelector('[data-testid="tsld-ruler"]');
    expect(ruler).toHaveAttribute('aria-hidden', 'true'); // never in the a11y tree
    // The rAF loop fills the ruler DOM from the viewport; the current year/month are labelled.
    await waitFor(() => expect(ruler?.textContent).toContain('2026'));
    expect(ruler?.textContent).toContain('Mar');
  });

  it('switching tools mid-LOE-pick clears the stale pick (no premature auto-commit on re-arm)', () => {
    // Regression for the cross-modality mid-pick gap (Stage D, docs/specs/canvas-activity-types/):
    // a planner picks the LOE start driver, then bounces to another tool (Select) and back to LOE
    // WITHOUT an Escape/cancel click. If the in-flight gesture survived the tool switch, the very
    // next click would be misread as the pick's SECOND click and silently compose a span from the
    // abandoned driver — never intended by the planner. The mode-switch reset effect in `TsldCanvas`
    // must drop the stale `loePicking` state so the next click is a fresh first pick.
    const twoActivities: RenderActivity[] = [
      {
        id: 'a1',
        type: 'TASK',
        laneIndex: 0,
        label: 'a1',
        earlyStart: '2026-01-02',
        earlyFinish: '2026-01-05',
        isCritical: false,
        isNearCritical: false,
      },
      {
        id: 'a2',
        type: 'TASK',
        laneIndex: 1,
        label: 'a2',
        earlyStart: '2026-01-02',
        earlyFinish: '2026-01-05',
        isCritical: false,
        isNearCritical: false,
      },
    ];
    const onIntent = vi.fn();
    const onLoeSpanStep = vi.fn();
    const baseProps = {
      activities: twoActivities,
      edges: [],
      dataDate: '2026-01-01',
      selectedId: null,
      onSelect: vi.fn(),
      fitSignal: 0,
      editing: true,
      onIntent,
      onLoeSpanStep,
    };
    const { container, rerender } = render(<TsldCanvas {...baseProps} mode="loe" />);
    const canvas = container.querySelector('canvas')!;

    // Pick a1 as the LOE start driver (body zone: x in (62, 102), y in (45, 63) at the default
    // viewport) — armed, awaiting the finish driver.
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: 54, pointerId: 1 });
    expect(onLoeSpanStep).toHaveBeenCalledExactlyOnceWith({ kind: 'start', startId: 'a1' });
    expect(onIntent).not.toHaveBeenCalled();

    // Abandon the pick mid-flow: bounce to Select and back to LOE — no Escape, no cancel click.
    rerender(<TsldCanvas {...baseProps} mode="select" />);
    rerender(<TsldCanvas {...baseProps} mode="loe" />);

    // The very next click (on a2, lane 1: y in (73, 91)) must be a FRESH first pick, not a silent
    // commit reusing the abandoned a1 driver.
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: 80, pointerId: 1 });
    expect(onIntent).not.toHaveBeenCalled();
    expect(onLoeSpanStep).toHaveBeenLastCalledWith({ kind: 'start', startId: 'a2' });
  });

  it('seeds the LOE pick from a controlled loePickStartId so keyboard-start → pointer-finish composes (B3)', () => {
    // Single-sourced cross-modality pick (Stage D, docs/specs/canvas-activity-types/): a keyboard-side
    // start pick lives in TsldPanel's controlled `loePickStartId`. The canvas must SEED its internal
    // gesture from it so the next pointer click resolves as the SECOND pick against the keyboard-picked
    // start — not a fresh first pick that silently discards it. Here we hand the canvas a picked start
    // (a1) and click the finish (a2); it must emit a `loeSpan` intent, never a restart `start` step.
    const twoActivities: RenderActivity[] = [
      {
        id: 'a1',
        type: 'TASK',
        laneIndex: 0,
        label: 'a1',
        earlyStart: '2026-01-02',
        earlyFinish: '2026-01-05',
        isCritical: false,
        isNearCritical: false,
      },
      {
        id: 'a2',
        type: 'TASK',
        laneIndex: 1,
        label: 'a2',
        earlyStart: '2026-01-02',
        earlyFinish: '2026-01-05',
        isCritical: false,
        isNearCritical: false,
      },
    ];
    const onIntent = vi.fn();
    const onLoeSpanStep = vi.fn();
    const { container } = render(
      <TsldCanvas
        activities={twoActivities}
        edges={[]}
        dataDate="2026-01-01"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
        editing
        mode="loe"
        loePickStartId="a1"
        onIntent={onIntent}
        onLoeSpanStep={onLoeSpanStep}
      />,
    );
    const canvas = container.querySelector('canvas')!;

    // Click a2 (lane 1: y in (73, 91)) — resolves as the finish driver against the seeded start a1.
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: 80, pointerId: 1 });

    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'loeSpan', startDriverId: 'a1', finishDriverId: 'a2' }),
      expect.anything(),
    );
    // The click was NOT misread as a fresh first pick that would have discarded the keyboard start.
    expect(onLoeSpanStep).not.toHaveBeenCalled();
  });

  it('exposes an imperative zoom handle that reports the active preset only on a stop change', () => {
    // jsdom reports every element's `getBoundingClientRect` as all-zero, and range-anchored preset
    // scales (VITE_CANVAS_TIME_AXIS, on by default — F3) are WIDTH-derived: at the container's
    // otherwise-clamped 1px floor every preset's target scale coincides at MIN_PX_PER_DAY, so
    // `presetOf` can no longer tell day from year apart. Give the container a realistic width so
    // this exercises the same math a real layout would.
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 480,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const controlRef = createRef<TsldCanvasHandle>();
    const onZoomStopChange = vi.fn();
    render(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-01-01"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
        controlRef={controlRef}
        onZoomStopChange={onZoomStopChange}
      />,
    );
    act(() => controlRef.current!.zoomToPreset('day'));
    expect(onZoomStopChange).toHaveBeenLastCalledWith('day');
    act(() => controlRef.current!.zoomToPreset('year'));
    expect(onZoomStopChange).toHaveBeenLastCalledWith('year');
    // A second command to the SAME preset does not re-fire (coarse, stop-boundary only).
    const callsBefore = onZoomStopChange.mock.calls.length;
    act(() => controlRef.current!.zoomToPreset('year'));
    expect(onZoomStopChange.mock.calls.length).toBe(callsBefore);
    rectSpy.mockRestore();
  });
});

describe('liveResize / liveLag readouts (ADR-0052 M3 — pure overlay helpers)', () => {
  const VIEW = { pxPerDay: 10, originX: 0, originY: 0 };
  const walk = (dayOffset: number, n: number): number => dayOffset + n; // elapsed for readability

  it('labels a finish-edge resize with the tentative duration only', () => {
    const overlay = liveResize(
      {
        kind: 'resizing',
        activityId: 'a1',
        edge: 'finish',
        grabX: 0,
        movedPastThreshold: true,
        originStartDay: 2,
        originDurationDays: 4,
        laneIndex: 0,
        currentStartDay: 2,
        currentDurationDays: 7,
      },
      VIEW,
      '2026-01-01',
    )!;
    expect(overlay.label).toBe('7d');
    expect(overlay.rect.x).toBe(20); // start pinned at day 2
  });

  it('labels a start-edge resize with the new start DATE + duration, ghost at the new start', () => {
    const overlay = liveResize(
      {
        kind: 'resizing',
        activityId: 'a1',
        edge: 'start',
        grabX: 0,
        movedPastThreshold: true,
        originStartDay: 2,
        originDurationDays: 4,
        laneIndex: 0,
        currentStartDay: 0, // dragged left to the data date (2026-01-01)
        currentDurationDays: 6,
      },
      VIEW,
      '2026-01-01',
    )!;
    expect(overlay.label).toBe('01 Jan 2026 · 6d');
    expect(overlay.rect.x).toBe(0); // ghost's left edge tracks the tentative start
  });

  it('places the lag chip at the tentative anchor with the compact type ± lag label', () => {
    const state = {
      kind: 'lagDragging' as const,
      dependencyId: 'd1',
      depType: 'FS' as const,
      grabX: 0,
      movedPastThreshold: true,
      originLagDays: 1,
      currentLagDays: 3,
      predStartDay: 0,
      predFinishDay: 2,
      walk,
      anchorY: 14,
    };
    expect(liveLag(state, VIEW)).toEqual({ x: 60, y: 14, label: 'FS + 3d' }); // walk(3, 3) = 6
    expect(liveLag({ ...state, currentLagDays: -1 }, VIEW)).toEqual({
      x: 20,
      y: 14,
      label: 'FS - 1d',
    });
    expect(liveLag({ ...state, currentLagDays: 0 }, VIEW)!.label).toBe('FS + 0d');
  });

  it('returns null for any other gesture state', () => {
    expect(liveResize({ kind: 'idle' }, VIEW, '2026-01-01')).toBeNull();
    expect(liveLag({ kind: 'idle' }, VIEW)).toBeNull();
  });
});

/**
 * **The write-busy gate** (canvas status & feedback M2): `writeBusy` refuses only NEW edit grabs
 * while a reposition/resize write is in flight; pan, wheel zoom, hover and the plain click-select
 * stay live. `pending` keeps its create-popover meaning — a TOTAL gate. The panel-level halves
 * (the real prop composition, both error paths) live in `TsldPanel.editing.test.tsx` /
 * `TsldPanel.resize.test.tsx`, where the red-first proof against the old single gate ran.
 */
describe('TsldCanvas — the write-busy gate (canvas status & feedback M2)', () => {
  function renderBusy(overrides: { writeBusy?: boolean; pending?: boolean } = {}) {
    const onIntent = vi.fn();
    const onSelect = vi.fn();
    const utils = render(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-01-01"
        selectedId={null}
        onSelect={onSelect}
        fitSignal={0}
        editing
        mode="select"
        canReposition
        canResize
        onIntent={onIntent}
        writeBusy={overrides.writeBusy ?? false}
        pending={overrides.pending ? { startDay: 1, endDay: 4, laneIndex: 0 } : null}
      />,
    );
    const canvas = utils.container.querySelector('canvas');
    if (!canvas) throw new Error('canvas not rendered');
    return { ...utils, canvas, onIntent, onSelect };
  }

  it('refuses a NEW edit grab while writeBusy: a bar-body drag pans instead of arming a reposition', () => {
    const { canvas, onIntent, onSelect } = renderBusy({ writeBusy: true });
    // The a1 bar (days 1..4 at lane 0) body sits at x 62..102, y 45..63 at the default viewport.
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 54, pointerId: 1 });
    expect(onIntent).not.toHaveBeenCalled(); // the gesture never armed…
    expect(onSelect).not.toHaveBeenCalled(); // …and the drag was a pan, not a click
  });

  it('still selects on a stationary bar click while writeBusy (selection is a read)', () => {
    const { canvas, onIntent, onSelect } = renderBusy({ writeBusy: true });
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: 54, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith('a1');
    expect(onIntent).not.toHaveBeenCalled();
  });

  it('keeps wheel zoom live while writeBusy (still prevents default)', () => {
    const { canvas } = renderBusy({ writeBusy: true });
    const event = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('swaps the grab affordance for the busy (progress) cursor while writeBusy', () => {
    const { canvas, rerender } = renderBusy({ writeBusy: true });
    expect(canvas.className).toContain('cursor-progress');
    expect(canvas.className).not.toContain('cursor-grab');
    rerender(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-01-01"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
        editing
        mode="select"
        canReposition
        canResize
        onIntent={vi.fn()}
        writeBusy={false}
      />,
    );
    expect(canvas.className).toContain('cursor-grab');
  });

  it('suppresses the inline ew-resize handle affordance while writeBusy', () => {
    // The finish grab-zone is the bar's last 8px (x 102..110). Idle-hovering it normally
    // advertises the resize grab; while a write is in flight that grab would be refused, so the
    // zone must not advertise it — '' falls back to the class-based busy cursor.
    const busy = renderBusy({ writeBusy: true });
    fireEvent.pointerMove(busy.canvas, { clientX: 106, clientY: 54, pointerId: 1 });
    expect(busy.canvas.style.cursor).toBe('');
    busy.unmount();
    const live = renderBusy();
    fireEvent.pointerMove(live.canvas, { clientX: 106, clientY: 54, pointerId: 1 });
    expect(live.canvas.style.cursor).toBe('ew-resize');
  });

  it('carries aria-busy="true" on the container only while writeBusy', () => {
    const busy = renderBusy({ writeBusy: true });
    expect(busy.container.querySelector('[aria-busy="true"]')).not.toBeNull();
    busy.unmount();
    const live = renderBusy();
    expect(live.container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('keeps the create-popover gate TOTAL: while `pending` is set no pan starts and no gesture arms', () => {
    const { canvas, onIntent, onSelect } = renderBusy({ pending: true });
    // An attempted body drag arms nothing (the pointer-down returns before the pan setup)…
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 54, pointerId: 1 });
    expect(onIntent).not.toHaveBeenCalled();
    // …and an attempted pan moved nothing: the bar still answers a click at its ORIGINAL pixels.
    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 160, clientY: 200, pointerId: 2 });
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: 54, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: 54, pointerId: 3 });
    expect(onSelect).toHaveBeenLastCalledWith('a1');
    // The popover state is not "busy" — it is a held question, not an in-flight write.
    expect(canvas.className).not.toContain('cursor-progress');
  });
});

/**
 * **The recalculation-hold drop path** (ADR-0064 T7). When the 10-second cap expires, the workspace
 * recalculates anyway and bumps `dropLinkPickSignal`; the canvas must abandon the open pick and say
 * so upward, leaving the tool armed — the planner did not ask to stop linking, the schedule moved
 * underneath them.
 *
 * A pointer-driven pick needs a hit test against a canvas with real layout, which jsdom does not
 * provide (`TsldPanel.disarm.test.tsx` defers that half to Playwright for the same reason). The
 * pick is therefore seeded through `linkPickPredecessorId` — the same prop the panel uses to keep
 * the canvas and the panel agreeing about an open pick — which reaches the identical `gestureRef`
 * state the pointer path produces.
 */
describe('TsldCanvas — dropping an open link pick on the shell signal (T7)', () => {
  function renderWithPick(signal: number, onLinkPickStep: () => void) {
    return render(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-01-01"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
        mode="link"
        canLink
        linkPickPredecessorId={ACTIVITIES[0]!.id}
        dropLinkPickSignal={signal}
        onLinkPickStep={onLinkPickStep}
      />,
    );
  }

  it('reports the pick dropped when the signal changes', () => {
    const onLinkPickStep = vi.fn();
    const { rerender } = renderWithPick(0, onLinkPickStep);
    onLinkPickStep.mockClear(); // ignore the seeding echo
    rerender(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-01-01"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
        mode="link"
        canLink
        linkPickPredecessorId={ACTIVITIES[0]!.id}
        dropLinkPickSignal={1}
        onLinkPickStep={onLinkPickStep}
      />,
    );
    expect(onLinkPickStep).toHaveBeenCalledWith(null);
  });

  it('treats the initial 0 as "nothing has asked yet", not as a drop', () => {
    // The off-by-one that would silently cancel the first pick of every session.
    const onLinkPickStep = vi.fn();
    renderWithPick(0, onLinkPickStep);
    expect(onLinkPickStep).not.toHaveBeenCalledWith(null);
  });
});
