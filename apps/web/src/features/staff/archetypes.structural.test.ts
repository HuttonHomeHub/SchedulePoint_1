import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The staff console is built from the archetypes — the same gate the organisation overview carries
 * (`features/overview/archetypes.structural.test.ts`), pointed at a second surface.
 *
 * ADR-0098 made "assembled from the archetypes" enforceable rather than intended, and the reason it
 * had to be a gate is the reason it is worth a second copy: **a hand-rolled frame that happens to
 * match today's archetype looks identical on screen** and drifts the first time either changes. The
 * console is the surface where that matters most, because it is the one screen nobody looks at —
 * `docs/TECH_DEBT.md` #319 records that it had never been photographed by anything, so eight panels
 * shipped without a single design pass between them.
 *
 * **The file set is three directories, and that is a finding rather than a preference.** The
 * approved plan scoped this milestone's sibling gate to `features/staff` alone; grepped, that
 * directory holds **zero** production matches for the shape it was written to catch, because the
 * console's screen file lives in `routes/`. It could never have been verified red and would have
 * passed on day one having tested nothing (spec §8.7) — the shape ADR-0093, ADR-0108, ADR-0121 and
 * ADR-0131 each recorded a gate failing on. So the scan follows the surface, not the folder: the
 * route file, the feature, and the performance probe's UI, which the console mounts and which is
 * where a bespoke frame would most cheaply be hidden.
 */
const WEB_SRC = join(import.meta.dirname, '..', '..');

/** The three directories that make up the staff console, relative to `apps/web/src`. */
const SURFACE = ['routes/staff.tsx', 'features/staff', 'features/perf-probe/ui'];

function sourceFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  const entries = readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [child];
  });
}

function surfaceFiles(): string[] {
  return SURFACE.flatMap((entry) => {
    const path = join(WEB_SRC, entry);
    if (!existsSync(path)) return [];
    return /\.tsx?$/.test(entry) ? [path] : sourceFiles(path);
  });
}

/**
 * The hand-rolled shapes the archetypes replaced, as they were actually written across the
 * fourteen/sixteen call sites — a centred width-limited padded frame, and a page title's type
 * treatment. Each is matched loosely enough that a near-miss copy is caught too.
 *
 * `<h2>` is here because `SectionCard` owns the section rank. The console had **eight** of them,
 * one per `Panel`, which is the same decision made eight times and no way to change it once.
 */
const HAND_ROLLED = [
  {
    name: 'the page frame (PageContainer owns the measure and padding)',
    pattern: /mx-auto[^"'`]*max-w-/,
  },
  { name: "a page title's type treatment (PageHeader owns it)", pattern: /<h1[\s>]/ },
  { name: 'a section heading rank (SectionCard owns it)', pattern: /<h2[\s>]/ },
  // **Promised by spec §8.3 and not delivered until the M6 accessibility review asked for it.** The
  // regression it names is an author hand-rolling `grid grid-cols-2` at the page root instead of
  // reaching for `PageGrid`, which silently gives up the DOM-order guarantee that primitive exists
  // to keep (WCAG 1.3.2) with nothing looking wrong. Harmless today — this surface hand-rolls no
  // grid at all — which is exactly what the pinned positive case below is for.
  { name: 'a hand-rolled page grid', pattern: /\bgrid-cols-\d/ },
];

describe('the staff console is built from the archetypes', () => {
  // Comments are stripped before matching. Four gates in this repository have now shipped a scan
  // that matched its own prose — `reset-fills.structural.test.ts`, both ratchets in
  // `token-architecture.test.ts`, and the first version of the overview's copy of this file, which
  // reported a `<h1>` appearing only in a docblock. Writing down the reasoning must not be what
  // makes a gate fail.
  const sources = surfaceFiles().map((path) => ({
    path: path.replace(WEB_SRC, ''),
    text: readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  }));

  // The pinned positive case. "No file hand-rolls a frame" passes perfectly against a scan that
  // found no files at all — ADR-0093's lesson, and ADR-0108's census gate failed exactly this way
  // on its first run, because its glob matched nothing and there was therefore nothing to be
  // unclassified.
  it('reads the whole staff surface', () => {
    expect(
      sources.length,
      'the scan found no files — every assertion below is vacuous',
    ).toBeGreaterThan(5);
    expect(
      sources.map((file) => file.path),
      'the console screen itself must be in the scanned set',
    ).toContain('/routes/staff.tsx');
  });

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
    // Deliberately a shorter list than the overview's: this is a page with a heading and eight
    // sections, and `EmptyState` is not its shape — every absence here is a table's, which
    // `DataTable` frames itself. **The sentence used to say the same of `ListRow` and was made wrong
    // by M3**, which reuses `ListRow` + `rowLinkClass` for the status summary precisely because
    // `NeedsAttentionSection` is the same problem already solved. The gate never asserted absence,
    // only presence, so nothing failed and the comment simply went stale (M6 UX review).
    for (const archetype of ['PageContainer', 'PageHeader', 'SectionCard']) {
      expect([...used], `${archetype} is no longer used by the staff console`).toContain(archetype);
    }
  });

  it.each(HAND_ROLLED)('hand-rolls no $name', ({ pattern }) => {
    const offenders = sources.filter((file) => pattern.test(file.text)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
