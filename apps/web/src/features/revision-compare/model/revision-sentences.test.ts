import type { RevisionCompare, RevisionCompletion } from '@repo/types';
import { REVISION_COMPLETION_REASONS, REVISION_SETTINGS_VERDICTS } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  carrierChangedSentence,
  completionSentence,
  comparisonAnnouncement,
  settingsCaveat,
  sideLabel,
  sideTitle,
  truncationNote,
} from './revision-sentences';

const completion = (over: Partial<RevisionCompletion> = {}): RevisionCompletion => ({
  assessable: true,
  reason: null,
  carrierActivityId: 'a1',
  carrierName: 'Roof covering',
  fromFinish: '2026-03-01',
  toFinish: '2026-03-15',
  movementDays: 14,
  carrierChanged: false,
  newSideCarrierActivityId: null,
  newSideCarrierName: null,
  ...over,
});

const compare = (over: Partial<RevisionCompare> = {}): RevisionCompare => ({
  planId: 'p1',
  planName: 'Riverside',
  from: {
    kind: 'BASELINE',
    id: 'b1',
    name: 'Contract Baseline',
    computedAt: '2026-01-05T00:00:00.000Z',
    dataDate: '2026-01-01',
  },
  to: {
    kind: 'LIVE',
    id: null,
    name: null,
    computedAt: '2026-03-01T00:00:00.000Z',
    dataDate: '2026-01-01',
  },
  dayFactorMinutes: 1440,
  settingsVerdict: 'MATCH',
  completion: completion(),
  criticalPath: {
    entered: [],
    left: [],
    enteredTotal: 0,
    leftTotal: 0,
    cap: 200,
    remainedCriticalCount: 3,
    remainedNonCriticalCount: 8,
    added: [],
    removed: [],
    noCriticalPath: false,
  },
  ...over,
});

describe('the comparison prose', () => {
  /**
   * **The rule the whole epic turns on, asserted over the CLOSED SET rather than one member.**
   * A reason code reaching a screen is a tested-for defect (ADR-0116 D3), and testing one reason
   * would pass while a later member arrived with no sentence — which is exactly how a code reaches
   * a screen. The tuple is imported, so a new member fails here before it can ship.
   */
  it.each(REVISION_COMPLETION_REASONS)('renders %s as a sentence, never as the code', (reason) => {
    const text = completionSentence(completion({ assessable: false, reason }));
    expect(text).not.toContain(reason);
    expect(text).not.toMatch(/_/);
    expect(text.trim().endsWith('.')).toBe(true);
    expect(text.length).toBeGreaterThan(30);
  });

  it.each(REVISION_SETTINGS_VERDICTS)('renders the %s verdict without leaking the code', (v) => {
    const text = settingsCaveat(v);
    if (text === null) return;
    expect(text).not.toContain(v);
    expect(text.trim().endsWith('.')).toBe(true);
  });

  /**
   * **UNKNOWN is not MATCH.** The single most important assertion in this file: `isCritical` is the
   * output of a rule, so a comparison across a changed rule reports real-looking movement that did
   * not happen. Silence for UNKNOWN would be indistinguishable from silence for agreement.
   */
  it('says nothing only when the two rules MATCH', () => {
    expect(settingsCaveat('MATCH')).toBeNull();
    expect(settingsCaveat('DIFFERS')).not.toBeNull();
    expect(settingsCaveat('UNKNOWN')).not.toBeNull();
    expect(settingsCaveat('UNKNOWN')).not.toBe(settingsCaveat('DIFFERS'));
  });

  it('names the carrier in the completion sentence, because the choice is not exact', () => {
    expect(completionSentence(completion())).toContain('Roof covering');
    expect(completionSentence(completion())).toContain('14 working days later');
    expect(completionSentence(completion({ movementDays: -3 }))).toContain(
      '3 working days earlier',
    );
    expect(completionSentence(completion({ movementDays: 1 }))).toContain('1 working day later');
    expect(completionSentence(completion({ movementDays: 0 }))).toContain('no movement');
  });

  it('states an unmeasurable movement rather than reporting it as zero', () => {
    const text = completionSentence(completion({ movementDays: null }));
    expect(text).toMatch(/cannot be measured/);
    expect(text).not.toMatch(/\b0\b/);
  });

  it('reports a changed carrier as a fact and never as a cause', () => {
    const text = carrierChangedSentence(
      completion({ carrierChanged: true, newSideCarrierName: 'Commissioning' }),
    );
    expect(text).toContain('Commissioning');
    expect(text).not.toMatch(/because|caused|due to|responsible/i);
    expect(carrierChangedSentence(completion())).toBeNull();
  });

  /**
   * **"No revisions" and "no changes" must not collapse** — the ADR-0073 C1 defect, where one live
   * region said "Showing 0 events" for two different facts. Here the announcement covers the second;
   * the panel's own copy covers the first, and the two strings are asserted different.
   */
  it('announces "nothing entered or left" as its own fact', () => {
    const text = comparisonAnnouncement(compare());
    expect(text).toContain('no activity entered or left');
    expect(text).toContain('Contract Baseline');
    expect(text).toContain('Live');
  });

  it('announces the counts when there are any', () => {
    const text = comparisonAnnouncement(
      compare({
        criticalPath: { ...compare().criticalPath, enteredTotal: 4, leftTotal: 1 },
      }),
    );
    expect(text).toContain('4 entered the critical path');
    expect(text).toContain('1 left it');
  });

  it('labels the live side as live rather than leaving it blank', () => {
    expect(sideTitle(compare().to)).toBe('Live');
    expect(sideLabel(compare().to)).toBe('the plan as it stands now');
    expect(sideTitle(compare().from)).toBe('Contract Baseline');
  });

  it('states a truncation with the true total, and says nothing when there is none', () => {
    expect(truncationNote(200, 412, 200)).toBe('Showing the first 200 of 412.');
    expect(truncationNote(12, 12, 200)).toBeNull();
  });
});
