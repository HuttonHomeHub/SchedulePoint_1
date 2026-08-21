import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MINIMAP_BOX, TsldMinimap } from './TsldMinimap';

import type { RenderActivity } from '@/features/tsld/render/render-model';

/**
 * The minimap panel's DOM contract (ADR-0100, M2-T2): a named group, an `aria-hidden`
 * picture, DOM overlays for the marks that move without a scene change, and the AC-1.4
 * empty state. The loop-facing behaviour (build discipline, rectangle transforms) is the
 * host's and lives in `TsldCanvas.hidden-pane.test.tsx`.
 */
function activity(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    label: 'Substructure piling',
    earlyStart: '2026-01-02',
    earlyFinish: '2026-03-01',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

function mount(props: Partial<React.ComponentProps<typeof TsldMinimap>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <TsldMinimap
      activities={[activity()]}
      dataDate="2026-01-01"
      selectedId={null}
      bottomOffsetPx={0}
      onClose={onClose}
      bitmapCanvasRef={createRef<HTMLCanvasElement>()}
      rectRef={createRef<HTMLDivElement>()}
      {...props}
    />,
  );
  return { onClose, ...utils };
}

describe('TsldMinimap', () => {
  it('renders a named group; the picture canvas is aria-hidden; the rectangle is present', () => {
    mount();
    const group = screen.getByRole('group', { name: 'Diagram overview' });
    expect(group).toBeInTheDocument();
    const picture = screen.getByTestId('tsld-minimap-picture');
    expect(picture).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('tsld-minimap-rect')).toBeInTheDocument();
  });

  it('states there is nothing to show when no activity has computed dates (AC-1.4)', () => {
    mount({ activities: [activity({ earlyStart: null, earlyFinish: null })] });
    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('tsld-minimap-picture')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tsld-minimap-rect')).not.toBeInTheDocument();
  });

  it('offsets above the resource strip when told to', () => {
    mount({ bottomOffsetPx: 72 });
    const group = screen.getByRole('group', { name: 'Diagram overview' });
    expect(group.style.bottom).toBe(`${12 + 72}px`);
  });

  it('renders the selection marker at ≥3×3px for a placed selection, and not otherwise', () => {
    const { rerender, onClose } = mount({
      activities: [
        activity(),
        // A one-day activity in a high lane of a long plan: raw geometry well under 1px.
        activity({
          id: 'dot',
          earlyStart: '2026-01-05',
          earlyFinish: '2026-01-05',
          laneIndex: 199,
        }),
        activity({
          id: 'far',
          earlyStart: '2036-01-01',
          earlyFinish: '2036-02-01',
          laneIndex: 120,
        }),
      ],
      selectedId: 'dot',
    });
    const marker = screen.getByTestId('tsld-minimap-selection');
    expect(Number.parseFloat(marker.style.width)).toBeGreaterThanOrEqual(3);
    expect(Number.parseFloat(marker.style.height)).toBeGreaterThanOrEqual(3);
    expect(marker).toHaveAttribute('aria-hidden', 'true');

    rerender(
      <TsldMinimap
        activities={[activity()]}
        dataDate="2026-01-01"
        selectedId={null}
        bottomOffsetPx={0}
        onClose={onClose}
        bitmapCanvasRef={createRef<HTMLCanvasElement>()}
        rectRef={createRef<HTMLDivElement>()}
      />,
    );
    expect(screen.queryByTestId('tsld-minimap-selection')).not.toBeInTheDocument();
  });

  it('renders the Today vertical from the HOST-resolved day, only when inside the span', () => {
    // Today arrives resolved (M4 B2: the panel must never re-derive the clock — the first
    // draft did, in UTC, a whole day out west of UTC every evening).
    const { rerender, onClose } = mount({ todayDay: 20 }); // inside the ~59-day span
    expect(screen.getByTestId('tsld-minimap-today')).toBeInTheDocument();
    rerender(
      <TsldMinimap
        activities={[activity()]}
        dataDate="2026-01-01"
        selectedId={null}
        bottomOffsetPx={0}
        onClose={onClose}
        bitmapCanvasRef={createRef<HTMLCanvasElement>()}
        rectRef={createRef<HTMLDivElement>()}
        todayDay={4000}
      />,
    );
    expect(screen.queryByTestId('tsld-minimap-today')).not.toBeInTheDocument();
  });

  it('close returns focus to the control that opened it, never <body> (M2-T6)', () => {
    // Simulate the opener: a button focused at mount time (the View ▾ row in the product).
    const opener = document.createElement('button');
    opener.textContent = 'Minimap';
    document.body.appendChild(opener);
    opener.focus();

    const { onClose } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Hide overview' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    expect(document.activeElement).not.toBe(document.body);
    opener.remove();
  });

  it('falls back to the diagram surface when the captured opener is unusable (reloaded page)', () => {
    // The journey's finding: the panel persists across reloads, and on a reloaded page nothing
    // is focused at mount, so the opener capture is <body> — focusing it IS the drop this
    // handler exists to prevent. Verified red against the opener-only close.
    const surface = document.createElement('ul');
    surface.tabIndex = 0;
    document.body.appendChild(surface);
    // Nothing focused at mount — activeElement is <body>, the reload shape.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const { onClose } = mount({ dismissFocusRef: { current: surface } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide overview' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(surface);
    surface.remove();
  });

  it('the close button is the 44px icon-lg size (UX_STANDARDS floor for new panel chrome)', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Hide overview' }).className).toContain('size-11');
  });

  it('the box is the fixed 200×120 (product Q3)', () => {
    expect(MINIMAP_BOX).toEqual({ width: 200, height: 120 });
  });
});
