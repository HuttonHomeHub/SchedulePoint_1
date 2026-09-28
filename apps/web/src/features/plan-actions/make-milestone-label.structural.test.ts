import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MAKE_MILESTONE_LABEL } from './make-milestone-gate';
import { selectionActionItems } from './selection-actions';

/**
 * **One label, three surfaces** (ADR-0162 decision 4, M4-T2).
 *
 * The selection bar and the Gantt row menu share one registry item, so they cannot disagree about
 * the label. The activities table is a hand-kept roster, so it can: a copy change applied to the
 * registry and not the table is the "one control and not its neighbour" shape this register records
 * over and over. So the table must IMPORT the label, and may not spell it.
 *
 * Verified red (M4 record) against a table that writes `label: 'Make milestone…'` inline.
 */
const TABLE = join(import.meta.dirname, '..', 'activities', 'components', 'ActivitiesTable.tsx');

/** Comments stripped, so a docblock that names the label is not counted as spelling it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Make milestone… is spelled once', () => {
  it('the registry item uses the exported label and carries a lostReason (ADR-0135)', () => {
    const item = selectionActionItems.find((i) => i.id === 'make-milestone');
    expect(item?.label).toBe(MAKE_MILESTONE_LABEL);
    expect(item?.lostReason).toMatch(/\S/);
  });

  it('the activities table imports the label and holds no literal equal to it', () => {
    const source = code(readFileSync(TABLE, 'utf8'));
    expect(source).toContain('MAKE_MILESTONE_LABEL');
    // Pinned positive case: the check finds the literal when it is there, so a pass below means
    // absence rather than a scan that cannot see.
    expect(code(`const item = { label: '${MAKE_MILESTONE_LABEL}' };`)).toContain(
      `'${MAKE_MILESTONE_LABEL}'`,
    );
    for (const quote of ["'", '"', '`']) {
      expect(source).not.toContain(`${quote}${MAKE_MILESTONE_LABEL}${quote}`);
    }
  });
});
