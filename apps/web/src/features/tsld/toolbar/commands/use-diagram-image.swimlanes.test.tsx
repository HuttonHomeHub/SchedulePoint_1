import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EXPORT_GUTTER_WIDTH } from '../../export/export-swimlane-gutter';
import type { RenderExportImageInput } from '../../export/render-export-image';
import { DEFAULT_VIEW_TOGGLES } from '../../render/paint';
import type { SwimlaneInput } from '../../render/project-swimlanes';

import { useDiagramImage } from './use-diagram-image';

import type { LoadedPlan } from '@/components/layout/workspace/use-plan-workspace-model';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The picture is divided into swimlanes iff the screen is** (swimlanes M2-T7). The hook is the one
 * place the export's scene, its viewport and the composer's inputs are assembled from the same
 * projection, so this is where "the rule, the ground and the gutter mirror reach the picture, and a
 * swimlane-free picture is the prior one" is asserted — with the renderer mocked, since what is
 * under test is what it is HANDED.
 */
const rendered = vi.hoisted(() => vi.fn());
vi.mock('../../export/render-export-image', () => ({
  renderExportImage: rendered,
}));

const PLAN = { name: 'North Tower', plannedStart: '2026-01-01' } as unknown as LoadedPlan;

// The picture draws the planning surface's dates (`visualEffective*`), so those are the ones set.
const placed = (id: string, laneIndex: number, start: string, finish: string) =>
  anActivity({
    id,
    laneIndex,
    earlyStart: start,
    earlyFinish: finish,
    visualEffectiveStart: start,
    visualEffectiveFinish: finish,
  });

const ACTIVITIES = [
  placed('a', 0, '2026-01-02', '2026-01-09'),
  placed('b', 1, '2026-01-03', '2026-01-10'),
  placed('c', 2, '2026-01-20', '2026-01-25'),
];

const SWIMLANES: SwimlaneInput = {
  swimlanes: [
    { id: 's1', name: 'Mechanical' },
    { id: 's2', name: 'Electrical' },
  ],
  membership: new Map([
    ['a', 's1'],
    ['b', 's2'],
  ]),
  storedLanes: new Map(),
};

const canvasControlRef = {
  current: {
    getViewport: () => ({
      view: { pxPerDay: 20, originX: 0, originY: 0 },
      size: { width: 800, height: 600 },
    }),
  },
} as unknown as React.RefObject<never>;

function exportWith(swimlanes: SwimlaneInput | null, swimlaneGround?: boolean) {
  const { result } = renderHook(() =>
    useDiagramImage({
      plan: PLAN,
      activities: ACTIVITIES,
      dependencies: [],
      swimlanes,
      ...(swimlaneGround === undefined ? {} : { swimlaneGround }),
      viewToggles: DEFAULT_VIEW_TOGGLES,
      tsldCalendar: null,
      todayIso: '2026-01-05',
      todayFraction: undefined,
      lateOverlayActive: false,
      canvasControlRef,
    }),
  );
  const built = result.current('whole');
  const input = rendered.mock.calls.at(-1)![0] as RenderExportImageInput;
  return { built, input };
}

describe('useDiagramImage with swimlanes', () => {
  beforeEach(() => {
    rendered.mockReset();
    rendered.mockResolvedValue(new Blob(['png']));
  });

  it('hands the composer the rule, the ground and the gutter mirror, off one projection', () => {
    const { built, input } = exportWith(SWIMLANES, true);

    expect(input.scene.swimlaneMarks).toEqual({
      ground: true,
      extents: [
        expect.objectContaining({ id: 's1', name: 'Mechanical', firstLane: 0, laneCount: 1 }),
        expect.objectContaining({ id: 's2', name: 'Electrical', firstLane: 1, laneCount: 1 }),
        expect.objectContaining({ id: null, firstLane: 2, laneCount: 1 }),
      ],
    });
    // The mirror is handed what the screen's gutter is: each extent plus how many activities it holds.
    expect(input.swimlaneGutter?.swimlanes.map((s) => [s.id, s.activityCount])).toEqual([
      ['s1', 1],
      ['s2', 1],
      [null, 1],
    ]);
    expect(built?.swimlanesDrawn).toBe(true);
  });

  it('reserves the gutter at the left, and only the left', () => {
    const without = exportWith(null);
    const withLanes = exportWith(SWIMLANES);

    expect(withLanes.input.size.width).toBe(without.input.size.width + EXPORT_GUTTER_WIDTH);
    expect(withLanes.input.viewport.originX).toBe(
      without.input.viewport.originX + EXPORT_GUTTER_WIDTH,
    );
    expect(withLanes.input.viewport.pxPerDay).toBe(without.input.viewport.pxPerDay);
  });

  it('is the prior picture without swimlanes: no marks, no mirror, no gutter width (SC-3)', () => {
    const { built, input } = exportWith(null);

    expect(input.scene.swimlaneMarks).toBeUndefined();
    expect('swimlaneGutter' in input).toBe(false);
    expect(built?.swimlanesDrawn).toBe(false);
    // The same plan with swimlanes is exactly the column wider (the reservation test above); here
    // the point is that nothing of it is reserved when they are off.
    expect(input.size.width).toBe(exportWith(SWIMLANES).input.size.width - EXPORT_GUTTER_WIDTH);
  });

  it('tints nothing unless the host says the ground is on', () => {
    expect(exportWith(SWIMLANES).input.scene.swimlaneMarks?.ground).toBe(false);
    expect(exportWith(SWIMLANES, true).input.scene.swimlaneMarks?.ground).toBe(true);
  });
});
