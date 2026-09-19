import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EXEMPT,
  SCREENS,
  SWEPT,
  partitionWraps,
  type WrapObservation,
} from '../../e2e-page-composition/screen-roster';

/**
 * **The two instruments must agree about what the estate is.**
 *
 * `docs/TECH_DEBT.md` #344: a wrap on Members survived a gate pass because the journey's wrap sweep
 * named three screens by hand while `measure-column-fit.mjs` measures ten. Nothing compared the two
 * lists, so the gap was invisible from either side — each file was internally consistent and
 * correct-looking.
 *
 * This census compares them **in both directions**, and reads the probe **as text** rather than
 * importing it: that script launches Chromium at module scope, so importing it here would start a
 * browser to read an array. The `check:ci-roster` pattern, for the same reason.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '../../scripts/measure-column-fit.mjs');

/** The probe's `PAGES` keys, parsed out of its source. */
function probeKeys(): string[] {
  const src = readFileSync(root, 'utf8');
  const block = /const PAGES = \[([\s\S]*?)\n\];/.exec(src);
  if (block === null) throw new Error('measure-column-fit.mjs: PAGES array not found');
  return [...block[1]!.matchAll(/\[\s*'([^']+)'/g)].map((m) => m[1]!);
}

describe('the screen roster and the measurement probe agree', () => {
  /**
   * **The pinned positive case, and it comes first** (ADR-0093, and ADR-0108's census whose glob
   * matched zero files and reported perfect compliance over nothing).
   *
   * Every assertion below is a set comparison, and two empty sets agree perfectly. If the regex
   * above stops matching — a reformat, a rename, a `PAGES` moved to another file — every other case
   * in this describe passes while checking nothing at all.
   */
  it('finds a non-empty population on both sides', () => {
    expect(probeKeys().length).toBeGreaterThanOrEqual(10);
    expect(SCREENS.length).toBeGreaterThanOrEqual(10);
  });

  it('names every screen the probe measures, and no others', () => {
    expect([...SCREENS.map((s) => s.key)].sort()).toEqual([...probeKeys()].sort());
  });

  it('declares a reason for every screen it exempts, and none is blank', () => {
    // A blank reason is an exemption that records nothing about why — the defect ADR-0136 records
    // the licence gate's identical rule having no test for, and which #291's gate was found to
    // have shipped with this week.
    for (const screen of EXEMPT) {
      expect(screen.exemptReason?.trim(), `${screen.key} exempt with no reason`).toBeTruthy();
    }
  });

  it('sweeps the two screens whose absence was the defect', () => {
    // FC-3 clause 4. `members` was absent from the wrap sweep and the reflow sweep; `audit-log` was
    // absent from the wrap sweep, which is where its DECLARED `auto` wraps have to be tolerated
    // rather than merely unseen.
    const swept = SWEPT.map((s) => s.key);
    expect(swept).toContain('members');
    expect(swept).toContain('audit-log');
  });

  it('gives every swept screen the settled marker a sweep needs', () => {
    // `DataTable`'s loading `<thead>` prints no header text and its skeleton is three visible
    // `<tr>`s, so a sweep that does not wait for settled content examines nothing and reports it as
    // nothing wrong. A swept screen with no marker is a sweep that cannot know it has arrived.
    for (const screen of SWEPT) {
      expect(screen.settled, `${screen.key} is swept with no settled marker`).toBeTruthy();
    }
  });

  it('exempts nothing silently: SWEPT and EXEMPT partition the roster', () => {
    // Without this, a screen could be dropped from SWEPT by an edit to its `tables` flag and land
    // in neither list — present in the roster, visited by nothing, explained by nothing. That is
    // the `PENDING_COVERAGE` queue ADR-0073 C3.4 deleted, in miniature.
    const classified = new Set([...SWEPT, ...EXEMPT].map((s) => s.key));
    expect([...classified].sort()).toEqual([...SCREENS.map((s) => s.key)].sort());
    expect(SWEPT.some((s) => EXEMPT.includes(s))).toBe(false);
  });
});

describe('partitionWraps — the gate is discriminating, not merely wider', () => {
  const wrap = (screen: string, header: string, colWidth: string): WrapObservation => ({
    screen,
    header,
    colWidth,
    text: 'x',
  });

  it('tolerates a DECLARED auto column and reports an undeclared one', () => {
    // The two real cases, by name: the audit log's three columns are declared `auto` with written
    // reasons; Members' five declare nothing and are `auto` by omission. A gate that cannot tell
    // them apart either fails on day one (ADR-0058) or excuses the defect.
    const { findings, tolerated } = partitionWraps([
      wrap('audit-log', 'Event', 'auto'),
      wrap('members', 'Status', 'undeclared'),
    ]);

    expect(tolerated.map((w) => w.header)).toEqual(['Event']);
    expect(findings.map((w) => w.header)).toEqual(['Status']);
  });

  it('reports a wrapping fit or bounded column rather than tolerating it', () => {
    // `fit` must never wrap — that is what the value means — and a wrapping `bounded` column is
    // ADR-0145 M4-T2's defect, where a cap was measured and the content was never asked whether it
    // still fitted inside it.
    const { findings } = partitionWraps([
      wrap('calendars', 'Working days', 'fit'),
      wrap('resources', 'Code', 'bounded'),
    ]);

    expect(findings).toHaveLength(2);
  });

  it('returns nothing from nothing, which is why the sweep carries its own positive case', () => {
    // Stated rather than implied: this function is honest about an empty input, so "no findings"
    // here is not evidence that a screen was examined. The sweep asserts it saw tables and settled
    // rows BEFORE it trusts this partition (ADR-0093).
    expect(partitionWraps([])).toEqual({ findings: [], tolerated: [] });
  });
});
