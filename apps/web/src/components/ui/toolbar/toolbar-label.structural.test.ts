import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * **A toolbar label is decided in one place and painted by one helper** (toolbar-redesign M1, SC-8).
 *
 * There were three deciders and four implementations: `Toolbar`'s `showLabel !== 'never'`, `Deck`'s
 * `ICON_ONLY` id list (used *instead of* the item's own policy), and a `compact` prop on the
 * triggers that nothing could set. Each was correct alone, and they disagreed in the relationship —
 * the ADR-0093 shape. `resolveLabelVisibility` and `toolbarLabelClass` (`toolbar-styles.ts`) replace
 * all of them, and this file fails if a fourth appears.
 *
 * **It reads source with comments removed**, because this docblock and a dozen others name the very
 * identifiers they forbid; a scan that matched its own prose is the failure four gates in this
 * repository have shipped (`container-query.structural.test.ts`). The positive controls below pin
 * that the scan still reads the helper's own file and finds the pieces it polices.
 *
 * Verified red by restoring each forbidden form in turn: a `compact` prop on `ToolbarPopover`, a
 * hand-written `<span className="truncate">{label}</span>` in `ToolbarSplitButton`, and the
 * `@max-roomy/deck:` variant in `Deck.tsx`.
 */
const SOURCE_FILES = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
  .split('\n')
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !/\.d\.ts$/.test(path));

const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const STYLES = 'src/components/ui/toolbar/toolbar-styles.ts';
const DECIDERS = ['src/components/ui/toolbar/Deck.tsx', 'src/components/ui/toolbar/Toolbar.tsx'];
const PAINTERS = [
  'src/components/ui/toolbar/ToolbarButton.tsx',
  'src/components/ui/toolbar/ToolbarPopover.tsx',
  'src/components/ui/toolbar/ToolbarSplitButton.tsx',
  'src/features/tsld/toolbar/tsld-toolbar-items.tsx',
];

describe('a toolbar label has one decider and one painter', () => {
  it('reads the files it polices, and finds the helper it expects', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(500);
    for (const path of [STYLES, ...DECIDERS, ...PAINTERS]) {
      expect(SOURCE_FILES, `${path} is not in the scan`).toContain(path);
    }
    const styles = code(STYLES);
    expect(styles).toContain('export function resolveLabelVisibility');
    expect(styles).toContain('export function toolbarLabelClass');
  });

  it('keeps the deleted deciders deleted, everywhere in the source', () => {
    const forbidden = [
      /\bICON_ONLY\b/,
      /\bshowLabel\b/,
      /\btriggersAreCompact\b/,
      /\bresolveLayoutMode\b/,
      /\bbandIsAtLeast\b/,
      /\bToolbarLayoutMode\b/,
    ];
    const offenders = SOURCE_FILES.flatMap((path) => {
      const text = code(path);
      return forbidden.filter((re) => re.test(text)).map((re) => `${path}: ${re.source}`);
    });
    expect(offenders).toEqual([]);
  });

  it('leaves no `compact` prop on a trigger', () => {
    const offenders = PAINTERS.filter((path) => /\bcompact\??[:=]/.test(code(path)));
    expect(offenders).toEqual([]);
  });

  it('has Deck and Toolbar resolve through the one resolver and paint nothing themselves', () => {
    for (const path of DECIDERS) {
      const text = code(path);
      expect(text, `${path} does not call the resolver`).toContain('resolveLabelVisibility(');
      expect(text, `${path} paints a label itself`).not.toMatch(/\btruncate\b|\bsr-only\b/);
      expect(text, `${path} names the container variant`).not.toContain('@max-roomy');
    }
  });

  it('paints every label through toolbarLabelClass, never a hand-written span', () => {
    for (const path of PAINTERS) {
      const text = code(path);
      expect(text, `${path} does not use the helper`).toContain('toolbarLabelClass(');
      // The shape this replaced: a bare truncating span around the label.
      expect(text, `${path} hand-paints a label`).not.toMatch(
        /<span className="truncate">\{\s*(label|[A-Z_]+_LABEL)\s*\}<\/span>/,
      );
    }
  });

  it('names the roomy container variant in exactly one file', () => {
    const naming = SOURCE_FILES.filter((path) => code(path).includes('@max-roomy/deck'));
    expect(naming).toEqual([STYLES]);
  });
});
