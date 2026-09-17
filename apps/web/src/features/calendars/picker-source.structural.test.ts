import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const FEATURE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * **The pickers' calendar source is not the project section's, and must stay that way.**
 *
 * ADR-0053 M2's guarantee is that a plan or activity calendar picker can never offer a calendar the
 * write seam would refuse with a 422 — the tier rule, enforced where it is chosen rather than where
 * it is displayed. ADR-0146 D2 narrowed what the **project detail** section shows by default (its
 * own calendars, with the inherited count stated and one press away), and the obvious worry is that
 * the same narrowing reaches a picker.
 *
 * It cannot, and this asserts why rather than trusting it: the pickers call
 * `usePlanScopedCalendars`, which composes `projectCalendarsQueryOptions` with its own
 * `PICKER_CALENDAR_FILTERS`. The section calls `useProjectCalendars` and filters the RESULT, in its
 * own component. Two hooks, two call sites, no shared narrowing.
 *
 * **The value of this test is the day somebody "tidies up" by making the pickers reuse the
 * section's hook**, or by moving the section's filter down into the shared query options. Either
 * would be a reasonable-looking refactor and either would put a tier-invisible calendar in front of
 * a planner. Neither would fail any existing test.
 */
describe('the pickers do not share the project section’s narrowed source', () => {
  const api = readFileSync(join(FEATURE_DIR, 'api', 'use-calendars.ts'), 'utf8');
  const sectionRaw = readFileSync(
    join(FEATURE_DIR, 'components', 'ProjectCalendarsSection.tsx'),
    'utf8',
  );
  /**
   * **Comments stripped, because this gate's first run matched its own subject's prose.**
   *
   * `ProjectCalendarsSection`'s docblock names `usePlanScopedCalendars` — correctly, explaining that
   * the pickers use a DIFFERENT hook — and the assertion that the section must not reach for that
   * hook fired on the explanation. Six gates in this repository have now shipped a scan that matched
   * a docblock; this one was caught on its first run rather than after, which is the only difference.
   */
  const section = sectionRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // The pinned positive case: both symbols exist and are where this test thinks they are. Every
  // assertion below passes vacuously against a file that was renamed or moved.
  it('finds both hooks where it expects them', () => {
    expect(api).toContain('export function usePlanScopedCalendars');
    expect(api).toContain('export function useProjectCalendars');
    expect(section).toContain('useProjectCalendars(');
    // …and the stripper did not eat the code along with the comments.
    expect(section.length).toBeGreaterThan(1000);
  });

  it('gives the pickers their own filters, not the section’s view', () => {
    const picker = api.slice(api.indexOf('export function usePlanScopedCalendars'));
    expect(picker).toContain('PICKER_CALENDAR_FILTERS');
  });

  it('keeps the section’s narrowing inside the section', () => {
    // The filter is applied to the query's RESULT in the component. If it ever moves into the
    // shared query options, the pickers inherit it silently.
    /**
     * **Deliberately loose, and the assertion below is the real rule.**
     *
     * An earlier version pinned the exact call — `.filter(isOwn)` — and a mutation run showed it
     * going red against `.filter((c) => isOwn(c))`, a refactor that changes nothing. A gate that
     * fires on a rename is noise, and noise is how a gate gets weakened by somebody who is right
     * that it is wrong. This half only asks that the predicate live in the component.
     */
    expect(section).toContain('isOwn');
    expect(
      api,
      'the section’s ownership predicate has leaked into the shared query layer',
    ).not.toContain('isOwn');
  });

  it('does not let the section reach for the picker’s hook', () => {
    expect(section).not.toContain('usePlanScopedCalendars');
  });
});
