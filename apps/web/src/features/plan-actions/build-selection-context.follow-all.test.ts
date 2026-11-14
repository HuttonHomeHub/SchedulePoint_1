import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { buildSelectionBarContext } from './build-selection-context';

/**
 * **Which selected bar gets the arrow on Follow logic** (ADR-0216 D6). The host says whether the window
 * offers it and which bars the whole-plan offer counts; the builder decides per bar, so the control never
 * has to ask whether it belongs. A bar the offer does not count, a lone counted bar and a tall window all
 * leave today's plain button.
 */
const row = (id: string): ActivitySummary =>
  ({ id, name: id, type: 'TASK', visualStart: '2026-02-01' }) as ActivitySummary;

function build(selectedId: string, followAll: Parameters<typeof input>[0]) {
  return buildSelectionBarContext(input(followAll, selectedId));
}

function input(
  followAll:
    | {
        ids: ReadonlySet<string>;
        shown: boolean;
        reason: string | null;
        onFollowAll: () => void;
      }
    | undefined,
  selectedId: string,
) {
  return {
    canvas: null,
    activities: [row('A'), row('B'), row('C'), row('D')],
    selectedId,
    selectionCount: 1,
    canEditSchedule: true,
    scheduleRefusal: () => null,
    canReportProgress: true,
    canWriteNotes: true,
    onOpenLogic: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    followAll,
  };
}

const offer = (over: Partial<NonNullable<Parameters<typeof input>[0]>> = {}) => ({
  ids: new Set(['A', 'B', 'C']),
  shown: true,
  reason: null,
  onFollowAll: vi.fn(),
  ...over,
});

describe('buildSelectionBarContext followAll', () => {
  it('carries the count, the reason and the write for a counted bar on a short window', () => {
    const onFollowAll = vi.fn();
    const ctx = build(
      'A',
      offer({ reason: 'Already moving these bars; wait for it to finish.', onFollowAll }),
    );
    expect(ctx?.followAll).toEqual({
      count: 3,
      reason: 'Already moving these bars; wait for it to finish.',
      onFollowAll,
    });
  });

  it('is null on a tall window', () => {
    expect(build('A', offer({ shown: false }))?.followAll).toBeNull();
  });

  it('is null for a bar the offer does not count', () => {
    expect(build('D', offer())?.followAll).toBeNull();
  });

  it('is null when only one bar is counted: the plain button already says it all', () => {
    expect(build('A', offer({ ids: new Set(['A']) }))?.followAll).toBeNull();
  });

  it('is null when the host passes nothing', () => {
    expect(build('A', undefined)?.followAll).toBeNull();
  });
});
