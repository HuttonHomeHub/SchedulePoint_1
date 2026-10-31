import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allSourceFiles, SRC_DIR, stripComments } from '@/test/source-files';

/**
 * **The narrowed `laneIndex` census** (swimlanes ui-architecture C6, M2-T1).
 *
 * The first plan was a census of every `laneIndex` read in `features/tsld`, which is large because
 * it has to cover the painters. The seam makes it small. `deriveDiagramSource` hands the canvas
 * copies of the activities whose `laneIndex` IS the display lane, so the render layer, the canvas
 * and the minimap read the right thing with no edit. What is left to watch is exactly the code that
 * can mistake one lane for the other:
 *
 * - **the host and the write-side hooks** read `ActivitySummary.laneIndex` — the STORED lane — or
 *   receive an intent in DISPLAY lanes from the canvas. Each of these needs the display-to-stored
 *   conversion once swimlanes are drawn (M2-T4 and after). They are the roster below, and a new
 *   file reading `laneIndex` has to be added to it deliberately, with a decision about which lane
 *   it holds;
 * - **everything that never meets the swimlane scene** is listed with the reason its stored-lane
 *   read is right as it stands.
 *
 * The render layer (`features/tsld/render/**`) and the two canvas components are excluded by rule,
 * not by roster: they are the readers the seam exists to keep correct, and the sibling structural
 * test forbids them from importing the swimlanes feature.
 *
 * A source-reading test: it proves a file is on the roster, not that its use is right. What it
 * stops is the silent case — a new `.laneIndex` read in the host that nobody asked "which lane?".
 */
type Held = 'stored-lane' | 'display-lane-intent';

const HOST_AND_WRITE_SIDE: Readonly<Record<string, Held>> = {
  // The seam itself: swaps the display lane in, reads the stored one.
  'features/tsld/model/derive-diagram-source.ts': 'stored-lane',
  // The host: composes the writes, so it is where an intent in display lanes is converted back.
  'components/layout/workspace/use-plan-workspace-model.ts': 'display-lane-intent',
  'components/layout/workspace/use-auto-resolve-overlaps.ts': 'stored-lane',
  'features/activities/api/use-activities.ts': 'stored-lane',
  'features/tsld/components/TsldPanel.tsx': 'display-lane-intent',
  'features/tsld/components/use-arrange-search.ts': 'stored-lane',
  'features/tsld/interaction/gesture-machine.ts': 'display-lane-intent',
  'features/tsld/interaction/use-coalesced-duration-nudge.ts': 'display-lane-intent',
  'features/tsld/interaction/use-coalesced-nudge.ts': 'display-lane-intent',
  'features/tsld/interaction/use-coalesced-plural-nudge.ts': 'display-lane-intent',
  // The panel's display-to-lane translation while swimlanes are drawn (M2-T4).
  'features/tsld/interaction/use-swimlane-editing.ts': 'display-lane-intent',
  'features/tsld/model/arrange-lanes.ts': 'stored-lane',
  'features/tsld/model/auto-resolve.ts': 'display-lane-intent',
  // Both pictures' STORED lanes, kept apart: the plain `laneIndex` and the lane inside a swimlane
  // (M2-T5). It never reads a display lane except to place a member that has no stored row.
  'features/tsld/model/auto-resolve-swimlanes.ts': 'stored-lane',
  'features/tsld/model/bulk-move.ts': 'display-lane-intent',
  // The edit contract's types: a reposition intent arrives in display lanes (M2-T4).
  'features/tsld/model/edit-types.ts': 'display-lane-intent',
  // The inverse of the projection (M2-T4): turns a display lane into the lane inside a swimlane.
  'features/tsld/model/swimlane-lanes.ts': 'display-lane-intent',
  // The context every swimlane write is planned against (M2-T10): the scene's stored lanes, which only
  // a create reads, kept beside the display lanes the projection drew.
  'features/tsld/model/swimlane-edit-context.ts': 'stored-lane',
  'features/tsld/toolbar/use-tsld-toolbar-context.tsx': 'stored-lane',
  'features/undo-redo/commands.ts': 'stored-lane',
};

const NEVER_MEETS_THE_SWIMLANE_SCENE: Readonly<Record<string, string>> = {
  'features/activities/api/use-swimlane-lanes.ts':
    'sends the lane INSIDE a swimlane (`swimlane.laneIndex`); it takes no display lane, and a swimlane-free one only from auto-resolve, which resolves that picture itself (M2-T5)',
  'features/swimlanes/model/manual-membership.ts':
    'reads the stored in-swimlane lane rows to build the projection input; it is the input, not a consumer of the result',
  'features/swimlanes/model/code-membership.ts':
    'reads the stored code-lane entries to build the projection input (M4); it is the input, not a consumer of the result',
  'features/swimlanes/model/code-lane-planning.ts':
    'turns the lanes INSIDE a code swimlane that the edit planner chose into the rows a codes write carries (M4); it takes no display lane',
  'features/undo-redo/code-commands.ts':
    'a codes step carries the lanes INSIDE a code swimlane its planner chose at replay (M4); it reads and sends no display lane',
  'features/wbs/model/wbs-swimlane-membership.ts':
    'orders sibling summaries by their stored lane, which is the WBS order the Gantt sorts by, and reads the stored in-swimlane lane rows to build the projection input (M3); it is the input, not a consumer of the result',
  'features/wbs/model/use-store-reparent-lanes.ts':
    'sends the lane INSIDE a swimlane (`swimlane.laneIndex`) for work a WBS membership change moved (a parent write, the editor Breakdown save, a dissolve), planned against the picture after the move; it never sends a swimlane-free lane (M3-T2)',
  'features/activity-copy/model/clone-graph.ts': 'a clone carries the stored lane',
  'features/activity-copy/model/clone-projection.ts': 'a clone carries the stored lane',
  'features/activity-history/lib/format-history-item.ts': 'labels a stored field in the history',
  'features/gantt/layout/row-model.ts': 'the Gantt has its own rows and no lane axis',
  'features/perf-probe/scenes/canvas-draw.ts': 'a synthetic scene, painted with no swimlanes',
  'features/perf-probe/scenes/revision-diff.ts': 'a synthetic scene, painted with no swimlanes',
  'features/perf-probe/scenes/scale-scene.ts': 'a synthetic scene, painted with no swimlanes',
  'features/schedule/model/levelling-application.ts': 'snapshots the stored lane for undo',
  'features/share/guest-api.ts': 'maps the guest DTO onto the stored field',
  'test/activity-fixture.ts': 'a fixture',
  'test/fake-plan-server.ts': 'a fixture',
};

const RENDER_SIDE = (file: string): boolean =>
  file.startsWith('features/tsld/render/') ||
  file === 'features/tsld/components/TsldCanvas.tsx' ||
  file === 'features/tsld/components/TsldMinimap.tsx';

describe('the laneIndex census, narrowed to the host and the write side', () => {
  const readers = allSourceFiles().filter(
    (file) =>
      !RENDER_SIDE(file) &&
      /\blaneIndex\b/.test(stripComments(readFileSync(join(SRC_DIR, file), 'utf8'))),
  );
  const rostered = [
    ...Object.keys(HOST_AND_WRITE_SIDE),
    ...Object.keys(NEVER_MEETS_THE_SWIMLANE_SCENE),
  ];

  it('every file outside the render layer that reads laneIndex is on the roster', () => {
    expect(readers.filter((file) => !rostered.includes(file))).toEqual([]);
  });

  it('and every roster entry still reads it, so the roster does not outlive the code', () => {
    expect(rostered.filter((file) => !readers.includes(file))).toEqual([]);
  });

  it('no file is on both lists', () => {
    const both = Object.keys(HOST_AND_WRITE_SIDE).filter(
      (file) => file in NEVER_MEETS_THE_SWIMLANE_SCENE,
    );
    expect(both).toEqual([]);
  });
});
