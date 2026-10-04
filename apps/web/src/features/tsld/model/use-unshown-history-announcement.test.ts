import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { resolveDockStrip, type DockStripInput } from './dock-strip';
import { useUnshownHistoryAnnouncement } from './use-unshown-history-announcement';

const base: DockStripInput = {
  hasConflict: false,
  modeStatement: null,
  showDiagram: true,
  activityCount: 3,
  mode: 'select',
  authoringFlowEnabled: true,
  hasPlacementMigrationNotice: false,
  hasArrangeOffer: false,
  hasLayoutResolvedNotice: false,
  historyResult: 'failure',
};
const failure = { id: 1, kind: 'failure' as const, message: 'Couldn’t undo just now.' };

describe('useUnshownHistoryAnnouncement', () => {
  it('speaks a failure when a conflict banner outranks the history strip', () => {
    const announce = vi.fn();
    const dockStrip = resolveDockStrip({ ...base, hasConflict: true });
    expect(dockStrip).toBe('conflict');
    const { rerender } = renderHook(() =>
      useUnshownHistoryAnnouncement(failure, dockStrip, announce),
    );
    rerender();
    expect(announce).toHaveBeenCalledExactlyOnceWith('Couldn’t undo just now.');
  });

  it('stays silent when the strip is showing — its role="alert" is the one voice', () => {
    const announce = vi.fn();
    renderHook(() => useUnshownHistoryAnnouncement(failure, resolveDockStrip(base), announce));
    expect(announce).not.toHaveBeenCalled();
  });

  it('never speaks a success, which the workspace already announced', () => {
    const announce = vi.fn();
    renderHook(() =>
      useUnshownHistoryAnnouncement({ ...failure, kind: 'success' }, 'conflict', announce),
    );
    expect(announce).not.toHaveBeenCalled();
  });
});
