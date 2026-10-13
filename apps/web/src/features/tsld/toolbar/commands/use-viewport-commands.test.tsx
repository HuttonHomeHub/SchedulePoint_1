import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useViewportCommands } from './use-viewport-commands';

const announce = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

function setup(): { stepZoom: (factor: number) => void; canvasStep: ReturnType<typeof vi.fn> } {
  const canvasStep = vi.fn();
  const { result } = renderHook(() =>
    useViewportCommands({
      canvasControlRef: { current: { stepZoom: canvasStep } as never },
      setCanvasZoomPreset: vi.fn(),
      selectedActivityId: null,
      selectedActivityName: null,
    }),
  );
  return { stepZoom: result.current.stepZoom, canvasStep };
}

describe('stepZoom', () => {
  it('steps the canvas and says which way, for the cluster and the View panel alike', () => {
    announce.mockClear();
    const { stepZoom, canvasStep } = setup();
    stepZoom(2);
    expect(canvasStep).toHaveBeenLastCalledWith(2);
    expect(announce).toHaveBeenLastCalledWith('Zoomed in.');
    stepZoom(0.5);
    expect(canvasStep).toHaveBeenLastCalledWith(0.5);
    expect(announce).toHaveBeenLastCalledWith('Zoomed out.');
  });
});
