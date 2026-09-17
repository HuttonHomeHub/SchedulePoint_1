import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PAGE_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(PAGE_DIR, '..', '..', '..');

/**
 * **Every list of rows sits in a named section** (ADR-0146 D2, FC-4).
 *
 * Six screens rendered a `DataTable` straight onto the page background while the organisation
 * landing put everything in a card — `clients`, `calendars`, `resources`, `audit-log`,
 * `recently-deleted` and `my-activity`. That is most of why the product owner reported the screens
 * as "just lists" that "don't have a white holding box", and the last of the six was not in their
 * report at all: `my-activity` had the same defect and nobody had looked at it.
 *
 * **What this gate protects is the SEVENTH screen**, not the six. A sweep fixes today's estate; the
 * reason to compute it is that the next list added is framed by the same rule rather than by
 * whoever is reviewing it. That is this repository's standing finding about prose rules
 * (ADR-0058), and the frame rule was prose until now.
 *
 * **The check is structural and it is deliberately narrow.** It asserts that a file rendering
 * `<DataTable` also renders `<SectionCard` — not that they are nested, which a string scan cannot
 * see and which the journey asserts in a real browser instead. A narrow check that is true beats a
 * broad one that is approximate, and the gap is named rather than left implicit.
 */

/** Every `.tsx` under a directory, walked from disk so an untracked file is covered too. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * **A table inside a dialog is not a page list, and this rule does not govern it.**
 *
 * Found by this gate's own first green-ish run: it flagged `routes/share.tsx`, the session-less
 * guest view, whose feature directory contains `ShareLinksDialog` — a MEMBER-facing overlay for
 * managing share links that the guest route never renders. The coarse directory resolver pulled it
 * in, exactly as that function's docblock predicts.
 *
 * The discriminator is not a patch for that one case. A dialog is an overlay with its own frame,
 * its own dismissal and its own width; a page section is a box on a page. Asking an overlay to
 * carry one would put a card inside a card. So a file that renders a `Dialog` or a `Sheet` does not
 * contribute rows to its screen's list-ness, and `ShareLinksDialog` is the pinned case for it.
 */
function isOverlay(source: string): boolean {
  return /<Dialog\b/.test(source) || /<Sheet\b/.test(source);
}

/** Comments stripped: this file's own docblock names both tags it looks for. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Screens whose rows are framed by something other than `SectionCard`, with the reason.
 *
 * Both entries are real and both are pinned: without a non-empty list, the "every exception carries
 * a reason" assertion passes against nothing, which is the shape this file's other pinned case
 * exists to refuse.
 */
const DECLARED_UNFRAMED = new Map<string, string>([
  [
    'routes/staff.tsx',
    'The staff console has its own card archetype (`features/staff/ui/panel.tsx`), which predates ' +
      'this one and frames every table on that screen. Converting it is ADR-0146 M2-T2a, whose ' +
      'acceptance condition is that the console comes through pixel-unchanged.',
  ],
  [
    'routes/plan-detail.tsx',
    'The plan workspace owns its own chrome (ADR-0099/ADR-0109) and is explicitly out of this ' +
      "epic's scope. Its `PageContainer` is the not-found branch, which renders no rows.",
  ],
]);

/** The local modules a screen imports directly — one level, which is what "this screen" means. */
function directFeatureImports(source: string): string[] {
  return [...code(source).matchAll(/from '(@\/(?:features|components)\/[^']+)'/g)].map(
    (m) => m[1] ?? '',
  );
}

/**
 * Resolve an `@/…` specifier to **every file under the directory it names**.
 *
 * Deliberately coarse, and the coarseness is the blind spot rather than a shortcut. A screen
 * imports `@/features/clients`, which is a barrel (`index.ts`) re-exporting components; following
 * the barrel means parsing re-exports, and the first version of this resolver simply missed it —
 * it collected only `.tsx`, so the barrel did not exist and every screen resolved to nothing. Its
 * pinned case caught that, which is what that case is for.
 *
 * The cost is that a feature directory containing an unrelated framed component would satisfy the
 * rule for a screen that is not framed. That direction under-reports, so it is stated here and the
 * journey asserts the real nesting in a browser, where it is a question about two boxes rather than
 * two strings.
 */
function resolve(spec: string, files: string[]): string[] {
  const rel = `${spec.replace('@/', '')}/`;
  return files.filter((f) => `${relative(WEB_SRC, f).split(sep).join('/')}`.startsWith(rel));
}

describe('a list of rows sits in a named section', () => {
  const files = [
    ...sourceFiles(join(WEB_SRC, 'routes')),
    ...sourceFiles(join(WEB_SRC, 'features')),
    ...sourceFiles(join(WEB_SRC, 'components')),
  ].filter((f) => !/\.test\.tsx?$/.test(f));
  const routes = sourceFiles(join(WEB_SRC, 'routes')).filter(
    (f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f),
  );

  /** A screen's closure: its route file plus the feature/component modules it imports directly. */
  function closureOf(route: string): string[] {
    const source = readFileSync(route, 'utf8');
    const imported = directFeatureImports(source).flatMap((spec) => resolve(spec, files));
    return [route, ...imported];
  }

  // The pinned positive case. Every assertion below passes vacuously against a walk that found no
  // files or a matcher that recognises neither tag — the failure this repository keeps recording,
  // where a census reports a clean estate because it selected nothing (ADR-0093, ADR-0108).
  it('reads the tree and can still recognise both tags', () => {
    expect(files.length, 'the walk found no source files').toBeGreaterThan(100);
    expect(routes.length, 'the walk found no routes').toBeGreaterThan(5);
    const tableUsers = files.filter((f) => /<DataTable\b/.test(code(readFileSync(f, 'utf8'))));
    expect(tableUsers.length, 'the walk found no DataTable call sites').toBeGreaterThanOrEqual(5);
    // The closure walk resolves something, or every screen below trivially renders no rows.
    const clients = routes.find((r) => r.endsWith(`${sep}clients.tsx`));
    expect(clients, 'the clients route is missing').toBeDefined();
    expect(
      closureOf(clients as string).length,
      'the import resolver found nothing — every screen would look empty',
    ).toBeGreaterThan(1);
    expect(/<SectionCard\b/.test(code('<SectionCard title="x">'))).toBe(true);
    expect(/<SectionCard\b/.test(code('// <SectionCard title="x">'))).toBe(false);
    // The overlay discriminator, pinned on the file that forced it to exist.
    const dialog = files.find((f) => f.endsWith(`${sep}ShareLinksDialog.tsx`));
    expect(dialog, 'ShareLinksDialog is missing — the overlay case is unpinned').toBeDefined();
    const dialogSource = code(readFileSync(dialog as string, 'utf8'));
    expect(/<DataTable\b/.test(dialogSource), 'it no longer renders rows').toBe(true);
    expect(isOverlay(dialogSource), 'it is no longer recognised as an overlay').toBe(true);
  });

  it('is true of every screen that renders a table', () => {
    const offenders = routes.flatMap((route) => {
      const key = relative(WEB_SRC, route).split(sep).join('/');
      if (DECLARED_UNFRAMED.has(key)) return [];
      const sources = closureOf(route).map((f) => code(readFileSync(f, 'utf8')));
      if (!sources.some((s) => /<DataTable\b/.test(s) && !isOverlay(s))) return [];
      if (sources.some((s) => /<SectionCard\b/.test(s))) return [];
      return [key];
    });

    expect(
      offenders,
      'a screen that renders rows renders them inside a `SectionCard` — a table on the bare page ' +
        'background is the defect ADR-0146 D2 was opened on',
    ).toEqual([]);
  });

  it('declares every unframed screen with a reason', () => {
    expect(DECLARED_UNFRAMED.size, 'the exception list is empty, so nothing above can fail').toBe(
      2,
    );
    for (const [key, reason] of DECLARED_UNFRAMED) {
      expect(routes.map((r) => relative(WEB_SRC, r).split(sep).join('/'))).toContain(key);
      expect(reason.length, `${key} is exempt with no reason`).toBeGreaterThan(20);
    }
  });
});
