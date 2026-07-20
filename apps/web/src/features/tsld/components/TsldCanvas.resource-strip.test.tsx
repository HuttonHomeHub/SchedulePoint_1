import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as PaintModule from '../render/paint';

import { RESOURCE_STRIP_HEIGHT, TsldCanvas } from './TsldCanvas';

import type { RenderActivity } from '@/features/tsld/render/render-model';
import type { ResourceStripSnapshot } from '@/features/tsld/render/resource-strip';

// Spy on the two painters WITHOUT changing their behaviour, so we can assert the dirty-flag gating
// (ADR-0049): a viewport move repaints BOTH scene + strip (shared `dirtyRef`); a strip-only data change
// repaints ONLY the strip (`stripDirtyRef`, scene untouched).
vi.mock('../render/paint', async (importActual) => {
  const actual = await importActual<typeof PaintModule>();
  return {
    ...actual,
    paintScene: vi.fn(actual.paintScene),
    paintResourceStrip: vi.fn(actual.paintResourceStrip),
  };
});

const { paintResourceStrip, paintScene } = PaintModule;

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

const SNAPSHOT: ResourceStripSnapshot = {
  series: { resourceId: 'r1', values: [4, 10, 2], total: 16 },
  dayOffsets: [
    { start: 0, end: 7 },
    { start: 7, end: 14 },
    { start: 14, end: 21 },
  ],
  dataDate: '2026-01-01',
  max: 10,
};

function baseProps() {
  return {
    activities: ACTIVITIES,
    edges: [],
    dataDate: '2026-01-01',
    selectedId: null,
    onSelect: vi.fn(),
    fitSignal: 0,
  } as const;
}

beforeEach(() => {
  vi.mocked(paintScene).mockClear();
  vi.mocked(paintResourceStrip).mockClear();
});

describe('TsldCanvas resource strip (Stage E, ADR-0049)', () => {
  it('mounts NO strip layer when inactive — the scene is byte-for-byte today (parity gate)', async () => {
    const { container, queryByTestId } = render(<TsldCanvas {...baseProps()} />);
    // No third canvas, and the strip painter is never invoked while inactive.
    expect(queryByTestId('tsld-resource-strip')).toBeNull();
    // Exactly one canvas (the aria-hidden scene) — no interaction layer (not editing), no strip.
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    await waitFor(() => expect(paintScene).toHaveBeenCalled());
    expect(paintResourceStrip).not.toHaveBeenCalled();
  });

  it('mounts an aria-hidden, pointer-transparent strip band pinned to the bottom when active', () => {
    const { getByTestId } = render(
      <TsldCanvas {...baseProps()} resourceStripActive resourceStrip={SNAPSHOT} />,
    );
    const strip = getByTestId('tsld-resource-strip');
    expect(strip.tagName).toBe('CANVAS');
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    expect(strip.className).toContain('pointer-events-none');
    expect(strip.className).toContain('bottom-0');
    expect(strip.style.height).toBe(`${RESOURCE_STRIP_HEIGHT}px`);
  });

  it('sizes the strip backing store at the same DPR as the scene canvas', async () => {
    const original = globalThis.devicePixelRatio;
    globalThis.devicePixelRatio = 2;
    try {
      const { container, getByTestId } = render(
        <TsldCanvas {...baseProps()} resourceStripActive resourceStrip={SNAPSHOT} />,
      );
      const scene = container.querySelector('canvas')!;
      const strip = getByTestId('tsld-resource-strip') as HTMLCanvasElement;
      await waitFor(() => expect(strip.width).toBeGreaterThan(0));
      // Same DPR-scaled backing-store WIDTH as the scene canvas (mirrors the scene's sizing).
      expect(strip.width).toBe(scene.width);
      // Its own FIXED band height × dpr (only the width follows the container).
      expect(strip.height).toBe(Math.round(RESOURCE_STRIP_HEIGHT * 2));
    } finally {
      globalThis.devicePixelRatio = original;
    }
  });

  it('repaints the strip on a viewport move (shared dirtyRef repaints BOTH scene and strip)', async () => {
    const { container } = render(
      <TsldCanvas {...baseProps()} resourceStripActive resourceStrip={SNAPSHOT} />,
    );
    const scene = container.querySelector('canvas')!;
    await waitFor(() => expect(paintResourceStrip).toHaveBeenCalled());
    vi.mocked(paintScene).mockClear();
    vi.mocked(paintResourceStrip).mockClear();

    // A wheel zoom sets `dirtyRef` — the scene repaints that frame anyway, and the strip re-aligns for
    // free on the SAME frame (no extra scene cost).
    fireEvent.wheel(scene, { deltaY: -100 });
    await waitFor(() => expect(paintResourceStrip).toHaveBeenCalled());
    expect(paintScene).toHaveBeenCalled();
  });

  it('forwards the over-allocation flagged set into paintScene when the highlight is on (N7a)', async () => {
    const flaggedIds = new Set(['a1']);
    render(<TsldCanvas {...baseProps()} flaggedIds={flaggedIds} />);
    // The over-allocation highlight rides the SAME scene the painter draws — assert the flagged set
    // reaches `paintScene` (the badge is a per-bar `Set.has` in the existing pass, ADR-0049 M2).
    await waitFor(() =>
      expect(paintScene).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ flaggedIds }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ),
    );
  });

  it('repaints ONLY the strip on a data change — a strip-only change does NOT repaint the scene', async () => {
    const props = baseProps();
    const { rerender } = render(
      <TsldCanvas {...props} resourceStripActive resourceStrip={SNAPSHOT} />,
    );
    await waitFor(() => expect(paintResourceStrip).toHaveBeenCalled());
    // Let every dirty mount frame flush before clearing, so the assertion below reflects ONLY the
    // data-change repaint (not a lingering mount frame). Once quiesced, idle frames paint nothing.
    await new Promise((r) => setTimeout(r, 80));
    vi.mocked(paintScene).mockClear();
    vi.mocked(paintResourceStrip).mockClear();

    // Publish a NEW snapshot (a picker/bucket switch) with the SAME scene inputs. This sets only
    // `stripDirtyRef`, never `dirtyRef`, so the strip repaints and the main scene does NOT.
    const next: ResourceStripSnapshot = {
      ...SNAPSHOT,
      series: { resourceId: 'r2', values: [1, 2, 3], total: 6 },
      max: 3,
    };
    rerender(<TsldCanvas {...props} resourceStripActive resourceStrip={next} />);
    await waitFor(() => expect(paintResourceStrip).toHaveBeenCalled());
    expect(paintScene).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
