import { fireEvent, render, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { toActivitySummary, toGuestSwimlaneInput, type GuestActivity } from '../guest-api';

import { TsldPanel } from '@/features/tsld/components/TsldPanel';

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

/**
 * The guest share view's swimlanes, through the REAL panel (ADR-0205, swimlanes M4-T3): the server's
 * derived membership reaches the parallel listbox as the same groups a member hears, and the
 * Swimlanes checkbox in the panel's own view controls takes them away and brings them back.
 * `GuestPlanView.test.tsx` stubs the canvas; this is the seam it cannot see.
 */
const day = (n: number): string => `2026-01-${String(n).padStart(2, '0')}`;

function guestActivity(
  id: string,
  name: string,
  start: number,
  member: string | null,
  lane: number | null,
): GuestActivity {
  return {
    id,
    code: id,
    name,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 4320,
    laneIndex: 0,
    memberOfSwimlaneId: member,
    swimlaneLaneIndex: lane,
    earlyStart: day(start),
    earlyFinish: day(start + 2),
    lateStart: day(start),
    lateFinish: day(start + 2),
    totalFloat: 0,
    isCritical: false,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    visualEffectiveStart: day(start),
    visualEffectiveFinish: day(start + 2),
  };
}

const GUEST_ACTIVITIES = [
  guestActivity('a', 'Pour', 2, 's2', 0),
  guestActivity('b', 'Wire', 2, null, null),
  guestActivity('c', 'Dig', 2, 's1', 0),
];
const SWIMLANES = [
  { id: 's1', name: 'Civil' },
  { id: 's2', name: 'Mechanical' },
];

function GuestHarness({
  withSwimlanes = true,
  noneName,
}: {
  withSwimlanes?: boolean;
  noneName?: string;
}) {
  const [on, setOn] = useState(true);
  const activities = useMemo(() => GUEST_ACTIVITIES.map((a) => toActivitySummary(a, 'plan-1')), []);
  const input = useMemo(
    () => toGuestSwimlaneInput(withSwimlanes ? SWIMLANES : [], GUEST_ACTIVITIES, noneName),
    [withSwimlanes, noneName],
  );
  return (
    <TsldPanel
      activities={activities}
      dependencies={[]}
      dataDate="2026-01-01"
      canEdit={false}
      swimlanes={on ? input : null}
      {...(input ? { swimlanesToggle: { checked: on, onChange: () => setOn((v) => !v) } } : {})}
    />
  );
}

describe('the guest view’s swimlanes', () => {
  it('groups the listbox by swimlane, in the list’s order, "No swimlane" last', () => {
    const { getByRole, getAllByRole } = render(<GuestHarness />);
    const groups = getAllByRole('group').filter((g) => getByRole('listbox').contains(g));
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Civil',
      'Mechanical',
      'No swimlane',
    ]);
    expect(
      within(groups[0]!)
        .getAllByRole('option')
        .map((o) => o.textContent?.split(',')[0]),
    ).toEqual(['Dig']);
  });

  it('words the last group "No Area" when the server names it for a code-grouped plan', () => {
    const { getByRole, getAllByRole } = render(<GuestHarness noneName="No Area" />);
    const groups = getAllByRole('group').filter((g) => getByRole('listbox').contains(g));
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Civil',
      'Mechanical',
      'No Area',
    ]);
  });

  it('takes the groups away with the Swimlanes checkbox, and back again', () => {
    const { getByRole, getAllByRole, queryAllByRole } = render(<GuestHarness />);
    const grouped = (): number =>
      queryAllByRole('group').filter((g) => getByRole('listbox').contains(g)).length;
    expect(grouped()).toBe(3);

    fireEvent.click(getByRole('checkbox', { name: 'Swimlanes' }));
    expect(grouped()).toBe(0);
    expect(getAllByRole('option')).toHaveLength(GUEST_ACTIVITIES.length);

    fireEvent.click(getByRole('checkbox', { name: 'Swimlanes' }));
    expect(grouped()).toBe(3);
  });

  it('offers no checkbox and no groups for a plan without swimlanes', () => {
    const { getByRole, queryByRole, queryAllByRole } = render(
      <GuestHarness withSwimlanes={false} />,
    );
    expect(queryByRole('checkbox', { name: 'Swimlanes' })).not.toBeInTheDocument();
    expect(queryAllByRole('group').filter((g) => getByRole('listbox').contains(g))).toHaveLength(0);
  });
});
