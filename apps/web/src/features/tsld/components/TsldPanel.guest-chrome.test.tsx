import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * **A control that does nothing is not shown to a guest** (ADR-0051; walkthrough ranks 16 and 64).
 * The shortcuts sheet mounts at the workspace, which a guest never reaches, so its button opened
 * nothing; and the full key listed marks a guest's diagram cannot draw. `guestChrome` drops the
 * button and folds a narrowed key behind a Legend disclosure; unset, the panel is unchanged.
 */
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

const ACTIVITIES = [
  anActivity({
    id: 'a1',
    name: 'Piling',
    laneIndex: 0,
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-20',
  }),
];

function mount(guestChrome: boolean) {
  return render(
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={[]}
      dataDate="2026-01-01"
      todayIso="2026-01-10"
      canEdit={false}
      showConstraintKey={false}
      {...(guestChrome ? { guestChrome } : {})}
    />,
  );
}

describe('TsldPanel — the guest chrome', () => {
  it('shows no shortcuts button to a guest, and does to a member', () => {
    const guest = mount(true);
    expect(screen.queryByRole('button', { name: 'Diagram shortcuts and gestures' })).toBeNull();
    guest.unmount();
    mount(false);
    expect(
      screen.getByRole('button', { name: 'Diagram shortcuts and gestures' }),
    ).toBeInTheDocument();
  });

  it('folds the key away, and opens it narrowed to what the diagram draws', () => {
    mount(true);
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }));
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toContain('On schedule');
    expect(items).toContain('Today');
    expect(items).not.toContain('Constraint');
    expect(items).not.toContain('Over-allocated');
    expect(items).not.toContain('Milestone');
  });
});
