import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **One pacing rule, and the gate that keeps it one** (`docs/TECH_DEBT.md` #258).
 *
 * The row was filed as a duplication risk. Consolidating it found that the risk had already
 * happened: of the four `percentile` copies, three indexed at `floor(n · p)` and `revision-diff`'s
 * at `floor((n − 1) · p)`, which on a realistic tailed distribution is a **12 % difference on the
 * one quantity `#75` is argued in**. Nothing failed, because neither scene pinned its own
 * arithmetic — each copy looked reasonable alone, which is exactly what ADR-0128 D2 says about
 * invisible drift.
 *
 * So a unit test on the shared function is necessary and not sufficient: it proves the survivor is
 * right and says nothing about a fifth copy appearing beside it. This scans instead.
 *
 * **What it CANNOT see, stated so nobody assumes otherwise:**
 *
 * | Blind spot                          | Why                                                    |
 * | ----------------------------------- | ------------------------------------------------------ |
 * | `apps/web/scripts/*.js`             | The `#75` harness is a page-injected script with no    |
 * |                                     | module graph — it cannot import this. It is a genuine  |
 * |                                     | fifth copy, agreeing today, and recorded in `#258`.    |
 * | A copy spelled differently          | Matched on the two arithmetic shapes, not on a name.   |
 * |                                     | A percentile written as a sort-and-interpolate would   |
 * |                                     | pass. That is the honest limit of a text scan.         |
 */
const FEATURE_DIR = join(process.cwd(), 'src/features/perf-probe');
/** The one file allowed to contain the rules, relative to the feature root. */
const HOME = 'model/pacing.ts';

function stripComments(source: string): string {
  // Four gates in this repository have matched their own prose; this file's docblocks quote both
  // index spellings verbatim, so stripping is load-bearing rather than defensive.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sourceFiles(): string[] {
  return readdirSync(FEATURE_DIR, { recursive: true, encoding: 'utf8' }).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.tsx') && !f.includes('.test.'),
  );
}

/** Either index spelling — the survivor's and the one it replaced. */
const PERCENTILE_INDEX = /Math\.floor\(\s*\(?\s*[\w.]+\.length(?:\s*-\s*1)?\s*\)?\s*\*/;
/** The dropped-frame threshold, whose value is a decision and not a constant to retype. */
const DROPPED_THRESHOLD = /\*\s*1\.5\b/;

describe('the frame-pacing arithmetic has exactly one home', () => {
  it('finds files to scan at all', () => {
    // The pinned positive. "No file outside the home contains the rule" passes perfectly over a
    // population of zero — ADR-0093's shape, and the reason this assertion is first.
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain(HOME);
  });

  it('declares the percentile index in one place', () => {
    const offenders = sourceFiles().filter(
      (f) =>
        f !== HOME &&
        PERCENTILE_INDEX.test(stripComments(readFileSync(join(FEATURE_DIR, f), 'utf8'))),
    );
    expect(
      offenders,
      `a second percentile index lives outside ${HOME} — that is how the last two copies came to ` +
        'disagree by 12 % with nothing failing',
    ).toEqual([]);
  });

  it('declares the dropped-frame threshold in one place', () => {
    const offenders = sourceFiles().filter(
      (f) =>
        f !== HOME &&
        DROPPED_THRESHOLD.test(stripComments(readFileSync(join(FEATURE_DIR, f), 'utf8'))),
    );
    expect(
      offenders,
      `the 1.5x dropped-frame threshold is restated outside ${HOME}; one copy corrected and not ` +
        'the other is the failure this whole row is about',
    ).toEqual([]);
  });

  it('the home really does contain both, so the exemption is not covering an empty file', () => {
    const home = stripComments(readFileSync(join(FEATURE_DIR, HOME), 'utf8'));
    expect(PERCENTILE_INDEX.test(home), `${HOME} no longer holds the percentile index`).toBe(true);
    expect(DROPPED_THRESHOLD.test(home), `${HOME} no longer holds the dropped threshold`).toBe(
      true,
    );
  });
});
