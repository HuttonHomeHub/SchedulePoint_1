import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The nine non-canvas screens are built from the archetypes**, and a gate says so — the third
 * copy of the pattern at `features/overview/archetypes.structural.test.ts` and
 * `features/staff/archetypes.structural.test.ts`, pointed at the surface those two do not cover.
 *
 * ADR-0098 made "assembled from the archetypes" enforceable rather than intended, and the reason
 * this surface needed its own copy is measured rather than asserted: at M0, **`PageHeader` was used
 * by one of these nine screens and `SectionCard` by one** (`members.tsx`, converted when the
 * archetypes shipped), while the other eight hand-rolled the same header row and the same section
 * heading between them. The result was **four different `h1` rhythms** — 75, 83, 85 and 105 px from
 * the top of `main` — identical at 1280 and at 1646, so no width resolves them
 * (`docs/specs/page-consistency/m0-measurement.md` C1).
 *
 * **A hand-rolled header that happens to match today's archetype looks identical on screen** and
 * drifts the first time either changes, with nothing reporting it. That is the whole argument, and
 * it is the same one the two sibling gates make.
 *
 * **What this gate deliberately does not cover: `routes/account.tsx`.** That screen adopts
 * `PageHeader` in the same milestone, but it is a **declared exception** to the page frame
 * (`components/ui/page/page-container.structural.test.ts:45-54`, where its 672 px measure is
 * exempted with a written reason). Adding it here would mean exempting it from this gate's frame
 * assertion too — an exception list inside a gate whose whole value is having none. So its header
 * adoption is **ungated and can regress silently**, which is accepted rather than solved, and is
 * written down here so a later reader finds the decision rather than the hole.
 */
const WEB_SRC = join(import.meta.dirname, '..');

/**
 * The nine in-scope screens, plus the one feature component that renders a page-level section of
 * its own (`ProjectCalendarsSection`, which the project-detail screen mounts and which carries the
 * third of the three treatments M0 found for "a named sub-section").
 *
 * Named files rather than a directory walk, because `routes/` also holds `account.tsx` and
 * `onboarding.tsx` — both deliberately different — and the plan screens, which are the canvas
 * surface this epic does not touch. A walk would have to exempt more than it covered.
 */
const SURFACE = [
  'routes/clients.tsx',
  'routes/client-detail.tsx',
  'routes/project-detail.tsx',
  'routes/calendars.tsx',
  'routes/resources.tsx',
  'routes/members.tsx',
  'routes/audit-log.tsx',
  'routes/recently-deleted.tsx',
  'routes/my-activity.tsx',
  'features/calendars/components/ProjectCalendarsSection.tsx',
];

/**
 * The hand-rolled shapes the archetypes replaced, matched loosely enough that a near-miss copy is
 * caught too.
 *
 * **`<h2>` joined this list at M2, in the same commit that made it true** — it was written and run
 * red at M1, naming exactly three files, then held back rather than landing knowingly red on
 * `main`, because a gate that is red on purpose is a gate people learn to ignore. `SectionCard`
 * owns the section rank, and M0 found **three different treatments** for a named sub-section across
 * this surface: the archetype, a bare `<h2 className="mt-6 text-lg font-medium">`, and that same
 * `<h2>` inside a flex action row.
 */
const HAND_ROLLED = [
  {
    name: 'the page frame (PageContainer owns the measure and padding)',
    pattern: /mx-auto[^"'`]*max-w-/,
  },
  { name: "a page title's type treatment (PageHeader owns it)", pattern: /<h1[\s>]/ },
  { name: 'a section heading rank (SectionCard owns it)', pattern: /<h2[\s>]/ },
];

describe('the non-canvas screens are built from the archetypes', () => {
  // Comments are stripped before matching. **Five** gates in this repository have now shipped a scan
  // that matched its own prose — `reset-fills.structural.test.ts`, both ratchets in
  // `token-architecture.test.ts`, the overview gate's first version, and the frame gate one file
  // over, which matched the frame spelled out in its own docblock on its first run. Writing down
  // the reasoning must not be what makes a gate fail.
  const sources = SURFACE.map((path) => ({
    path,
    text: readFileSync(join(WEB_SRC, path), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  }));

  // The pinned positive case. "No file hand-rolls a header" passes perfectly against a scan that
  // found no files — ADR-0093's lesson, and ADR-0108's census gate failed exactly that way on its
  // first run because its glob matched nothing, so there was nothing left to be unclassified.
  it('reads the whole surface', () => {
    expect(sources.length, 'the scan found no files — every assertion below is vacuous').toBe(
      SURFACE.length,
    );
    expect(
      sources.map((file) => file.path),
      'the clients screen must be in the scanned set',
    ).toContain('routes/clients.tsx');
    expect(sources.every((file) => file.text.length > 200)).toBe(true);
  });

  it('imports the page archetypes', () => {
    const usesArchetypes = sources.filter((file) => file.text.includes('@/components/ui/page'));
    expect(
      usesArchetypes.map((file) => file.path).length,
      'no screen on this surface imports the archetypes at all',
    ).toBeGreaterThan(0);

    const used = new Set<string>();
    for (const file of usesArchetypes) {
      for (const match of file.text.matchAll(
        /import \{([^}]+)\} from '@\/components\/ui\/page'/g,
      )) {
        for (const name of match[1]!.split(',')) used.add(name.trim());
      }
    }
    for (const archetype of ['PageContainer', 'PageHeader', 'SectionCard']) {
      expect([...used], `${archetype} is no longer used by these screens`).toContain(archetype);
    }
  });

  it.each(HAND_ROLLED)('hand-rolls no $name', ({ pattern }) => {
    const offenders = sources.filter((file) => pattern.test(file.text)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
