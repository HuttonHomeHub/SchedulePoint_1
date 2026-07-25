import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hover threading through the canvas (ADR-0052 M4/M5, component seam): the idle pointer-move
 * classify must publish the hovered bar's rect to the interaction layer (the hover ring) and its
 * id into the scene (the incident-link highlight), clear both on pointer-leave, suppress the ring
 * on the already-selected bar (no stacked double outline), and publish NOTHING flag-off (the
 * parity gate). The painters are mocked so the published overlay/scene are observable in jsdom
 * (which has no real 2D context); the paint output itself is covered by `paint.test.ts`.
 */
const flags = vi.hoisted(() => ({ directManipulation: true }));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get CANVAS_DIRECT_MANIPULATION_ENABLED() {
    return flags.directManipulation;
  },
}));

const paintMocks = vi.hoisted(() => ({
  // Loosely-typed parameters so the recorded calls are inspectable (`calls[i][1]` is the
  // published scene/overlay); the real signatures are enforced at the production call sites.
  paintScene: vi.fn((...args: unknown[]): string[] => {
    void args;
    return [];
  }),
  paintInteractionLayer: vi.fn((...args: unknown[]): void => {
    void args;
  }),
  paintResourceStrip: vi.fn(),
}));

vi.mock('../render/paint', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  paintScene: paintMocks.paintScene,
  paintInteractionLayer: paintMocks.paintInteractionLayer,
  paintResourceStrip: paintMocks.paintResourceStrip,
}));

import type { InteractionOverlay, TsldScene } from '../render/paint';
import type { RenderActivity } from '../render/render-model';

import { TsldCanvas } from './TsldCanvas';

const ACTIVITIES: RenderActivity[] = [
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
];

function renderCanvas(props: Partial<React.ComponentProps<typeof TsldCanvas>> = {}) {
  const utils = render(
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate="2026-01-01"
      selectedId={null}
      onSelect={vi.fn()}
      fitSignal={0}
      editing
      canResize
      {...props}
    />,
  );
  // The FIRST canvas is the scene surface carrying the pointer handlers (the interaction canvas
  // mounts after it and is pointer-transparent).
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return { ...utils, canvas };
}

const lastOverlay = (): InteractionOverlay =>
  paintMocks.paintInteractionLayer.mock.calls.at(-1)?.[1] as InteractionOverlay;
const lastScene = (): TsldScene => paintMocks.paintScene.mock.calls.at(-1)?.[1] as TsldScene;

describe('TsldCanvas — hover threading (ADR-0052 M4/M5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flags.directManipulation = true;
    // jsdom has no 2D context; a truthy stub lets the rAF loop reach the (mocked) painters.
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({});
  });

  it('publishes the hover ring + hovered id over a bar, and clears both on pointer-leave', async () => {
    const { canvas } = renderCanvas();
    // The a1 bar body at the default viewport (same coordinates the select-click tests use).
    fireEvent.pointerMove(canvas, { clientX: 70, clientY: 54, pointerId: 1 });
    await waitFor(() => {
      expect(lastOverlay().hover).toBeTruthy(); // the ring rect reached the interaction layer
      expect(lastScene().hoverId).toBe('a1'); // the incident-link highlight id rode the scene
    });
    fireEvent.pointerLeave(canvas);
    await waitFor(() => {
      expect(lastOverlay().hover).toBeNull();
      expect(lastScene().hoverId).toBeNull();
    });
  });

  it('publishes no hover ring over empty space', async () => {
    const { canvas } = renderCanvas();
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 300, pointerId: 1 });
    await waitFor(() => expect(paintMocks.paintScene).toHaveBeenCalled());
    for (const call of paintMocks.paintInteractionLayer.mock.calls) {
      expect((call[1] as InteractionOverlay).hover ?? null).toBeNull();
    }
  });

  it('suppresses the hover ring on the SELECTED bar (no stacked double outline)', async () => {
    const { canvas } = renderCanvas({ selectedId: 'a1' });
    fireEvent.pointerMove(canvas, { clientX: 70, clientY: 54, pointerId: 1 });
    // The incident-link hover highlight still publishes (it merely mirrors the selection's)…
    await waitFor(() => expect(lastScene().hoverId).toBe('a1'));
    // …but the ring never does — the ±2px selection ring already outlines this bar.
    for (const call of paintMocks.paintInteractionLayer.mock.calls) {
      expect((call[1] as InteractionOverlay).hover ?? null).toBeNull();
    }
  });

  it('publishes nothing when the flag is off (the parity gate)', async () => {
    flags.directManipulation = false;
    const { canvas } = renderCanvas();
    fireEvent.pointerMove(canvas, { clientX: 70, clientY: 54, pointerId: 1 });
    await waitFor(() => expect(paintMocks.paintScene).toHaveBeenCalled());
    for (const call of paintMocks.paintScene.mock.calls) {
      expect((call[1] as TsldScene).hoverId).toBeNull();
    }
    for (const call of paintMocks.paintInteractionLayer.mock.calls) {
      expect((call[1] as InteractionOverlay).hover ?? null).toBeNull();
      expect((call[1] as InteractionOverlay).visualRefresh).toBe(false);
    }
  });
});
