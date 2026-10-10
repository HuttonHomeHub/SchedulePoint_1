import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The command surface decides nothing from a measured width** (ADR-0109 D1).
 *
 * Toolbar-redesign M3 added one layout-overflow read to `Deck` — `deckScrolls`, `scrollWidth >
 * clientWidth`, used only to gate `scrollIntoView` / `preventScroll` on a line that scrolls. The
 * docblock that said "no `clientWidth` read" went stale the moment it landed, and a reader who
 * trusts either version is misled. This pins the truth: no observer, no media-query read in script,
 * no viewport width, and the two layout reads confined to the one function that names them.
 *
 * **One media-query read exists, and it decides an ORDER, not a size**: `use-deck-row-order.ts` (the
 * editing row leads below `lg`, owner decision 2026-10-10). It is in its own file so `Deck.tsx` keeps
 * none, and the last case below pins that none of the four files it names reads one itself (the
 * claim is about those files, not the directory: a new file here is not scanned).
 *
 * Comments are stripped first (the repository has recorded four gates matching their own prose).
 */
const DIR = join(process.cwd(), 'src/components/ui/toolbar');

function code(file: string): string {
  return readFileSync(join(DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('Deck and Toolbar measure no width to decide a layout', () => {
  it.each(['Deck.tsx', 'Toolbar.tsx'])(
    '%s uses no ResizeObserver, matchMedia or innerWidth',
    (file) => {
      // Verified red by adding each identifier to Deck.tsx in turn.
      expect(code(file)).not.toMatch(/ResizeObserver|matchMedia|innerWidth/);
    },
  );

  it('Toolbar.tsx reads no scrollWidth or clientWidth', () => {
    expect(code('Toolbar.tsx')).not.toMatch(/scrollWidth|clientWidth/);
  });

  it('Deck.tsx reads scrollWidth and clientWidth only inside deckScrolls', () => {
    const source = code('Deck.tsx');
    const fn = source.match(/function deckScrolls\([^)]*\)[^{]*\{[\s\S]*?\n\}/);
    // The positive limb: a tree where the function was renamed would otherwise pass vacuously.
    expect(fn, 'deckScrolls exists').not.toBeNull();
    expect(fn?.[0]).toMatch(/scrollWidth/);
    expect(fn?.[0]).toMatch(/clientWidth/);
    const outside = source.replace(fn?.[0] ?? '', '');
    expect(outside, 'a width read outside deckScrolls is a second ladder').not.toMatch(
      /scrollWidth|clientWidth/,
    );
  });

  it('the one media-query read is the row-order hook, on the shared floor query, and Deck imports it', () => {
    const hook = code('use-deck-row-order.ts');
    expect(hook).toMatch(/useMediaQuery\(DESIGNED_MIN_WIDTH_QUERY/);
    expect(code('Deck.tsx')).toMatch(/useDeckRowOrder\(DECK_ROWS\)/);
    // None of the other three source files reads a media query by itself.
    for (const file of ['Deck.tsx', 'Toolbar.tsx', 'ToolbarButton.tsx', 'ToolbarPopover.tsx']) {
      expect(code(file), `${file} reads a media query`).not.toMatch(/useMediaQuery|matchMedia/);
    }
  });
});
