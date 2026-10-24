import { describe, expect, it } from 'vitest';

import { LANE_HEIGHT } from './geometry';
import {
  GUTTER_LINE_PX,
  GUTTER_MIN_CONTAINER_PX,
  GUTTER_MIN_STAGE_PX,
  gutterHasRoom,
  gutterWidthFor,
  SWIMLANE_GUTTER_COLLAPSED_PX,
  SWIMLANE_GUTTER_WIDTH_PX,
  swimlaneGutterModel,
  type SwimlaneGutterScene,
} from './swimlane-gutter';

import { MINIMAP_BOX } from '@/features/tsld/components/TsldMinimap';

const VIEW = { pxPerDay: 20, originX: 0, originY: 0 };
const SIZE = { width: 800, height: 6 * LANE_HEIGHT };

const SCENE: SwimlaneGutterScene = {
  widthPx: SWIMLANE_GUTTER_WIDTH_PX,
  collapsed: false,
  swimlanes: [
    { id: 'a', name: 'Mechanical', firstLane: 0, laneCount: 3, activityCount: 14 },
    { id: 'b', name: 'Electrical', firstLane: 3, laneCount: 1, activityCount: 1 },
    { id: null, name: null, firstLane: 4, laneCount: 2, activityCount: 0 },
  ],
};

describe('swimlaneGutterModel', () => {
  it('states each swimlane once, in stack order, with its box and counts', () => {
    const labels = swimlaneGutterModel(SCENE, VIEW, SIZE);
    expect(labels.map((l) => l.text)).toEqual(['Mechanical', 'Electrical', 'No swimlane']);
    expect(labels.map((l) => [l.top, l.height])).toEqual([
      [0, 3 * LANE_HEIGHT],
      [3 * LANE_HEIGHT, LANE_HEIGHT],
      [4 * LANE_HEIGHT, 2 * LANE_HEIGHT],
    ]);
    expect(labels[0]).toMatchObject({ activityCount: 14, laneCount: 3, position: 1 });
  });

  it('words the accessible name from the visible text, with singular and plural counts', () => {
    const [a, b, none] = swimlaneGutterModel(SCENE, VIEW, SIZE);
    expect(a?.accessibleName).toBe('Mechanical, swimlane 1 of 2, 14 activities, 3 lanes');
    expect(b?.accessibleName).toBe('Electrical, swimlane 2 of 2, 1 activity, 1 lane');
    expect(none?.accessibleName).toBe('No swimlane, 0 activities, 2 lanes');
  });

  it('keeps the label at the top of the visible part as the view pans (sticky)', () => {
    const panned = { ...VIEW, originY: -LANE_HEIGHT };
    const [a] = swimlaneGutterModel(SCENE, panned, SIZE);
    expect(a?.blockTop).toBe(-LANE_HEIGHT);
    expect(a?.top).toBe(0);
    expect(a?.height).toBe(2 * LANE_HEIGHT);
  });

  it('hides a swimlane that is wholly out of view rather than clamping it to an edge', () => {
    const panned = { ...VIEW, originY: -3 * LANE_HEIGHT };
    const [a, b] = swimlaneGutterModel(SCENE, panned, SIZE);
    expect(a?.visible).toBe(false);
    expect(a?.height).toBe(0);
    expect(b?.visible).toBe(true);
  });

  it('cuts a name that needs more lines than its swimlane is tall, and only then', () => {
    const long =
      'Mechanical, electrical and plumbing first fix and second fix, commissioning and handover';
    const scene: SwimlaneGutterScene = {
      ...SCENE,
      swimlanes: [{ id: 'a', name: long, firstLane: 0, laneCount: 1, activityCount: 1 }],
    };
    const [oneLane] = swimlaneGutterModel(scene, VIEW, SIZE);
    expect(oneLane?.maxLines).toBe(Math.floor(LANE_HEIGHT / GUTTER_LINE_PX));
    expect(oneLane?.cut).toBe(true);

    const [roomy] = swimlaneGutterModel(
      { ...scene, swimlanes: [{ ...scene.swimlanes[0]!, laneCount: 4 }] },
      VIEW,
      SIZE,
    );
    expect(roomy?.cut).toBe(false);
  });

  it('uses the caller-supplied measure for the cut judgement', () => {
    const scene: SwimlaneGutterScene = {
      ...SCENE,
      swimlanes: [{ id: 'a', name: 'Short', firstLane: 0, laneCount: 1, activityCount: 1 }],
    };
    expect(swimlaneGutterModel(scene, VIEW, SIZE, () => 10_000)[0]?.cut).toBe(true);
    expect(swimlaneGutterModel(scene, VIEW, SIZE, () => 1)[0]?.cut).toBe(false);
  });

  it('shows the number on the collapsed strip and keeps the full name in the accessible name', () => {
    const [a, , none] = swimlaneGutterModel(
      { ...SCENE, collapsed: true, widthPx: SWIMLANE_GUTTER_COLLAPSED_PX },
      VIEW,
      SIZE,
    );
    expect(a?.text).toBe('1');
    expect(a?.cut).toBe(false);
    expect(a?.accessibleName).toContain('Mechanical');
    expect(none?.text).toBe('–');
  });
});

describe('the room threshold', () => {
  it('is the expanded gutter plus three minimap widths of stage', () => {
    expect(GUTTER_MIN_STAGE_PX).toBe(MINIMAP_BOX.width * 3);
    expect(GUTTER_MIN_CONTAINER_PX).toBe(SWIMLANE_GUTTER_WIDTH_PX + MINIMAP_BOX.width * 3);
  });

  it('has room at and above the threshold, and not a pixel under it', () => {
    expect(gutterHasRoom(GUTTER_MIN_CONTAINER_PX)).toBe(true);
    expect(gutterHasRoom(GUTTER_MIN_CONTAINER_PX - 1)).toBe(false);
  });

  it('treats an unmeasured container as having room', () => {
    expect(gutterHasRoom(0)).toBe(true);
    expect(gutterHasRoom(1)).toBe(true);
  });

  it('collapses with a reason when there is no room, and on the planner’s preference', () => {
    expect(gutterWidthFor({ collapsed: false, containerWidth: 1400 })).toEqual({
      widthPx: SWIMLANE_GUTTER_WIDTH_PX,
      collapsed: false,
      forcedByRoom: false,
    });
    expect(gutterWidthFor({ collapsed: false, containerWidth: 700 })).toEqual({
      widthPx: SWIMLANE_GUTTER_COLLAPSED_PX,
      collapsed: true,
      forcedByRoom: true,
    });
    expect(gutterWidthFor({ collapsed: true, containerWidth: 1400 })).toEqual({
      widthPx: SWIMLANE_GUTTER_COLLAPSED_PX,
      collapsed: true,
      forcedByRoom: false,
    });
  });

  it('does not oscillate: the answer does not depend on the width the gutter itself takes', () => {
    const w = GUTTER_MIN_CONTAINER_PX;
    const first = gutterWidthFor({ collapsed: false, containerWidth: w });
    expect(gutterWidthFor({ collapsed: first.collapsed, containerWidth: w })).toEqual(first);
  });
});
