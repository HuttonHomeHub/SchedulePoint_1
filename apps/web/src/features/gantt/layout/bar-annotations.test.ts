import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { barLabelMode, constraintBadge } from './bar-annotations';

/**
 * **M5 legibility — the two things drawn beside a bar.**
 *
 * The assertions that matter are the withholding ones. A label that overlaps its neighbour is worse
 * than no label (ADR-0054's Dates rule), and a badge that disappears at a dense zoom disappears at
 * precisely the moment a planner is hunting for pinned bars.
 */

describe('barLabelMode', () => {
  it('labels a bar with room to its right', () => {
    expect(barLabelMode({ chartPx: 800, barRight: 100, labelChars: 10 })).toBe('name');
  });

  it('withholds a label that would run off the chart', () => {
    // Not a zoom threshold: a threshold is a second answer to "does this fit?" and goes stale the
    // moment a font or a column width changes.
    expect(barLabelMode({ chartPx: 200, barRight: 190, labelChars: 20 })).toBe('none');
  });

  it('withholds at the boundary rather than overflowing by a pixel', () => {
    // 10 chars ≈ 60px + 8px gap = 68. At barRight 740 of 800 that is exactly 808 — over.
    expect(barLabelMode({ chartPx: 800, barRight: 740, labelChars: 10 })).toBe('none');
    expect(barLabelMode({ chartPx: 800, barRight: 732, labelChars: 10 })).toBe('name');
  });
});

describe('constraintBadge', () => {
  const withConstraint = (type: string | null) =>
    ({ constraintType: type }) as unknown as Pick<ActivitySummary, 'constraintType'>;

  it('says nothing for an unconstrained activity', () => {
    expect(constraintBadge(withConstraint(null))).toBeNull();
  });

  it('names the constraint in the editor own words, not a second vocabulary', () => {
    expect(constraintBadge(withConstraint('START_NO_EARLIER_THAN'))?.label).toBe(
      'Constrained (start no earlier than)',
    );
  });

  it('uses ONE glyph for every kind', () => {
    // A planner needs to know THAT a bar is pinned at a glance; which kind is a fact the editor
    // states precisely. Eight glyphs nobody can tell apart would be a legend the chart cannot hold.
    const glyphs = new Set(
      ['START_NO_EARLIER_THAN', 'MANDATORY_FINISH', 'AS_LATE_AS_POSSIBLE'].map(
        (type) => constraintBadge(withConstraint(type))?.glyph,
      ),
    );
    expect(glyphs.size).toBe(1);
  });

  it('still describes a constraint type it does not have words for', () => {
    // Falls back rather than rendering "Constrained (undefined)" — a type added to the enum later
    // must not produce a badge that reads as a bug.
    expect(constraintBadge(withConstraint('SOME_NEW_KIND'))?.label).toBe('Constrained (pinned)');
  });

  it('carries words as well as a glyph, so colour is never the only carrier', () => {
    // WCAG 1.4.1. One string feeds both the `title` and the accessible description, so the badge
    // cannot say different things to a sighted reader and a screen-reader one.
    const badge = constraintBadge(withConstraint('MANDATORY_START'));
    expect(badge?.glyph).toBeTruthy();
    expect(badge?.label).toMatch(/mandatory start/);
  });
});
