import { describe, expect, it } from 'vitest';

import type { ClonePlan } from './clone-graph';
import { bandCopyConfirmation } from './confirm-copy';

/**
 * The band-copy confirmation (`docs/specs/activity-copy-paste/` M2-T2).
 *
 * The load-bearing assertion is that the counts come **off the plan**. A confirmation that counts
 * the selection independently would drift from what is written the moment the two disagreed, and it
 * would drift quietly — the planner reads a number, presses the button, and gets a different one.
 * These tests build the plan and check the sentence follows it, rather than checking the sentence
 * against a number the test also invented.
 */
function plan(creates: number, links: number): ClonePlan {
  return {
    ok: true,
    creates: Array.from({ length: creates }, (_, i) => ({
      sourceId: `s${String(i)}`,
      sourceName: `S${String(i)}`,
      parentSourceId: null,
      body: {} as ClonePlan['creates'][number]['body'],
    })),
    links: Array.from({ length: links }, (_, i) => ({
      predecessorSourceId: `s${String(i)}`,
      successorSourceId: `s${String(i + 1)}`,
      type: 'FS' as const,
      lagMinutes: 0,
      lagCalendar: 'PROJECT_DEFAULT' as const,
    })),
  };
}

describe('bandCopyConfirmation', () => {
  it('counts the band CONTENTS, not the create list — the summary is not one of its own members', () => {
    // 15 creates = the summary + 14 activities in it. Reporting 15 would overstate the band by one
    // on every band in the product, which is the kind of wrong that looks plausible forever.
    const { description } = bandCopyConfirmation('Level 2', plan(15, 21));
    expect(description).toContain('the 14 activities in it');
    expect(description).toContain('the 21 links between them');
  });

  it('names the summary in both the question and the sentence', () => {
    const { title, description } = bandCopyConfirmation('Level 2', plan(3, 1));
    expect(title).toContain('Level 2');
    expect(description).toContain('Level 2');
  });

  it('says a band is empty rather than claiming it copies 0 activities', () => {
    const { description } = bandCopyConfirmation('Empty phase', plan(1, 0));
    expect(description).toContain('which is empty');
    expect(description).not.toContain('0 activities');
  });

  it('omits the links clause entirely when there are none', () => {
    const { description } = bandCopyConfirmation('Level 2', plan(4, 0));
    expect(description).not.toContain('link');
  });

  it('is singular at one', () => {
    const { description } = bandCopyConfirmation('Level 2', plan(2, 1));
    expect(description).toContain('the 1 activity in it');
    expect(description).toContain('the 1 link between them');
  });

  it('names what is NOT copied, individually', () => {
    // "Some fields are not copied" is unactionable. A planner needs to know which, before the write.
    const { description } = bandCopyConfirmation('Level 2', plan(5, 2));
    for (const omitted of ['Progress', 'notes']) {
      expect(description).toContain(omitted);
    }
  });

  it('says assignments and steps ARE copied, because since M4 they are', () => {
    // The sentence listed them as omissions until the carriage landed. A confirmation that
    // describes the previous behaviour is worse than none: it is the one screen whose whole job is
    // to say what is about to happen, and a planner who reads it will not check.
    const { description } = bandCopyConfirmation('Level 2', plan(5, 2));
    expect(description).toContain('resource assignments');
    expect(description).toContain('weighted steps');
    expect(description).not.toMatch(/resource assignments[^.]*are not copied/);
  });
});
