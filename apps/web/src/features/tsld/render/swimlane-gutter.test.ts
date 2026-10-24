import { describe, expect, it } from 'vitest';

import { LANE_HEIGHT } from './geometry';
import {
  GUTTER_LINE_PX,
  GUTTER_PAD_PX,
  swimlaneGutterGeometry,
  swimlaneGutterText,
  isCollapsedGutterWidth,
  GUTTER_MIN_CONTAINER_PX,
  GUTTER_MIN_STAGE_PX,
  gutterHasRoom,
  gutterSwimlanesFrom,
  gutterWidthFor,
  gutterWidthForRoom,
  gutterSwimlanes,
  laneToReveal,
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

  it('lets a block exactly N lines tall hold N - 1, because the label pads its top', () => {
    // Four lanes are 240 px: exactly 15 label lines, of which the padding takes one.
    expect((4 * LANE_HEIGHT) % GUTTER_LINE_PX).toBe(0);
    const [text] = swimlaneGutterText({
      ...SCENE,
      swimlanes: [{ id: 'a', name: 'x', firstLane: 0, laneCount: 4, activityCount: 0 }],
    });
    expect(GUTTER_PAD_PX).toBe(8);
    expect(text?.maxLines).toBe(14);
  });

  it('splits the static text from the per-frame geometry, and the model is their join', () => {
    const text = swimlaneGutterText(SCENE);
    const panned = { ...VIEW, originY: -LANE_HEIGHT };
    expect(swimlaneGutterText(SCENE)).toEqual(text);
    expect(swimlaneGutterGeometry(SCENE.swimlanes, panned, SIZE)[0]?.top).toBe(0);
    expect(swimlaneGutterModel(SCENE, panned, SIZE)[0]).toMatchObject({
      ...text[0],
      blockTop: -LANE_HEIGHT,
    });
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

describe('isCollapsedGutterWidth', () => {
  it('names the strip as collapsed and the expanded width as not', () => {
    expect(isCollapsedGutterWidth(SWIMLANE_GUTTER_COLLAPSED_PX)).toBe(true);
    expect(isCollapsedGutterWidth(SWIMLANE_GUTTER_WIDTH_PX)).toBe(false);
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

describe('gutterSwimlanesFrom', () => {
  it('counts each swimlane’s activities in one pass over the display lanes', () => {
    const out = gutterSwimlanesFrom({
      displayLanes: new Map([
        ['a', 0],
        ['b', 1],
        ['c', 1],
        ['d', 3],
      ]),
      extents: [
        { id: 's1', name: 'One', firstLane: 0, laneCount: 2 },
        { id: 's2', name: 'Two', firstLane: 2, laneCount: 1 },
        { id: null, name: null, firstLane: 3, laneCount: 1 },
      ],
      laneCount: 4,
      derivedIds: new Set<string>(),
    });
    expect(out.map((s) => [s.id, s.activityCount])).toEqual([
      ['s1', 3],
      ['s2', 0],
      [null, 1],
    ]);
  });
});

describe('gutterWidthForRoom', () => {
  it('answers exactly as gutterWidthFor does for the same room fact', () => {
    for (const collapsed of [false, true]) {
      for (const containerWidth of [700, 1400]) {
        expect(gutterWidthForRoom({ collapsed, room: gutterHasRoom(containerWidth) })).toEqual(
          gutterWidthFor({ collapsed, containerWidth }),
        );
      }
    }
  });

  it('is forced collapsed when there is no room, even for a planner who left it expanded', () => {
    expect(gutterWidthForRoom({ collapsed: false, room: false })).toMatchObject({
      collapsed: true,
      forcedByRoom: true,
    });
  });
});

describe('gutterSwimlanes', () => {
  const extents = [
    { id: 'a', name: 'Civil', firstLane: 0, laneCount: 1 },
    { id: 'b', name: 'Mech', firstLane: 1, laneCount: 1 },
    { id: null, name: null, firstLane: 2, laneCount: 1 },
  ];

  it('counts each swimlane’s members, and files an unknown or absent membership under No swimlane', () => {
    const out = gutterSwimlanes(
      extents,
      ['1', '2', '3', '4', '5'],
      new Map<string, string | null>([
        ['1', 'a'],
        ['2', 'a'],
        ['3', 'gone'],
        ['4', null],
      ]),
      new Set(['a', 'b']),
    );
    expect(out.map((s) => s.activityCount)).toEqual([2, 0, 3]);
  });
});

describe('laneToReveal', () => {
  const size = { width: 800, height: 4 * LANE_HEIGHT };
  const at = (originY: number) => ({ pxPerDay: 20, originX: 0, originY });

  it('does nothing when any of the swimlane is already in view', () => {
    expect(
      laneToReveal({ id: 'a', name: 'A', firstLane: 1, laneCount: 2 }, at(0), size),
    ).toBeNull();
    // Half in view counts: the label is on screen.
    expect(
      laneToReveal({ id: 'a', name: 'A', firstLane: 3, laneCount: 3 }, at(-LANE_HEIGHT / 2), size),
    ).toBeNull();
  });

  it('centres a swimlane that fits when it is out of view', () => {
    // `centerOnWorld` centres lane n at n + 0.5, so two lanes starting at 10 centre on 10.5.
    expect(laneToReveal({ id: 'a', name: 'A', firstLane: 10, laneCount: 2 }, at(0), size)).toBe(
      10.5,
    );
  });

  it('frames a swimlane taller than the viewport by its top', () => {
    // Four lanes fit; a 20-lane swimlane is framed so its first lane is near the top, not its middle.
    const lane = laneToReveal({ id: 'a', name: 'A', firstLane: 30, laneCount: 20 }, at(0), size)!;
    expect(lane).toBe(30 + 4 / 2 - 0.5);
  });
});
