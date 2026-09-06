import type { RevisionClassAssessment } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  changesAnnouncement,
  CHANGES_FOOTER,
  classCountSentence,
  classTitle,
  notAssessableSentence,
} from './change-sentences';

const assessed = (total: number, shown = total): RevisionClassAssessment => ({
  changeClass: 'RENAMED',
  notAssessableReason: null,
  rows: Array.from({ length: shown }, (_, i) => ({
    activityId: `a${String(i)}`,
    changeClass: 'RENAMED' as const,
    code: null,
    name: `A${String(i)}`,
    from: 'old',
    to: 'new',
    orderKey: '2026-01-01',
  })),
  total,
});

describe('the change list’s sentences', () => {
  it('never says "no changes" for a class it could not assess', () => {
    // The load-bearing assertion of this whole file. An empty list and an un-looked-at list read
    // identically unless the product distinguishes them, and the reassuring reading is the false
    // one.
    for (const reason of ['NOT_SNAPSHOTTED', 'SIDE_NOT_SCHEDULED'] as const) {
      const sentence = notAssessableSentence(reason, 'RELOGICKED');
      expect(sentence.toLowerCase()).not.toContain('no changes');
      expect(sentence.toLowerCase()).toContain('cannot be compared');
    }
  });

  it('states the snapshot case as permanent for these revisions, not as a wait', () => {
    // No backfill is possible, ever. Copy that implies "check back later" would be a promise the
    // data model cannot keep.
    const sentence = notAssessableSentence('NOT_SNAPSHOTTED', 'RELOGICKED');
    expect(sentence).toContain('these two never will');
  });

  it('withholds a count entirely for an unassessed class', () => {
    const notAssessed: RevisionClassAssessment = {
      changeClass: 'RELOGICKED',
      notAssessableReason: 'NOT_SNAPSHOTTED',
      rows: [],
      total: 0,
    };
    // Not "0 activities" — a zero is a claim about the plan, and nobody counted.
    expect(classCountSentence(notAssessed)).toBeNull();
  });

  it('says "showing N of M" only when truncated, with both numbers from the server', () => {
    expect(classCountSentence(assessed(3))).toBe('3 activities.');
    expect(classCountSentence(assessed(1))).toBe('1 activity.');
    expect(classCountSentence(assessed(250, 10))).toBe('Showing 10 of 250 activities.');
  });

  it('says an assessed-but-empty class found nothing, which IS a fact about the plan', () => {
    expect(classCountSentence(assessed(0))).toBe('No changes in this revision.');
  });

  it('announces unassessed categories, not only what was found', () => {
    // A summary naming only the findings implies the rest was looked at — the inference the
    // visible copy spends its words preventing.
    const spoken = changesAnnouncement([
      assessed(2),
      { changeClass: 'RELOGICKED', notAssessableReason: 'NOT_SNAPSHOTTED', rows: [], total: 0 },
    ]);
    expect(spoken).toContain('2 changes');
    expect(spoken).toContain('1 category could not be compared');
  });

  it('the footer refuses causation in the reader’s own words', () => {
    expect(CHANGES_FOOTER).toContain('does not say which change moved the completion date');
    // And says WHY, so it reads as a property of the question rather than a missing feature.
    expect(CHANGES_FOOTER).toContain('order the edits were made in');
  });

  it('titles every class in a planner’s words rather than the enum’s', () => {
    expect(classTitle('REDURATIONED')).toBe('Duration changed');
    expect(classTitle('REPARENTED')).toBe('Moved in the breakdown');
  });
});
