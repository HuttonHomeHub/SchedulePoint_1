import { describe, expect, it } from 'vitest';

import { selectedActivityFacts } from './selected-activity-facts';

import { anActivity } from '@/test/activity-fixture';

const SCHEDULED = {
  code: 'A1020',
  name: 'Pour slab',
  earlyStart: '2026-03-02',
  earlyFinish: '2026-03-13',
  visualEffectiveStart: '2026-03-03',
  visualEffectiveFinish: '2026-03-14',
  lateStart: '2026-03-09',
  lateFinish: '2026-03-20',
  totalFloat: 4,
  isCritical: false,
  isNearCritical: false,
  percentComplete: 40,
  status: 'IN_PROGRESS' as const,
};

const labels = (r: ReturnType<typeof selectedActivityFacts>) => r.facts.map((f) => f.label);

describe('selectedActivityFacts', () => {
  it('lists the drawn dates, total float, progress and status, in that order', () => {
    const r = selectedActivityFacts(anActivity(SCHEDULED), 'visual');
    expect(r.subject).toBe('Pour slab, A1020');
    expect(r.scheduled).toBe(true);
    expect(r.facts).toEqual([
      { label: 'Start', value: '03 Mar 2026' },
      { label: 'Finish', value: '14 Mar 2026' },
      { label: 'Total float', value: '4 d' },
      { label: 'Progress', value: '40%' },
      { label: 'Status', value: 'In progress' },
    ]);
  });

  it('reads the drawn span, not the network early dates', () => {
    const r = selectedActivityFacts(anActivity(SCHEDULED), 'visual');
    expect(r.facts[0]?.value).not.toBe('2 Mar 2026');
  });

  it('honours the basis it is given (late)', () => {
    const r = selectedActivityFacts(anActivity(SCHEDULED), 'late');
    expect(r.facts.slice(0, 2).map((f) => f.value)).toEqual(['09 Mar 2026', '20 Mar 2026']);
  });

  it('puts the criticality rung beside the float', () => {
    const critical = selectedActivityFacts(
      anActivity({ ...SCHEDULED, totalFloat: 0, isCritical: true }),
      'visual',
    );
    expect(critical.facts.find((f) => f.label === 'Total float')).toEqual({
      label: 'Total float',
      value: '0 d',
      note: 'Critical',
    });
    const near = selectedActivityFacts(
      anActivity({ ...SCHEDULED, totalFloat: 2, isNearCritical: true }),
      'visual',
    );
    expect(near.facts.find((f) => f.label === 'Total float')?.note).toBe('Near-critical');
  });

  it('gives one "Date" for a milestone', () => {
    const r = selectedActivityFacts(
      anActivity({
        ...SCHEDULED,
        type: 'FINISH_MILESTONE',
        visualEffectiveStart: '2026-03-14',
        visualEffectiveFinish: '2026-03-14',
      }),
      'visual',
    );
    expect(labels(r).slice(0, 2)).toEqual(['Date', 'Total float']);
    expect(r.facts[0]?.value).toBe('14 Mar 2026');
  });

  it('omits the float for a WBS summary', () => {
    const r = selectedActivityFacts(
      anActivity({ ...SCHEDULED, type: 'WBS_SUMMARY', totalFloat: 0, isCritical: true }),
      'visual',
    );
    expect(labels(r)).toEqual(['Start', 'Finish', 'Progress', 'Status']);
  });

  it('omits the float when it is null', () => {
    const r = selectedActivityFacts(anActivity({ ...SCHEDULED, totalFloat: null }), 'visual');
    expect(labels(r)).not.toContain('Total float');
  });

  it('keeps a negative float with a real minus sign', () => {
    const r = selectedActivityFacts(
      anActivity({ ...SCHEDULED, totalFloat: -2, isCritical: true }),
      'visual',
    );
    expect(r.facts.find((f) => f.label === 'Total float')?.value).toBe('−2 d');
  });

  it('gives no dates or float when the drawn start is null, but still gives progress and status', () => {
    const r = selectedActivityFacts(
      anActivity({
        ...SCHEDULED,
        earlyStart: null,
        earlyFinish: null,
        visualEffectiveStart: null,
        visualEffectiveFinish: null,
      }),
      'visual',
    );
    expect(r.subject).toBe('Pour slab, A1020');
    expect(r.scheduled).toBe(false);
    expect(labels(r)).toEqual(['Progress', 'Status']);
  });

  it('labels each status in the shared vocabulary', () => {
    const status = (s: 'NOT_STARTED' | 'COMPLETE') =>
      selectedActivityFacts(anActivity({ ...SCHEDULED, status: s }), 'visual').facts.at(-1)?.value;
    expect(status('NOT_STARTED')).toBe('Not started');
    expect(status('COMPLETE')).toBe('Complete');
  });

  it('leads the subject with the code while codes are shown', () => {
    expect(selectedActivityFacts(anActivity(SCHEDULED), 'visual', true).subject).toBe(
      'A1020 Pour slab',
    );
  });
});
