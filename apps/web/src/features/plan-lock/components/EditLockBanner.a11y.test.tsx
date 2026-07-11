import type { PlanEditLockActor, PlanEditLockStatus } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { PlanPen } from '../api/use-plan-edit-lock';

import { EditLockBanner } from './EditLockBanner';

const JANE: PlanEditLockActor = { id: 'user-jane', name: 'Jane Doe', email: 'jane@x.com' };

function status(overrides: Partial<PlanEditLockStatus>): PlanEditLockStatus {
  return {
    planId: 'p1',
    state: 'FREE',
    holder: null,
    expiresAt: null,
    heartbeatAt: null,
    requestedBy: null,
    graceEndsAt: null,
    canAcquire: false,
    canRequest: false,
    canTakeOver: false,
    canOverride: false,
    ...overrides,
  };
}

function makePen(s: PlanEditLockStatus | undefined, extra: Partial<PlanPen> = {}): PlanPen {
  return {
    penManaged: true,
    status: s,
    holdsPen: s?.state === 'HELD_BY_ME',
    isPending: false,
    lostControl: null,
    dismissLost: vi.fn(),
    startEditing: vi.fn(),
    stopEditing: vi.fn(),
    requestControl: vi.fn(),
    handoff: vi.fn(),
    takeOver: vi.fn(),
    onWriteRejected: vi.fn(() => ({ kind: 'passthrough' as const })),
    ...extra,
  };
}

describe('EditLockBanner — axe (no WCAG violations)', () => {
  it('free (Start editing)', async () => {
    const { container } = render(
      <EditLockBanner pen={makePen(status({ state: 'FREE', canAcquire: true }))} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('holding (Stop editing)', async () => {
    const { container } = render(
      <EditLockBanner pen={makePen(status({ state: 'HELD_BY_ME', holder: JANE }))} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('held by another with take-over', async () => {
    const { container } = render(
      <EditLockBanner
        pen={makePen(
          status({ state: 'HELD_BY_OTHER', holder: JANE, canRequest: true, canTakeOver: true }),
        )}
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('lost control', async () => {
    const { container } = render(
      <EditLockBanner
        pen={makePen(status({ state: 'HELD_BY_OTHER', holder: JANE }), {
          lostControl: 'PLAN_EDIT_LOCK_LOST',
        })}
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('holding with an incoming request (Hand over / Keep)', async () => {
    const { container } = render(
      <EditLockBanner pen={makePen(status({ state: 'HELD_BY_ME', requestedBy: JANE }))} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('waiting for hand-over (disabled take-over + aria-hidden countdown)', async () => {
    const { container } = render(
      <EditLockBanner
        pen={makePen(
          status({
            state: 'HELD_BY_OTHER',
            holder: JANE,
            canRequest: true,
            requestedBy: { id: 'me', name: 'Me', email: 'me@x.com' },
            graceEndsAt: new Date(Date.now() + 30_000).toISOString(),
          }),
        )}
        currentUserId="me"
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('admin override — the open confirm dialog', async () => {
    const { container } = render(
      <EditLockBanner
        pen={makePen(
          status({
            state: 'HELD_BY_OTHER',
            holder: JANE,
            canRequest: true,
            canTakeOver: true,
            canOverride: true,
          }),
        )}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('read-only for a Viewer while another edits', async () => {
    const { container } = render(
      <EditLockBanner pen={makePen(status({ state: 'HELD_BY_OTHER', holder: JANE }))} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
