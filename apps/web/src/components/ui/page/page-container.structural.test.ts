import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The page frame is one decision, so it is written once.**
 *
 * `PageContainer`'s own docblock records that this frame was hand-written **fourteen times**
 * before the archetype existed — and then the archetype shipped and nine route files went on
 * hand-writing it anyway, thirteen sites between them, because nothing stopped them. A prose rule
 * that the frame belongs to the archetype is a rule nobody consults while adding a screen; the
 * cost is not that the class string is repeated but that the measure, the padding and the
 * `flex-1` contract cannot be changed once, which is the entire reason the archetype exists.
 *
 * So the rule is a gate. It reads **balanced string literals**, not lines: the frame is a set of
 * classes whose ORDER is arbitrary, so a line-anchored or exact-string scan is defeated by
 * `mx-auto flex-1 w-full max-w-6xl p-6` — the same classes, reordered by a formatter or by hand,
 * with nothing failing. What identifies the frame is the co-occurrence of a horizontal centring
 * (`mx-auto`), a growth contract (`flex-1`) and a measure cap (`max-w-*`) in ONE class string.
 *
 * **Verified red** against the pre-conversion tree, where it names all thirteen sites across the
 * nine route files.
 *
 * What it deliberately cannot see: a frame assembled from a variable rather than a literal, or
 * split across two elements (a `mx-auto max-w-6xl` parent wrapping a `flex-1` child). Both are
 * real holes and neither is worth a rule that reads arbitrary expressions — the shape this is
 * written for is the one that occurred thirteen times, which is a copied class string.
 */
const PAGE_DIR = import.meta.dirname;
const WEB_SRC = join(PAGE_DIR, '..', '..', '..');

/**
 * The two screens that hand-write a frame **narrower than any measure the archetype offers**, and
 * are therefore not drift.
 *
 * They are listed rather than converted because converting either is a visual change and not a
 * mechanical one: `narrow` is `max-w-4xl` (896px), so adopting it would widen the account screen
 * by 224px and the onboarding card by 384px, and onboarding additionally centres itself
 * vertically, which is a card layout rather than a page frame. Whether those measures should join
 * the archetype is a design question for the per-page pass.
 *
 * The list is the speed bump: a third entry costs somebody a written reason, which is the point.
 */
const DECLARED_EXCEPTIONS = new Map([
  [
    join('routes', 'account.tsx'),
    'a settings screen at max-w-2xl (672px) — narrower than the archetype’s `narrow`',
  ],
  [
    join('routes', 'onboarding.tsx'),
    'a vertically-centred single card at max-w-lg (512px), not a page frame',
  ],
]);

/** Every `.ts`/`.tsx` under `apps/web/src`, walked from disk so an untracked file is covered too. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** A whole class token, so `max-w-6xl` does not match inside `sm:max-w-6xl`-style prefixes by luck. */
function hasClass(value: string, token: RegExp): boolean {
  return new RegExp(`(?:^| )${token.source}(?: |$)`).test(value);
}

function framesIn(source: string): string[] {
  // Comments are stripped first: this file's own docblock spells out the exact frame it forbids,
  // and five gates in this repository have now shipped a scan that matched its own prose.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/"([^"\\\n]*)"/g)]
    .map((m) => m[1] ?? '')
    .filter(
      (value) =>
        hasClass(value, /mx-auto/) && hasClass(value, /flex-1/) && hasClass(value, /max-w-[^\s"]+/),
    );
}

describe('the page frame is written once', () => {
  const files = sourceFiles(WEB_SRC);
  const container = join(PAGE_DIR, 'page-container.tsx');
  /**
   * This file is excluded because its own pinned positive case holds a frame — as a **fixture
   * string**, which comment-stripping cannot reach. Five gates in this repository have shipped a
   * scan that matched their own docblock; this is the same failure one layer along, and it was
   * caught by the gate's first run rather than by reading.
   */
  const self = join(PAGE_DIR, 'page-container.structural.test.ts');

  // The pinned positive case. Every assertion below passes vacuously against a walk that found no
  // files, or a matcher that can no longer recognise a frame — so both are asserted directly.
  it('reads the tree and can still recognise a frame', () => {
    expect(files.length, 'the walk found no source files').toBeGreaterThan(500);
    expect(files).toContain(container);
    expect(
      framesIn('<div className="mx-auto w-full max-w-6xl flex-1 p-6">'),
      'the matcher no longer recognises the frame it is written to catch',
    ).toHaveLength(1);
    expect(
      framesIn('<div className="mx-auto w-full p-6">'),
      'the matcher fires on a centred box that caps nothing',
    ).toHaveLength(0);
  });

  it('is hand-written nowhere outside the archetype', () => {
    const offenders = files.flatMap((file) => {
      if (file === container || file === self) return [];
      const key = relative(WEB_SRC, file);
      if (DECLARED_EXCEPTIONS.has(key)) return [];
      return framesIn(readFileSync(file, 'utf8')).map(
        (value) => `${key.split(sep).join('/')}: "${value}"`,
      );
    });

    expect(
      offenders,
      'use `PageContainer` (`@/components/ui/page`) rather than re-writing the page frame',
    ).toEqual([]);
  });

  it('declares every exception with a reason', () => {
    for (const [key, reason] of DECLARED_EXCEPTIONS) {
      const source = readFileSync(join(WEB_SRC, key), 'utf8');
      expect(framesIn(source).length, `${key} no longer hand-writes a frame — drop it`).toBe(1);
      expect(reason.length, `${key} is exempt with no reason`).toBeGreaterThan(20);
    }
  });
});

/**
 * **The second list: screens that use the archetype but not its measure.**
 *
 * `DECLARED_EXCEPTIONS` above covers screens that opt out of `PageContainer` altogether. This one
 * covers the other shape — a screen that uses it and passes an explicit `width` — and it exists
 * because of what page-composition M0 measured: ten screens rendered 1104px of content while the
 * organisation landing rendered 1321–1488, and **not one of the ten had chosen that.** They said
 * nothing and got the narrow measure, which is why ADR-0146 D1 moved the value onto `default`
 * rather than converting call sites: a conversion leaves the failure mode armed for screen
 * fourteen.
 *
 * So an explicit `width` is now a **declaration**, and a declaration owes a reason. Today there is
 * exactly one, and it is the pinned positive case: without a real entry here, every assertion below
 * passes against a scan that matched nothing (ADR-0093, ADR-0108).
 */
const WIDTH_EXCEPTIONS = new Map([
  [
    join('routes', 'staff.tsx'),
    'narrow: the not-found branch is a sentence and a paragraph, and the product measure would set ' +
      'a refusal across an empty screen. It is read rather than scanned.',
  ],
]);

/** Every explicit `width="…"` passed to `PageContainer`, by file. */
function widthPropsIn(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/<PageContainer\b[^>]*?\bwidth=\{?["']([a-z]+)["']/g)].map(
    (m) => m[1] ?? '',
  );
}

describe('the measure is the default unless a screen declares otherwise', () => {
  const files = sourceFiles(WEB_SRC);
  const self = join(PAGE_DIR, 'page-container.structural.test.ts');

  // The pinned positive case, twice over: the walk must find call sites at all, and the matcher
  // must still recognise the prop it is written to find. A census whose scan matched nothing
  // reports a clean estate, which is the failure this repository keeps recording.
  it('reads the tree and can still recognise an explicit width', () => {
    const callSites = files.filter(
      (file) => file !== self && /<PageContainer\b/.test(readFileSync(file, 'utf8')),
    );
    expect(callSites.length, 'the walk found no PageContainer call sites').toBeGreaterThanOrEqual(
      10,
    );
    expect(widthPropsIn('<PageContainer width="narrow">')).toEqual(['narrow']);
    expect(widthPropsIn('<PageContainer className="x">')).toEqual([]);
  });

  it('passes an explicit width only where one is declared', () => {
    const offenders = files.flatMap((file) => {
      if (file === self) return [];
      const key = relative(WEB_SRC, file);
      const widths = widthPropsIn(readFileSync(file, 'utf8'));
      if (widths.length === 0) return [];
      if (WIDTH_EXCEPTIONS.has(key)) return [];
      return [`${key.split(sep).join('/')}: width="${widths.join('", "')}"`];
    });

    expect(
      offenders,
      'the product has one measure; an explicit width is a declared exception with a written reason',
    ).toEqual([]);
  });

  it('declares every width exception with a reason, and none that has lapsed', () => {
    expect(WIDTH_EXCEPTIONS.size, 'the exception list is empty, so nothing above can fail').toBe(1);
    for (const [key, reason] of WIDTH_EXCEPTIONS) {
      const widths = widthPropsIn(readFileSync(join(WEB_SRC, key), 'utf8'));
      expect(widths.length, `${key} no longer passes an explicit width — drop it`).toBeGreaterThan(
        0,
      );
      expect(reason.length, `${key} is exempt with no reason`).toBeGreaterThan(20);
    }
  });
});
