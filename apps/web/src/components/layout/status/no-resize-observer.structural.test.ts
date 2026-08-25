import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The plan's facts decide their own layout with a container query, never a measurement** (M2-T3).
 *
 * This row's width is an **output** of what is in it: a docked strip shares it, and the strip's
 * width depends on what the planner is doing. A `ResizeObserver` here would feed that output back
 * in as an input — the "a row measures its own leftover width and gets it wrong" defect this
 * repository has recorded five times, most recently in ADR-0091 M7, where it shipped and told a
 * `shrink-0` row that a 3840 px display was `collapsed`.
 *
 * The rule is cheap to hold today and easy to lose later: a future reader wanting a disclosure
 * instead of the label collapse reaches for `ResizeObserver` because it is the obvious tool, and
 * nothing would fail. This is what fails.
 *
 * **The comment-stripping is not tidiness.** Four gates in this repository have matched their own
 * prose — the sizing ratchet counted documented values as used ones, and `reset-fills.structural`
 * counted a docblock explaining why not to use `bg-card` as a use of it. The docblock above names
 * `ResizeObserver` four times, so a scan of raw text would fail against the very file that obeys
 * the rule.
 */
const DIR = join(process.cwd(), 'src/components/layout/status');
const GUARDED = ['plan-facts.tsx', 'plan-status-bar.tsx', 'schedule-state.ts'];

/** Block comments, line comments and JSX comment expressions. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

describe('the plan facts do not measure themselves', () => {
  it('names files that exist, so the sweep cannot pass by matching nothing', () => {
    // The ADR-0093 lesson: a green suite must be able to tell "the rule holds" from "there was
    // nothing to check". `m0-bands` reported a false absence this same morning by looking for a
    // selector that could not match, so this is not a hypothetical.
    for (const file of GUARDED) {
      expect(() => readFileSync(join(DIR, file), 'utf8')).not.toThrow();
    }
  });

  it('uses no ResizeObserver, and the container query it uses instead is really there', () => {
    for (const file of GUARDED) {
      const code = stripComments(readFileSync(join(DIR, file), 'utf8'));
      expect(code, `${file} measures itself`).not.toMatch(/ResizeObserver/);
      expect(code, `${file} measures itself`).not.toMatch(
        /getBoundingClientRect|clientWidth|offsetWidth/,
      );
    }
    // The pinned positive: the collapse mechanism exists. Without this the suite would pass just as
    // happily against a file that had lost its container query altogether and collapsed nothing.
    const facts = readFileSync(join(DIR, 'plan-facts.tsx'), 'utf8');
    expect(facts).toMatch(/@container\/facts/);
    expect(facts).toMatch(/@\[26rem\]\/facts:inline/);
  });

  it('strips comments before scanning, so prose about the rule cannot break it', () => {
    // Verified by construction: this string is what the docblock above looks like to the scanner.
    expect(stripComments('/* ResizeObserver is forbidden */ const a = 1;')).not.toMatch(
      /ResizeObserver/,
    );
    expect(stripComments('// no ResizeObserver here\nconst b = 2;')).not.toMatch(/ResizeObserver/);
    // And it does NOT strip real code, or the guard above would be vacuous.
    expect(stripComments('const o = new ResizeObserver(fn);')).toMatch(/ResizeObserver/);
  });
});
