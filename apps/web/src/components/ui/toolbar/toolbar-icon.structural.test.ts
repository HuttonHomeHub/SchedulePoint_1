import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * **A toolbar glyph's ink is decided in one place and every trigger asks it** (toolbar-grid M3, R4).
 *
 * `toolbarIconClass` (`toolbar-styles.ts`) is the rule: a glyph beside a visible label is a step
 * quieter than the label, an icon-only glyph keeps the control's ink. A trigger that paints its own
 * icon and does not call it keeps today's ink, which on the deck is the **one wrong picture** the
 * helper exists to prevent: eleven quiet glyphs and one loud one, with nothing saying why. Custom
 * `render` triggers are where that happens (the repository's most-recorded shape: one correct
 * pattern applied to a control and not its neighbour), so this reads source rather than trusting a
 * review.
 *
 * **It reads source with comments removed**, because this docblock names the identifiers it polices
 * (`container-query.structural.test.ts` is the precedent for a gate matching its own prose).
 *
 * **The selection bar is deliberately outside it** (D-5): it keeps today's ink, and
 * the toolbar-grid plan (M5-T2) files the follow-up that extends the quiet glyph to it. Adding `quietIcons` there is
 * a decision, which is why the last case below pins that nothing but the band passes it.
 *
 * Verified red by removing the helper call from the Analysis trigger, from `ToolbarSplitButton`, and
 * by dropping `quietIcons` from one `<ToolbarPopover`.
 */
const SOURCE_FILES = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
  .split('\n')
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !/\.d\.ts$/.test(path));

const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const STYLES = 'src/components/ui/toolbar/toolbar-styles.ts';
const PRIMITIVES = [
  'src/components/ui/toolbar/ToolbarButton.tsx',
  'src/components/ui/toolbar/ToolbarPopover.tsx',
  'src/components/ui/toolbar/ToolbarSplitButton.tsx',
];
const ITEMS = 'src/features/tsld/toolbar/tsld-toolbar-items.tsx';

/** Files that paint a control with `toolbarControlVariants` and are allowed not to call the helper. */
const OUTSIDE_THE_BAND: Record<string, string> = {
  'src/features/plan-actions/selection-actions.tsx':
    'the selection bar keeps today’s ink (D-5, toolbar-grid plan M5-T2)',
};

/** The opening tag starting at `start` (`<Name`), through its closing `>` at brace depth 0. */
function openingTag(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0 && text[i - 1] !== '=') return text.slice(start, i + 1);
  }
  throw new Error(`no end to the tag at ${String(start)}`);
}

describe('a toolbar glyph has one painter, and every trigger calls it', () => {
  it('reads the files it polices, and finds the helper it expects', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(500);
    for (const path of [STYLES, ...PRIMITIVES, ITEMS, ...Object.keys(OUTSIDE_THE_BAND)]) {
      expect(SOURCE_FILES, `${path} is not in the scan`).toContain(path);
    }
    expect(code(STYLES)).toContain('export function toolbarIconClass');
  });

  it('has each primitive call the helper and gate it on the opt-in', () => {
    for (const path of PRIMITIVES) {
      const text = code(path);
      expect(text, `${path} does not call the helper`).toContain('toolbarIconClass(');
      expect(text, `${path} applies the helper without the opt-in`).toMatch(
        /quietIcons && toolbarIconClass\(/,
      );
    }
  });

  it('has every file that paints a control with toolbarControlVariants call the helper, or say why not', () => {
    const painters = SOURCE_FILES.filter((path) => code(path).includes('toolbarControlVariants('));
    // The positive control: a scan that finds no painters would pass every case below vacuously.
    expect(painters.length).toBeGreaterThanOrEqual(5);
    const offenders = painters.filter(
      (path) => !code(path).includes('toolbarIconClass(') && !(path in OUTSIDE_THE_BAND),
    );
    expect(offenders).toEqual([]);
  });

  it('has a custom trigger in the registry call the helper once per control it paints', () => {
    const text = code(ITEMS);
    // The conflict read-out is `tone: 'info'` (a figure, not a command) and is the one painter exempt.
    const controls = [...text.matchAll(/toolbarControlVariants\(\{(?![^}]*tone: 'info')/g)];
    const calls = [...text.matchAll(/toolbarIconClass\(/g)];
    expect(controls.length, 'the scan found no custom triggers').toBeGreaterThanOrEqual(4);
    expect(calls.length).toBeGreaterThanOrEqual(controls.length);
  });

  it.each(['<ToolbarPopover', '<ToolbarSplitButton'])(
    'passes quietIcons to every %s in the registry',
    (tag) => {
      const text = code(ITEMS);
      const tags: string[] = [];
      for (let at = text.indexOf(tag); at !== -1; at = text.indexOf(tag, at + 1)) {
        tags.push(openingTag(text, at));
      }
      expect(tags.length, `${tag} is not used`).toBeGreaterThan(0);
      const missing = tags.filter((t) => !t.includes('quietIcons={api.quietIcons}'));
      expect(missing).toEqual([]);
    },
  );

  it('passes the opt-in from the band alone: the deck and the header’s two toolbars', () => {
    const optIn = SOURCE_FILES.filter((path) => /\bquietIcons\b/.test(code(path))).sort();
    expect(optIn).toEqual(
      [
        'src/components/layout/workspace/plan-workspace-toolbar.tsx',
        'src/components/ui/toolbar/Deck.tsx',
        'src/components/ui/toolbar/Toolbar.tsx',
        'src/components/ui/toolbar/ToolbarButton.tsx',
        'src/components/ui/toolbar/ToolbarPopover.tsx',
        'src/components/ui/toolbar/ToolbarSplitButton.tsx',
        'src/components/ui/toolbar/toolbar-registry.ts',
        'src/features/plan-lock/components/PlanPenControl.tsx',
        ITEMS,
      ].sort(),
    );
    const header = code('src/components/layout/workspace/plan-workspace-toolbar.tsx');
    expect([...header.matchAll(/^\s*quietIcons$/gm)]).toHaveLength(2);
  });
});
