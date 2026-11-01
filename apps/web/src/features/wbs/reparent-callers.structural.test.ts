import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allSourceFiles, SRC_DIR, stripComments } from '@/test/source-files';

/**
 * **The census of `useUpdateActivityParents` callers** (swimlanes M3-T2, implementation plan
 * "A parents caller skips the helper").
 *
 * Under a WBS source a parent write is a swimlane change, and the lane the mover now occupies is
 * stored by `useReparentActivities`. A caller that used the bare endpoint would move work between
 * swimlanes and leave its lane to be derived — and re-derived by a later recalculation. So the bare
 * hook may be named by exactly four files: its definition, its re-export, the undo roster that maps it
 * to the step recording it, and the helper. Every other
 * surface (the Members panel, the bulk-assign bar, the Gantt's indent and outdent, and the undo and
 * redo of all three) writes parents through the helper.
 *
 * **The two other paths that change membership** (docs/TECH_DEBT.md #547) are pinned below by the
 * same census: a summary dissolve, whose bare hook `useDissolveSummary` is named only by its
 * definition, re-export, undo roster and wrapper; and the activity editor's Breakdown field, which
 * saves `parentId` through the General scope's PATCH and so calls the shared lane-store hook itself.
 * All three end in `useStoreReparentLanes`, the one place the lanes are planned and written.
 */
const ALLOWED = [
  'features/activities/api/use-activities.ts',
  'features/activities/index.ts',
  'features/undo-redo/coverage.ts',
  'features/wbs/model/use-reparent-activities.ts',
];

const DISSOLVE_ALLOWED = [
  'features/activities/api/use-activities.ts',
  'features/activities/index.ts',
  'features/undo-redo/coverage.ts',
  'features/wbs/model/use-dissolve-summary.ts',
];

const namesIn = (pattern: RegExp): string[] =>
  allSourceFiles()
    .filter((file) => pattern.test(stripComments(readFileSync(join(SRC_DIR, file), 'utf8'))))
    .sort();

describe('the parents-write census', () => {
  it('names the bare hook only where it is defined, re-exported, rostered and wrapped', () => {
    expect(namesIn(/\buseUpdateActivityParents\b/)).toEqual(ALLOWED);
  });

  it('is wired: the surfaces that write parents all call the helper', () => {
    expect(namesIn(/\buseReparentActivities\(/)).toEqual([
      'components/layout/workspace/plan-workspace-toolbar.tsx',
      'components/layout/workspace/use-plan-workspace-model.ts',
      'features/wbs/components/ActivityMembersPanel.tsx',
      'features/wbs/components/WbsBulkAssignBar.tsx',
      'features/wbs/model/use-reparent-activities.ts',
    ]);
  });

  it('names the bare dissolve hook only where it is defined, re-exported, rostered and wrapped', () => {
    expect(namesIn(/\buseDissolveSummary\b/)).toEqual(DISSOLVE_ALLOWED);
  });

  it('is wired: every dissolve surface calls the wrapper that stores the promoted lanes', () => {
    expect(namesIn(/\buseDissolveSummaryInSwimlanes\(/)).toEqual([
      'components/layout/workspace/activity-crud-dialogs.tsx',
      'components/layout/workspace/use-plan-workspace-model.ts',
      'features/activities/components/ActivitiesTable.tsx',
      'features/wbs/model/use-dissolve-summary.ts',
    ]);
  });

  it('is wired: the editor’s General save and the two wrappers share the lane-store hook', () => {
    expect(namesIn(/\buseStoreReparentLanes\(/)).toEqual([
      'features/activities/components/ActivityEditorDialog.tsx',
      'features/wbs/model/use-dissolve-summary.ts',
      'features/wbs/model/use-reparent-activities.ts',
      'features/wbs/model/use-store-reparent-lanes.ts',
    ]);
  });
});
