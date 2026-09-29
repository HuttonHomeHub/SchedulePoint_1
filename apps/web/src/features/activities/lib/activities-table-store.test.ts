import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { createActivitiesTableStore } from './activities-table-store';

const ACTIVITY = { id: 'a1', name: 'Pour slab' } as ActivitySummary;

describe('createActivitiesTableStore', () => {
  it('starts empty', () => {
    const store = createActivitiesTableStore();

    expect(store.getState().selectedIds.size).toBe(0);
    expect(store.getState().menu).toBeNull();
  });

  it('toggles a row on and off, replacing the set so a snapshot compare sees the change', () => {
    const store = createActivitiesTableStore();
    const before = store.getState();

    store.toggleRow('a1');
    expect(store.getState().selectedIds.has('a1')).toBe(true);
    expect(store.getState()).not.toBe(before);
    expect(before.selectedIds.size).toBe(0);

    store.toggleRow('a1');
    expect(store.getState().selectedIds.has('a1')).toBe(false);
  });

  it('sets and clears the whole selection', () => {
    const store = createActivitiesTableStore();

    store.setSelectedIds(new Set(['a1', 'a2']));
    expect([...store.getState().selectedIds]).toEqual(['a1', 'a2']);

    store.clearSelection();
    expect(store.getState().selectedIds.size).toBe(0);
  });

  it('opens and closes the menu without touching the selection', () => {
    const store = createActivitiesTableStore();
    store.toggleRow('a2');

    store.setMenu({ activity: ACTIVITY, anchor: { x: 1, y: 2 } });
    expect(store.getState().menu?.activity.id).toBe('a1');
    expect(store.getState().selectedIds.has('a2')).toBe(true);

    store.setMenu(null);
    expect(store.getState().menu).toBeNull();
    expect(store.getState().selectedIds.has('a2')).toBe(true);
  });

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const store = createActivitiesTableStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.toggleRow('a1');
    store.setMenu(null);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.clearSelection();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('shares nothing between two instances', () => {
    const one = createActivitiesTableStore();
    const two = createActivitiesTableStore();
    const listenerTwo = vi.fn();
    two.subscribe(listenerTwo);

    one.toggleRow('a1');
    one.setMenu({ activity: ACTIVITY, anchor: { x: 0, y: 0 } });

    expect(two.getState().selectedIds.size).toBe(0);
    expect(two.getState().menu).toBeNull();
    expect(listenerTwo).not.toHaveBeenCalled();
  });
});
