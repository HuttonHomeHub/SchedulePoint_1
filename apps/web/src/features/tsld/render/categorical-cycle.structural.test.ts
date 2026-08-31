import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CATEGORICAL_CYCLE_LENGTH, categoricalCycleVars } from './palette';

/**
 * **The categorical ramp is declared once, and this is what makes that a fact rather than a hope.**
 *
 * `palette.ts`'s own docblock records why the ramp was collapsed into one list: it was three
 * hand-written arrays that had to be kept the same length and the same order, and going 5 → 12 for
 * the light theme is exactly the edit that leaves one behind. The stacked resource histogram
 * (`docs/specs/stacked-resource-histogram/`) is the first consumer OUTSIDE `render/`, and its spec
 * was written describing two renderers "indexing the same exported token list" at a time when the
 * list was a module-private `const` — so the default outcome of building to that sentence was a
 * second array of twelve token names.
 *
 * That drift would be **invisible**: each renderer looks right on its own, and only somebody
 * holding a legend against a diagram would ever notice segment 3 painted two different colours.
 * The same shape as ADR-0065's `routeOrthogonalAvoiding` and ADR-0063's shared bucket derivation.
 */
const SRC = join(import.meta.dirname, '../../..');

/** Every `.ts`/`.tsx` under `src`, excluding this file and the one legitimate declaration site. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('the categorical ramp is declared once', () => {
  it('exports twelve members, each a var() pair', () => {
    const members = categoricalCycleVars();
    expect(members).toHaveLength(CATEGORICAL_CYCLE_LENGTH);
    expect(CATEGORICAL_CYCLE_LENGTH).toBe(12);
    // `var()` and not a resolved colour: the browser re-resolves it, so a DOM consumer is
    // theme-reactive for free and never needs a `useThemeVersion` bump.
    for (const m of members) {
      expect(m.fill).toMatch(/^var\(--chart-\d+\)$/);
      expect(m.ink).toMatch(/^var\(--[a-z-]+\)$/);
    }
    // Ramp order is the contract — index n is the colour the canvas gives segment n.
    expect(members[0]?.fill).toBe('var(--chart-1)');
    expect(members[11]?.fill).toBe('var(--chart-12)');
  });

  /**
   * **The scans are pinned against a positive case, so they cannot pass by finding nothing.**
   *
   * Both assertions below sweep a directory and require the result to be empty — the exact shape
   * that goes green when the walk, the extension filter or the comment stripper breaks, and nothing
   * notices because "no offenders" is what success looks like. This repository has recorded that
   * failure repeatedly, most recently in `check-debt-status.mjs`, whose own control shared its
   * blind spot. So the detectors are exercised on strings that MUST be flagged, and the walk is
   * required to return a plausible number of files.
   */
  it('the scan actually scans, and its detectors actually detect', () => {
    const files = sourceFiles(SRC);
    // A tree this size has hundreds of sources; a handful means the walk broke.
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.endsWith('render/palette.ts'))).toBe(true);

    const strip = (code: string): string =>
      code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    const enumerates = (code: string): boolean =>
      new Set([...strip(code).matchAll(/--chart-(\d+)/g)].map((m) => m[1])).size >= 3;
    expect(enumerates("['--chart-1', '--chart-2', '--chart-3']")).toBe(true);
    expect(enumerates('var(--chart-1) and var(--chart-1) again')).toBe(false);
    // …and prose naming three members is NOT an enumeration, which is the whole point of stripping.
    expect(enumerates('// uses --chart-1, --chart-2 and --chart-3\nconst x = 1;')).toBe(false);
    expect(enumerates('/* --chart-1 --chart-2 --chart-3 */\nconst x = 1;')).toBe(false);

    const tailwindForm = (code: string): boolean =>
      /(?:fill|bg|text|stroke)-chart-(?:\d+|\$\{)/.test(strip(code));
    expect(tailwindForm('className="fill-chart-3"')).toBe(true);
    expect(tailwindForm('className={`bg-chart-${n}`}')).toBe(true);
    expect(tailwindForm('// never write fill-chart-3\nconst x = 1;')).toBe(false);
  });

  it('no second file enumerates the ramp', () => {
    // **Comments are stripped before scanning.** This repository has now shipped FIVE gates that
    // matched their own explanatory prose rather than their subject (ADR-0106's reset-fills test,
    // the ADR-0097 weight ratchet, the sizing ratchet, the typeface reach test, and #219's own
    // classifier) — and this file's docblock names `--chart-1` twice.
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith('categorical-cycle.structural.test.ts')) continue;
      if (file.endsWith('render/palette.ts')) continue; // the one declaration site
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      // Three or more distinct `--chart-N` names in one file is an enumeration, not a use.
      const names = new Set([...code.matchAll(/--chart-(\d+)/g)].map((m) => m[1]));
      if (names.size >= 3) offenders.push(`${file.slice(SRC.length + 1)} (${names.size} members)`);
    }
    expect(
      offenders,
      'a second enumeration of the ramp — import `categoricalCycleVars()` instead',
    ).toEqual([]);
  });

  it('REFUSES a Tailwind class form of the ramp', () => {
    // `fill-chart-${n}` compiles to NO CSS — Tailwind v4 scans for literal class strings — so the
    // chart paints unstyled in a real browser while a jsdom test asserting the className passes.
    // ADR-0100 M4 shipped exactly this, in this same token family: the minimap frame painted no
    // colour while the contrast gate stayed green.
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith('categorical-cycle.structural.test.ts')) continue;
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      if (/(?:fill|bg|text|stroke)-chart-(?:\d+|\$\{)/.test(code)) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
    expect(
      offenders,
      'a Tailwind chart class — use the var() form from `categoricalCycleVars()`',
    ).toEqual([]);
  });
});
