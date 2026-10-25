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
 * It does not cover the activity editor's Breakdown field, which saves `parentId` through the
 * scope's PATCH and is not an `updateParents` caller; see the M3-T2 note in the implementation plan.
 */
const ALLOWED = [
  'features/activities/api/use-activities.ts',
  'features/activities/index.ts',
  'features/undo-redo/coverage.ts',
  'features/wbs/model/use-reparent-activities.ts',
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
});
