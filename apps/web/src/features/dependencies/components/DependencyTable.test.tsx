import type { DependencySummary } from '@repo/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DependencyTable } from './DependencyTable';

import { FieldGateProvider } from '@/components/ui/field-gate';

const DEP = {
  id: 'd1',
  planId: 'pl1',
  type: 'FS',
  lagDays: 0,
  lagMinutes: 0,
  lagCalendar: 'PROJECT_DEFAULT',
  predecessor: { id: 'a1', code: 'A10', name: 'Excavate' },
  successor: { id: 'b1', code: 'B10', name: 'Pour slab' },
  isDriving: false,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as DependencySummary;

const QUERY = { isPending: false, isError: false, data: [DEP] } as UseQueryResult<
  DependencySummary[]
>;

function renderTable(handlers: {
  onEdit: () => void;
  onRemove: () => void;
  onNudgeLag: () => void;
}) {
  return (
    <DependencyTable
      query={QUERY}
      endpoint="predecessor"
      caption="Predecessors"
      emptyLabel="None"
      {...handlers}
    />
  );
}

describe('DependencyTable row actions', () => {
  it('is inert under a shut gate: no edit, no remove, no nudge', () => {
    const handlers = { onEdit: vi.fn(), onRemove: vi.fn(), onNudgeLag: vi.fn() };
    render(
      <FieldGateProvider gate={{ writable: false, reason: 'Start editing.' }}>
        {renderTable(handlers)}
      </FieldGateProvider>,
    );
    const edit = screen.getByRole('button', { name: 'Edit link to Excavate' });
    const remove = screen.getByRole('button', { name: 'Remove link to Excavate' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(edit);
    fireEvent.click(remove);
    fireEvent.keyDown(edit, { key: 'ArrowRight', shiftKey: true });

    expect(handlers.onEdit).not.toHaveBeenCalled();
    expect(handlers.onRemove).not.toHaveBeenCalled();
    expect(handlers.onNudgeLag).not.toHaveBeenCalled();
  });

  it('is unchanged with no provider: buttons are live and the handlers fire', () => {
    const handlers = { onEdit: vi.fn(), onRemove: vi.fn(), onNudgeLag: vi.fn() };
    render(renderTable(handlers));
    const edit = screen.getByRole('button', { name: 'Edit link to Excavate' });
    const remove = screen.getByRole('button', { name: 'Remove link to Excavate' });
    expect(edit).not.toHaveAttribute('aria-disabled');
    expect(remove).not.toHaveAttribute('aria-disabled');

    fireEvent.click(edit);
    fireEvent.click(remove);
    fireEvent.keyDown(edit, { key: 'ArrowRight', shiftKey: true });

    expect(handlers.onEdit).toHaveBeenCalledWith(DEP);
    expect(handlers.onRemove).toHaveBeenCalledWith(DEP);
    expect(handlers.onNudgeLag).toHaveBeenCalledWith(DEP, 1);
  });
});
