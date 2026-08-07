import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(__dirname, 'search-matches.ts'), 'utf8');

/**
 * The structural gate for the search-match model (`docs/specs/canvas-search-navigation/`).
 *
 * These assertions exist because the failure they prevent is **invisible at runtime on ordinary
 * plans**. A second matching predicate here would agree with `lenses.ts` on almost every query and
 * differ on the edges; the only symptom would be Enter skipping a bar the canvas had left un-dimmed,
 * on a plan nobody was looking at closely. Same shape as the ADR-0065 one-route-function rule, and
 * the same reason for pinning it in a test rather than a paragraph.
 */
describe('search-matches is not allowed a second predicate', () => {
  it('imports the matcher from lenses rather than defining one', () => {
    expect(SOURCE).toMatch(/import \{[^}]*matchesActivityFilter[^}]*\} from '\.\/lenses'/s);
  });

  it('never lowercases, trims or substring-tests an activity field itself', () => {
    // The four operations `matchesActivityFilter` performs. Any of them appearing here means the
    // matching rule has been re-implemented, whatever the new function is called.
    for (const forbidden of ['.toLowerCase(', '.includes(', '.trim(', '.startsWith(']) {
      expect(SOURCE).not.toContain(forbidden);
    }
  });

  it('imports the walk from ordering rather than sorting on its own comparator', () => {
    expect(SOURCE).toMatch(/import \{[^}]*compareByTimeThenLane[^}]*\} from '\.\/ordering'/s);
    // `.sort(` is permitted only when handed the shared comparator by name.
    const sorts = SOURCE.match(/\.sort\([^)]*\)/g) ?? [];
    expect(sorts).not.toHaveLength(0);
    for (const call of sorts) expect(call).toContain('compareByTimeThenLane');
  });

  it('stays pure — no React, DOM, canvas or fetch import', () => {
    for (const forbidden of ["from 'react'", "from '@/", 'document.', 'window.', 'fetch(']) {
      expect(SOURCE).not.toContain(forbidden);
    }
  });
});
