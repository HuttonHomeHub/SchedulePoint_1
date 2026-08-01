import { WorkingWeekdays } from '@repo/types';
import type { CalendarSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { groupCalendarsByTier } from '@/lib/calendar-tiers';

function calendar(id: string, scope: CalendarSummary['scope']): CalendarSummary {
  return {
    id,
    name: id,
    description: null,
    workingWeekdays: 31,
    shifts: WorkingWeekdays.toFullDayShifts(31),
    scope,
    projectId: scope === 'PROJECT' ? 'proj-1' : null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('groupCalendarsByTier', () => {
  it('splits a project-usable list into its organisation and project tiers', () => {
    const groups = groupCalendarsByTier([
      calendar('org-a', 'ORG'),
      calendar('proj-a', 'PROJECT'),
      calendar('org-b', 'ORG'),
    ]);

    expect(groups.org.map((c) => c.id)).toEqual(['org-a', 'org-b']);
    expect(groups.project.map((c) => c.id)).toEqual(['proj-a']);
  });

  it('preserves the server’s order within each tier', () => {
    const groups = groupCalendarsByTier([
      calendar('proj-z', 'PROJECT'),
      calendar('proj-a', 'PROJECT'),
    ]);

    expect(groups.project.map((c) => c.id)).toEqual(['proj-z', 'proj-a']);
  });

  it('returns empty tiers for an empty list', () => {
    expect(groupCalendarsByTier([])).toEqual({ org: [], project: [] });
  });
});
