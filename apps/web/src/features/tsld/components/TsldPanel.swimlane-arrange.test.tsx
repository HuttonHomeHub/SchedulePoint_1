import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SwimlaneInput } from '../render/project-swimlanes';

import { WITHIN_SWIMLANES } from './ArrangeDialog';
import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **Arrange on the swimlane layout** (swimlanes M2-T6, feature-spec §4.5, SC-1).
 *
 * The panel hands the search the lanes INSIDE each swimlane and the partition, and hands the host the
 * result as in-swimlane lane placements: never a `laneIndex`, because Arrange on this layout must not
 * touch the swimlane-free arrangement, and never a swimlane, because no activity changes swimlane.
 *
 * jsdom has no `Worker`, so the search runs in-process through the same `optimiseLayout` the worker
 * calls (`e2e-arrange` is the real worker's half).
 */
vi.mock(
  '../render/run-optimise-layout',
  () => import('../render/test-support/in-process-optimise'),
);
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: true,
    TSLD_EDITING_ENABLED: true,
    CANVAS_AUTHORING_FLOW_ENABLED: true,
  };
});

const NO_DEPS: DependencySummary[] = [];

function bar(id: string, start: string, finish: string): ActivitySummary {
  return anActivity({
    id,
    code: null,
    name: id,
    laneIndex: 0,
    durationDays: 3,
    durationMinutes: 1440,
    earlyStart: start,
    earlyFinish: finish,
    visualEffectiveStart: start,
    visualEffectiveFinish: finish,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    accrualType: 'UNIFORM',
  });
}

/**
 * Mechanical holds Pour (lane 0) and Wire (lane 1, but later, so it could sit in lane 0); Electrical
 * holds Test, alone in its lane 0. Test is DRAWN on display lane 2 (after Mechanical's two) while its
 * lane inside Electrical is 0: a search that read the display lane as the lane would move it.
 */
const ACTIVITIES = [
  bar('pour', '2026-01-01', '2026-01-05'),
  bar('wire', '2026-01-08', '2026-01-11'),
  bar('test', '2026-01-01', '2026-01-04'),
];

const SWIMLANES: SwimlaneInput = {
  swimlanes: [
    { id: 's1', name: 'Mechanical' },
    { id: 's2', name: 'Electrical' },
  ],
  membership: new Map([
    ['pour', 's1'],
    ['wire', 's1'],
    ['test', 's2'],
  ]),
  storedLanes: new Map([
    ['pour', { lane: 0, updatedAt: 1 }],
    ['wire', { lane: 1, updatedAt: 1 }],
    ['test', { lane: 0, updatedAt: 1 }],
  ]),
};

function Harness({
  swimlanes,
  onAutoArrange,
}: {
  swimlanes?: SwimlaneInput;
  onAutoArrange: NonNullable<React.ComponentProps<typeof TsldPanel>['onAutoArrange']>;
}): React.ReactElement {
  return (
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit
      onCreate={() => Promise.resolve({ recalcConflict: null })}
      onAutoArrange={onAutoArrange}
      {...(swimlanes ? { swimlanes } : {})}
      fill
    />
  );
}

const OK = { applied: true, conflict: null };

function openArrange(props: React.ComponentProps<typeof Harness>): void {
  render(<Harness {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Auto-arrange lanes' }));
}

describe('TsldPanel — Arrange with swimlanes shown', () => {
  it('writes the moves as lanes inside their swimlanes, and never as a laneIndex or a swimlane', async () => {
    const onAutoArrange = vi.fn(() => Promise.resolve(OK));
    openArrange({ swimlanes: SWIMLANES, onAutoArrange });
    // Tidy has nothing to improve here; Re-layout starts from a fresh pack and finds Mechanical's
    // two bars a better arrangement of their two lanes.
    fireEvent.click(await screen.findByRole('radio', { name: 'Re-layout' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Re-layout: move/ }));

    expect(onAutoArrange).toHaveBeenCalledTimes(1);
    const [changes, placements] = onAutoArrange.mock.calls[0] as unknown as [
      { id: string; laneIndex: number }[],
      { id: string; lane: number; from: { swimlaneId: string; lane: number } }[],
    ];
    // Only Mechanical's bars move, and only between Mechanical's own lanes (0 and 1). Test is drawn
    // on display lane 2 and would be swept into the display lanes by a search that read them as lanes.
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) {
      expect(['pour', 'wire']).toContain(p.id);
      expect(p.from.swimlaneId).toBe('s1');
      expect(p.lane).toBeGreaterThanOrEqual(0);
      expect(p.lane).toBeLessThan(2);
      expect(p).not.toHaveProperty('laneIndex');
      expect(p).not.toHaveProperty('swimlaneId');
    }
    expect(changes.map((c) => [c.id, c.laneIndex])).toEqual(placements.map((p) => [p.id, p.lane]));
  });

  it('says so, and writes nothing, when the answer is already what is drawn by confirm time', async () => {
    const onAutoArrange = vi.fn(() => Promise.resolve(OK));
    const { rerender } = render(<Harness swimlanes={SWIMLANES} onAutoArrange={onAutoArrange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-arrange lanes' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Re-layout' }));
    // A colleague's change lands under the open dialog: Pour and Wire now sit exactly as Re-layout
    // would put them (it swaps their two lanes), so confirming has nothing left to write.
    rerender(
      <Harness
        onAutoArrange={onAutoArrange}
        swimlanes={{
          ...SWIMLANES,
          storedLanes: new Map([
            ['pour', { lane: 1, updatedAt: 2 }],
            ['wire', { lane: 0, updatedAt: 2 }],
            ['test', { lane: 0, updatedAt: 1 }],
          ]),
        }}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Re-layout: move/ }));
    expect(onAutoArrange).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing would move.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('says in the dialog that no activity leaves its swimlane', async () => {
    openArrange({ swimlanes: SWIMLANES, onAutoArrange: () => Promise.resolve(OK) });
    // The dialog derives the flag from the search input's `swimlanes`, so the line and the card copy
    // follow what the panel handed it.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleDescription(new RegExp(WITHIN_SWIMLANES.slice(0, 40)));
    expect(screen.getByRole('radio', { name: 'Tidy' })).not.toHaveAccessibleDescription(
      /never adds/,
    );
  });

  it('keeps the old call, with the stored lanes, when swimlanes are not shown', async () => {
    const onAutoArrange = vi.fn(() => Promise.resolve(OK));
    openArrange({ onAutoArrange });
    expect(await screen.findByRole('dialog')).not.toHaveAccessibleDescription(/swimlane/i);
    fireEvent.click(await screen.findByRole('button', { name: /^Tidy: move/ }));
    expect(onAutoArrange).toHaveBeenCalledTimes(1);
    expect((onAutoArrange.mock.calls[0] as unknown[]).length).toBe(1);
  });
});
