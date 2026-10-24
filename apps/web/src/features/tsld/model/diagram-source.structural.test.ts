import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allSourceFiles, SRC_DIR, stripComments } from '@/test/source-files';

/**
 * **The screen and the export build the diagram's input with one function** (swimlanes
 * ui-architecture C7, ADR-0063 §9).
 *
 * Both used to chain the WBS band's derivation and `toRenderActivities` by hand. A third step —
 * the swimlane projection — added to both would be two sites each chaining three derivations, and
 * the drift between them is invisible: a printed programme that disagrees with the screen about
 * which bar sits in which row, in the one file nobody watches a screen to check. The rule here is
 * the binary form of "one function": the three building blocks are called from
 * `deriveDiagramSource` and from nowhere else, and both consumers call it.
 *
 * A source-reading test, so the limit is stated: it proves the call is written, not that it is
 * called with the same options. The behavioural parity (same options, same picture) is the export
 * suites'.
 */
const read = (relative: string): string =>
  stripComments(readFileSync(join(SRC_DIR, relative), 'utf8'));

const SCREEN = 'features/tsld/components/TsldPanel.tsx';
const EXPORT = 'features/tsld/toolbar/commands/use-diagram-image.ts';
const DERIVATION = 'features/tsld/model/derive-diagram-source.ts';

const BUILDING_BLOCKS = [
  /\bderiveWbsBandSource\(/,
  /\bprojectSwimlanes\(/,
  /\btoRenderActivities\(/,
] as const;

describe('one deriveDiagramSource for the screen and the export', () => {
  it.each([SCREEN, EXPORT])('%s calls deriveDiagramSource', (file) => {
    expect(read(file)).toMatch(/\bderiveDiagramSource\(/);
  });

  it.each([SCREEN, EXPORT])('%s chains none of the building blocks itself', (file) => {
    const source = read(file);
    for (const block of BUILDING_BLOCKS) expect(source).not.toMatch(block);
  });

  it('only deriveDiagramSource calls the building blocks, anywhere in the application', () => {
    const callers = allSourceFiles().filter((file) => {
      if (
        file === DERIVATION ||
        // The definitions, which contain the name but are not callers.
        file === 'features/wbs/model/wbs-band-source.ts' ||
        file === 'features/tsld/render/to-render-model.ts' ||
        file === 'features/tsld/render/project-swimlanes.ts'
      ) {
        return false;
      }
      const source = read(file);
      return BUILDING_BLOCKS.some((block) => block.test(source));
    });
    expect(callers).toEqual([]);
  });

  it('and the derivation itself calls all three', () => {
    // The guard on the guard: a derivation that stopped calling one would pass every check above.
    const source = read(DERIVATION);
    for (const block of BUILDING_BLOCKS) expect(source).toMatch(block);
  });
});
