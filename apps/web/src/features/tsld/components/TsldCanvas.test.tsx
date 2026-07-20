import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TsldCanvas, type TsldCanvasHandle } from './TsldCanvas';

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
  });
});
