import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const announce = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

import { TsldPanel, type TsldBulkOperations } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **The Delete key** (ADR-0218 D3, `docs/specs/diagram-keys-and-selection/` M2).
 *
 * Delete and Backspace on the diagram's list open the confirmation the Delete button opens, through
 * the button's own path, and are refused aloud with the button's own reason. They exist only on the
 * list, so a key typed into any other field is that field's.
 */
function activity(id: string, name: string, laneIndex: number): ActivitySummary {
  return anActivity({
    id,
    code: null,
    name,
    durationDays: 3,
    durationMinutes: 1440,
    laneIndex,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    accrualType: 'UNIFORM',
  });
}
const ACTIVITIES = [activity('a', 'Excavate', 0), activity('b', 'Pour', 1)];
const NO_DEPS: DependencySummary[] = [];

function mount(over: { canEdit?: boolean; bulk?: Partial<TsldBulkOperations> | null } = {}) {
  const onDeleteActivity = vi.fn();
  const deleteMany = vi.fn(() => Promise.resolve());
  const bulk: TsldBulkOperations | undefined =
    over.bulk === null
      ? undefined
      : {
          gate: { writable: true, reason: null },
          deleteMany,
          linkChain: vi.fn(() => Promise.resolve()),
          moveMany: vi.fn(() => Promise.resolve({ applied: true, conflict: null })),
          ...over.bulk,
        };
  render(
    <>
      <input aria-label="elsewhere" />
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit={over.canEdit ?? true}
        scheduleRefusal={(action) => `Start editing to ${action}.`}
        onOpenLogic={vi.fn()}
        onEditActivity={vi.fn()}
        onDeleteActivity={onDeleteActivity}
        {...(bulk ? { bulk } : {})}
        fill
      />
    </>,
  );
  const list = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  act(() => list.focus());
  return { list, onDeleteActivity, deleteMany };
}

beforeEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
  announce.mockClear();
});

describe('TsldPanel — the Delete key', () => {
  it.each(['Delete', 'Backspace'])(
    '%s on one selected activity opens the single confirmation',
    (key) => {
      const { list, onDeleteActivity } = mount();
      fireEvent.keyDown(list, { key });
      expect(onDeleteActivity).toHaveBeenCalledTimes(1);
      expect(onDeleteActivity).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    },
  );

  it('claims the key, so Backspace never navigates the page back', () => {
    const { list } = mount();
    expect(fireEvent.keyDown(list, { key: 'Backspace' })).toBe(false);
  });

  it.each(['Delete', 'Backspace'])(
    '%s on two selected opens the plural confirmation, deleting nothing yet',
    (key) => {
      const { list, deleteMany } = mount();
      fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
      fireEvent.keyDown(list, { key });
      expect(screen.getByRole('alertdialog', { name: 'Delete 2 activities?' })).toBeInTheDocument();
      expect(deleteMany).not.toHaveBeenCalled();
    },
  );

  it('refuses a single delete aloud, with the button’s reason, when the pen is not held', () => {
    const { list, onDeleteActivity } = mount({ canEdit: false });
    fireEvent.keyDown(list, { key: 'Delete' });
    expect(onDeleteActivity).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Start editing to change this activity.');
  });

  it('refuses a plural delete aloud with the bar’s reason, and opens nothing', () => {
    const { list } = mount({
      bulk: { gate: { writable: false, reason: 'Take the pen to edit this plan.' } },
    });
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    announce.mockClear();
    fireEvent.keyDown(list, { key: 'Delete' });
    expect(announce).toHaveBeenCalledWith('Take the pen to edit this plan.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('says so when nothing is selected, rather than doing nothing silently', () => {
    const { list, onDeleteActivity } = mount();
    fireEvent.keyDown(list, { key: 'Escape' });
    announce.mockClear();
    fireEvent.keyDown(list, { key: 'Delete' });
    expect(onDeleteActivity).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Nothing is selected to delete.');
  });

  it('does nothing from a field: the key is the field’s', () => {
    const { onDeleteActivity } = mount();
    const field = screen.getByLabelText('elsewhere');
    field.focus();
    expect(fireEvent.keyDown(field, { key: 'Backspace' })).toBe(true);
    fireEvent.keyDown(field, { key: 'Delete' });
    expect(onDeleteActivity).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('acts once for a held key: a repeat neither re-announces a refusal nor re-opens anything', () => {
    const refused = mount({ canEdit: false });
    fireEvent.keyDown(refused.list, { key: 'Delete' });
    fireEvent.keyDown(refused.list, { key: 'Delete', repeat: true });
    fireEvent.keyDown(refused.list, { key: 'Delete', repeat: true });
    expect(
      announce.mock.calls.filter(([text]) => /change this activity/.test(String(text))),
    ).toHaveLength(1);
  });

  it('still claims a repeat, so Backspace held never navigates back', () => {
    const { list, onDeleteActivity } = mount();
    expect(fireEvent.keyDown(list, { key: 'Backspace', repeat: true })).toBe(false);
    expect(onDeleteActivity).not.toHaveBeenCalled();
  });

  it('leaves the key unclaimed when nothing is wired to answer it', () => {
    const { list } = mount({ bulk: null });
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(fireEvent.keyDown(list, { key: 'Backspace' })).toBe(true);
  });

  it('leaves a modified press alone', () => {
    const { list, onDeleteActivity } = mount();
    fireEvent.keyDown(list, { key: 'Backspace', ctrlKey: true });
    fireEvent.keyDown(list, { key: 'Delete', shiftKey: true });
    expect(onDeleteActivity).not.toHaveBeenCalled();
  });

  it('does nothing for two selected when the host wired no bulk operations', () => {
    const { list, onDeleteActivity } = mount({ bulk: null });
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(list, { key: 'Delete' });
    expect(onDeleteActivity).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
