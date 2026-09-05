import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The comparison never says WHY, and this bans the field that would claim it.**
 *
 * The epic's Tier 3 — ranked, summing attribution of a path change to individual edits — was
 * WITHDRAWN on measurement: per-change attribution was order-dependent (the same change attributed
 * 30, 18, 2 or 0 working days depending only on its position in a sequential replay) while the sum
 * was order-free. The product owner chose the pre-named fallback, the critical-path delta only, on
 * the condition that it never makes a causal claim.
 *
 * That condition is one `cause: string` away from being broken by a contributor who thinks they are
 * being helpful, and the field would look authoritative in a payload full of measured numbers. So
 * it is a gate rather than a paragraph.
 *
 * **Whole-file, not line-anchored.** ADR-0116's G4 shipped a line-anchored key pattern that a
 * Prettier-clean single-line object and a shorthand property both sailed past, under a docblock
 * claiming to catch exactly that. Both bypasses are pinned as fixtures below.
 *
 * **Comments are stripped**, because this file and `revision-delta.ts` both discuss causes at
 * length and a scan that matched its own prose would be the fourth such gate in this repository.
 */
const HERE = join(__dirname);
const SOURCES = ['revision-delta.ts'];

/**
 * Names that would assert a cause. `driver`/`driving` are deliberately absent: they are the
 * engine's own established vocabulary for a relationship that controls a date (`is_driving`), which
 * is a measured fact rather than an attribution.
 */
const BANNED = [
  'cause',
  'causes',
  'causedBy',
  'reasonForChange',
  'blame',
  'culprit',
  'attribution',
];

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the revision delta names no cause', () => {
  it('scanned a non-zero number of delta source files', () => {
    // The pinned positive case. "No banned name appears" passes perfectly against a scan that read
    // nothing at all.
    expect(readdirSync(HERE).filter((f) => SOURCES.includes(f))).toEqual(SOURCES);
  });

  it.each(SOURCES)('%s declares no causal field', (file) => {
    const text = stripComments(readFileSync(join(HERE, file), 'utf8'));
    const found = BANNED.filter((name) => new RegExp(`\\b${name}\\b\\s*[:?]`).test(text));
    expect(found).toEqual([]);
  });

  describe('the scan itself', () => {
    const scan = (text: string): string[] =>
      BANNED.filter((name) => new RegExp(`\\b${name}\\b\\s*[:?]`).test(stripComments(text)));

    it('catches a multi-line property — the shape a contributor writes first', () => {
      expect(scan('interface X {\n  cause: string;\n}')).toEqual(['cause']);
    });

    it('catches a PRETTIER-CLEAN SINGLE-LINE object — ADR-0116 G4 bypass 1', () => {
      // G4's line-anchored pattern passed this, which is why this gate is whole-file.
      expect(scan('const x = { activityId: id, cause: why };')).toEqual(['cause']);
    });

    it('catches an OPTIONAL property — the `cause?:` form', () => {
      expect(scan('interface X { cause?: string }')).toEqual(['cause']);
    });

    it('does NOT fire on prose describing the ban', () => {
      // Verified against this file's own subject matter: the word appears here constantly.
      expect(scan('// the response carries no field naming a cause: that is the decision')).toEqual(
        [],
      );
      expect(scan('/**\n * cause: never.\n */')).toEqual([]);
    });

    it('does NOT fire on an unrelated identifier that merely contains the word', () => {
      // `because` contains `cause`; a substring match would ban an ordinary English word in code.
      expect(scan('const because: string = why;')).toEqual([]);
    });
  });
});
