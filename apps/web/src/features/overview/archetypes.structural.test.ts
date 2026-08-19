import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ADR-0097 Landing B's condition, expressed as a gate rather than an intention.
 *
 * The landing page exists to demonstrate that the design language is a **system** — that a screen
 * can be assembled from the archetypes and come out looking designed. A beautiful one-off here
 * would falsify that thesis on its first outing, and it would do so **invisibly**: a hand-rolled
 * frame that happens to match today's archetype looks identical on screen and drifts the first time
 * either changes.
 *
 * So two assertions, and the second is the one that bites. The first says the screen reaches for
 * the archetypes at all. The second says it does not hand-roll the decisions they own — the page
 * frame's measure and padding, and the page heading's size and weight — which is exactly what the
 * fourteen and sixteen hand-rolled copies looked like before the archetypes existed.
 *
 * It scans the whole feature rather than the screen file alone, because the cheap way to defeat it
 * is to move the bespoke frame one file down.
 */
const FEATURE_DIR = join(import.meta.dirname, '.');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [path];
  });
}

/**
 * The hand-rolled shapes the archetypes replaced, as they were actually written across the
 * fourteen/sixteen call sites — a centred width-limited padded frame, and a page title's type
 * treatment. Each is matched loosely enough that a near-miss copy is caught too.
 */
const HAND_ROLLED = [
  {
    name: 'the page frame (PageContainer owns the measure and padding)',
    pattern: /mx-auto[^"'`]*max-w-/,
  },
  { name: "a page title's type treatment (PageHeader owns it)", pattern: /<h1[\s>]/ },
  { name: 'a section heading rank (SectionCard owns it)', pattern: /<h2[\s>]/ },
];

describe('the overview is built from the archetypes', () => {
  const files = sourceFiles(FEATURE_DIR);
  // Comments are stripped before matching. The first version of this gate reported
  // `OverviewScreen.tsx` for a `<h1>` that appears only in its docblock — the same false positive
  // the Gantt row-rhythm gate shipped and had to fix, which is why it is worth writing down twice.
  const sources = files.map((path) => ({
    path,
    text: readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  }));

  it('imports the page archetypes', () => {
    const usesArchetypes = sources.filter((file) => file.text.includes('@/components/ui/page'));
    expect(usesArchetypes.length).toBeGreaterThan(0);

    const used = new Set<string>();
    for (const file of usesArchetypes) {
      for (const match of file.text.matchAll(
        /import \{([^}]+)\} from '@\/components\/ui\/page'/g,
      )) {
        for (const name of match[1]!.split(',')) used.add(name.trim());
      }
    }
    // The screen is a page with a heading, sections, rows, a loading shape and empty states — so
    // every archetype is used. If one of these stops being used, either the screen grew a bespoke
    // replacement or the archetype was renamed; both want a human to look. Asserted as "each is
    // present" rather than as set equality, because the barrel also exports non-archetype helpers
    // (`rowLinkClass`) and set equality would fail on adding one — a failure that says nothing.
    for (const archetype of [
      'EmptyState',
      'ListRow',
      'ListRowSkeleton',
      'PageContainer',
      'PageHeader',
      'SectionCard',
    ]) {
      expect([...used], `${archetype} is no longer used by the overview`).toContain(archetype);
    }
  });

  it.each(HAND_ROLLED)('hand-rolls no $name', ({ pattern }) => {
    const offenders = sources
      .filter((file) => pattern.test(file.text))
      .map((file) => file.path.replace(FEATURE_DIR, ''));
    expect(offenders).toEqual([]);
  });
});
