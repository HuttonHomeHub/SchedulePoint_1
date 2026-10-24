import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allSourceFiles, SRC_DIR, stripComments } from '@/test/source-files';

/**
 * **The render layer and the canvas never learn that the swimlanes feature exists** (swimlanes
 * ui-architecture C6/C8, the implementer checklist, ADR-0026 §8).
 *
 * Display lanes are swapped in at one seam (`deriveDiagramSource`), so everything downstream reads
 * a `laneIndex` and is correct with no edit. That only holds while nothing downstream reaches back
 * for swimlane data of its own: the first `import … from '@/features/swimlanes'` in a painter is
 * the day a second reading of the lane exists, and the two readings disagree only on a plan that
 * has swimlanes — which no off-path test exercises.
 *
 * `project-swimlanes.ts` is in `render/` and is allowed to exist there: it is the neutral
 * projection, and takes the host's `SwimlaneInput` rather than anything the feature owns.
 *
 * A source-reading test: it checks the import specifier, not what is reachable through a
 * re-export, which is why the feature's barrel is also the only specifier form it looks for.
 */
const GUARDED = (file: string): boolean =>
  file.startsWith('features/tsld/render/') || file === 'features/tsld/components/TsldCanvas.tsx';

const IMPORT_OF_SWIMLANES =
  /(?:from|import)\s*\(?\s*['"](?:@\/features\/swimlanes|(?:\.\.?\/)+(?:features\/)?swimlanes)(?:\/[^'"]*)?['"]/;

describe('no render file and no canvas imports the swimlanes feature', () => {
  const guarded = allSourceFiles().filter(GUARDED);

  it('guards a real set of files', () => {
    // Otherwise a moved directory would turn this into a test of nothing.
    expect(guarded.length).toBeGreaterThan(20);
    expect(guarded).toContain('features/tsld/components/TsldCanvas.tsx');
  });

  it('none of them names it', () => {
    const offenders = guarded.filter((file) =>
      IMPORT_OF_SWIMLANES.test(stripComments(readFileSync(join(SRC_DIR, file), 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('the pattern recognises the import forms it is meant to refuse', () => {
    for (const line of [
      "import { x } from '@/features/swimlanes';",
      "import { x } from '@/features/swimlanes/model/manual-membership';",
      "import type { x } from '../../swimlanes';",
      "const m = await import('@/features/swimlanes');",
    ]) {
      expect(IMPORT_OF_SWIMLANES.test(line), line).toBe(true);
    }
    expect(IMPORT_OF_SWIMLANES.test("import { x } from './project-swimlanes';")).toBe(false);
  });
});
