import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { legendDrawnFor, TsldLegend, type LegendDrawnInput } from './TsldLegend';

/**
 * **A key that names a mark the diagram is not drawing is the ADR-0151 M6 defect**, and the guest
 * share view is where it showed: a constraint-free, baseline-free, resource-free diagram wore the
 * whole 24-entry key (ADR-0127 — an overlay draws what it knows). `drawn` narrows the key to the
 * marks the painter would put on this diagram; absent, the key is whole.
 */
const task = (over: Partial<LegendDrawnInput['activities'][number]> = {}) => ({
  type: 'TASK',
  isCritical: false,
  isNearCritical: false,
  ...over,
});

const base: Omit<LegendDrawnInput, 'activities' | 'dependencies'> = {
  nonWorking: false,
  dataDate: false,
  today: false,
  window: false,
  overAllocation: false,
};

function keyed(input: Partial<LegendDrawnInput>): string[] {
  const drawn = legendDrawnFor({ activities: [], dependencies: [], ...base, ...input });
  render(<TsldLegend withoutConstraint drawn={drawn} />);
  return within(screen.getByRole('list', { name: 'Legend' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent ?? '');
}

describe('TsldLegend — drawn narrows the key to the diagram', () => {
  // `isDrawn` keys a few rows on their label ('Non-working', the link rungs), and its last line
  // returns true. A new default row with no branch would fall through to "always drawn" and appear on
  // a diagram that cannot draw it; against an empty diagram every default row must be withheld.
  it('withholds every default row from a diagram that draws nothing', () => {
    const drawn = legendDrawnFor({ activities: [], dependencies: [], ...base });
    render(<TsldLegend withoutConstraint drawn={drawn} />);
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });

  it('keys one on-schedule task and nothing else', () => {
    expect(keyed({ activities: [task()] })).toEqual(['On schedule']);
  });

  it('keys each class only when an activity of it exists', () => {
    expect(
      keyed({ activities: [task({ isCritical: true }), task({ isNearCritical: true })] }),
    ).toEqual(['Critical', 'Near-critical']);
  });

  it('keys milestones, summaries, effort spans and progress by what the plan holds', () => {
    const labels = keyed({
      activities: [
        task({ type: 'FINISH_MILESTONE' }),
        task({ type: 'WBS_SUMMARY' }),
        task({ type: 'LEVEL_OF_EFFORT', percentComplete: 40 }),
      ],
    });
    expect(labels).toEqual(
      expect.arrayContaining(['Milestone', 'WBS summary', 'Level of effort', 'Progress']),
    );
    // A guest has no constraints (ADR-0051 §4), so the constrained milestone is never keyed.
    expect(labels).not.toContain('Constrained milestone');
  });

  it('keys the link marks from the dependencies, and the lag marks only for a lagged one', () => {
    const plain = keyed({
      activities: [task()],
      dependencies: [{ isDriving: true, lagMinutes: 0 }],
    });
    expect(plain).toEqual(
      expect.arrayContaining(['Driving link', 'Direction', expect.stringContaining('Gap in')]),
    );
    expect(plain.join('|')).not.toContain('Lag on a link');
    expect(plain).not.toContain('Non-driving link');
  });

  it('keys the lag marks and the non-driving link when the plan has them', () => {
    const labels = keyed({
      activities: [task()],
      dependencies: [{ isDriving: false, lagMinutes: 480 }],
    });
    expect(labels).toEqual(
      expect.arrayContaining([
        'Non-driving link',
        expect.stringContaining('Lag on a link'),
        'Link joins partway along',
        'Lag run (on the bar)',
      ]),
    );
  });

  it('keys Today, Data date and Non-working only while the diagram draws them', () => {
    expect(keyed({ activities: [task()], today: true, dataDate: true, nonWorking: true })).toEqual(
      expect.arrayContaining(['Today', 'Data date', 'Non-working']),
    );
  });

  it('never keys the over-allocation badge on a surface with no resources', () => {
    expect(keyed({ activities: [task()] })).not.toContain('Over-allocated');
  });

  it('leaves the key whole when no `drawn` is given', () => {
    render(<TsldLegend />);
    const items = within(screen.getByRole('list', { name: 'Legend' })).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(20);
  });
});
