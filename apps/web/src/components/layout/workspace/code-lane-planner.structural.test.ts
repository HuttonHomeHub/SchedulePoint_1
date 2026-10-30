import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allSourceFiles, SRC_DIR, stripComments } from '@/test/source-files';

/**
 * **Every codes write the workspace makes sits under the lane planner's provider** (p6-activity-codes
 * M4-T4, `m4-ui-design.md` §13).
 *
 * `useSetActivityCodes` asks the planner for the lanes a write must carry while the plan's swimlanes
 * come from a code, and a provider that is absent answers `null` — so a caller outside it **silently
 * writes codes alone** and every bar it did not mean to move re-derives its lane. Nothing fails; the
 * diagram just jumps. A unit suite cannot see it, because each caller's own tests mount it with or
 * without a provider as they choose. So this reads the source: the callers are a roster, and the only
 * place they are rendered from is the workspace root, inside the provider.
 */
const read = (file: string): string => stripComments(readFileSync(join(SRC_DIR, file), 'utf8'));
const ROOT = 'components/layout/workspace/plan-workspace-toolbar.tsx';

/** The files that call `useSetActivityCodes`, and how each reaches the workspace root. */
const CALLERS: Readonly<Record<string, string>> = {
  'features/codes/components/CodeAssignControl.tsx':
    'rendered by the table’s bar, the diagram’s two bars and the Gantt dock, all from the root',
  'features/codes/components/ActivityCodesSection.tsx':
    'rendered in the activity editor, which the root mounts as ActivityCrudDialogs',
  'features/swimlanes/model/use-code-swimlane-assignment.ts':
    'called by the root itself, beside the provider’s own planner: it passes its lanes explicitly',
};

describe('the codes writers and the lane planner', () => {
  it('lists every file that calls useSetActivityCodes', () => {
    const callers = allSourceFiles().filter(
      (file) =>
        !file.endsWith('use-set-activity-codes.ts') && /\buseSetActivityCodes\(/.test(read(file)),
    );
    expect(callers.sort()).toEqual(Object.keys(CALLERS).sort());
  });

  it('renders the editor and the codes controls only from the workspace root', () => {
    const renderers = allSourceFiles().filter(
      (file) =>
        !file.startsWith('features/codes/') &&
        /<(ActivityCrudDialogs|CodeAssignControl|CodeAssignButton|CodeBulkAssignBar|ActivityCodesSection)\b/.test(
          read(file),
        ),
    );
    expect(renderers.sort()).toEqual([
      'components/layout/workspace/activity-crud-dialogs.tsx',
      ROOT,
    ]);
    // …and the dialogs, which hold the editor's Codes section, are mounted by the root alone.
    expect(allSourceFiles().filter((file) => /<ActivityCrudDialogs\b/.test(read(file)))).toEqual([
      ROOT,
    ]);
  });

  it('wraps the root’s whole return in the provider, with the planner it built', () => {
    const source = read(ROOT);
    const open = source.indexOf('<CodeSwimlaneLanePlannerProvider value={codeLanePlanner}>');
    const close = source.indexOf('</CodeSwimlaneLanePlannerProvider>');
    expect(open).toBeGreaterThan(0);
    expect(close).toBeGreaterThan(open);
    // The dialogs (and so the editor's Codes section) are mounted between the two tags.
    const dialogs = source.indexOf('<ActivityCrudDialogs');
    expect(dialogs).toBeGreaterThan(open);
    expect(dialogs).toBeLessThan(close);
  });
});
