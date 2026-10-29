import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allSourceFiles, SRC_DIR, stripComments } from '@/test/source-files';

const codesFiles = allSourceFiles().filter((f) => f.startsWith('features/codes/'));
const read = (file: string): string => stripComments(readFileSync(join(SRC_DIR, file), 'utf8'));

describe('the codes feature (P6 activity codes, M3)', () => {
  it('finds the files it exists to check — a scan that finds nothing passes everything', () => {
    expect(codesFiles.length).toBeGreaterThan(15);
  });

  /**
   * **No response is ever written into the activity list.** Only the list, the single-activity read
   * and the codes write carry `codes`; every other activity response omits it, so patching the list
   * from one would blank every activity's codes and nothing would say so. The house rule is
   * invalidate-and-refetch (`m3-ui-design.md` §6.2), and this pins it for the code writes.
   */
  it('never sets query data against the activity list', () => {
    const offenders = codesFiles.filter((file) =>
      /setQueryData\([^)]*activityKeys/s.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * **The dependency runs one way** (`m3-ui-design.md` §4): the codes feature reads the activity keys
   * from `lib/query` and takes the host's slots, and the features that draw activities take plain
   * data from the host. A sideways import is what `docs/TECH_DEBT.md` #548 records growing in
   * `features/tsld`.
   */
  it('imports none of the features that draw the plan', () => {
    const offenders = codesFiles.filter((file) =>
      /from '@\/features\/(activities|gantt|tsld|plan-actions)(\/|')/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('is not imported by the features that draw the plan either', () => {
    const offenders = allSourceFiles().filter(
      (file) =>
        /^features\/(activities|gantt|tsld|plan-actions)\//.test(file) &&
        /from '@\/features\/codes(\/|')/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * **Copy never says "activity code" for the classification** (spec §0 rule 1). An activity's
   * `code` is its identifier, and "activity code" without "P6" keeps that meaning, so a sentence
   * about Area or Trade that said it would tell a planner their activity IDs were being edited.
   */
  it('never says a bare "activity code" in a sentence a reader can be shown', () => {
    const offenders = codesFiles.filter((file) => /(?<!P6 )\bactivity codes?\b/i.test(read(file)));
    expect(offenders).toEqual([]);
  });
});
