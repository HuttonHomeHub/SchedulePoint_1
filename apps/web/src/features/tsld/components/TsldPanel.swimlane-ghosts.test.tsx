import type { ActivitySummary } from '@repo/types';
import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Where the panel puts its ghosts while swimlanes are shown (swimlanes M2-T8, ADR-0126/0127): at the
 * bar's DISPLAY lane, so a ghost sits in the same row as the bar it describes. The canvas is replaced
 * by a recorder, because the subject is what the panel hands it; the derivation under it is real.
 */
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_LENSES_ENABLED: true };
});
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('./TsldCanvas', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    TsldCanvas: (props: Record<string, unknown>) => {
      seen.props.push(props);
      return null;
    },
  };
});

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

import type { SwimlaneInput } from '@/features/tsld/render/project-swimlanes';
import { anActivity } from '@/test/activity-fixture';

beforeEach(() => {
  seen.props.length = 0;
});

// Both stored on lane 0, in different swimlanes: their display lanes differ (0 and 1), their stored
// lanes do not, so a ghost read from the stored lane is in the wrong row for `b`.
const ACTIVITIES: ActivitySummary[] = [
  anActivity({
    id: 'a',
    laneIndex: 0,
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-09',
    visualEffectiveStart: '2026-01-02',
    leveledStart: '2026-01-05',
    leveledFinish: '2026-01-12',
  }),
  anActivity({
    id: 'b',
    laneIndex: 0,
    earlyStart: '2026-01-03',
    earlyFinish: '2026-01-10',
    visualEffectiveStart: '2026-01-03',
    leveledStart: '2026-01-06',
    leveledFinish: '2026-01-13',
  }),
];
const INPUT: SwimlaneInput = {
  swimlanes: [
    { id: 's1', name: 'Mechanical' },
    { id: 's2', name: 'Electrical' },
  ],
  membership: new Map([
    ['a', 's1'],
    ['b', 's2'],
  ]),
  storedLanes: new Map(),
};
const VARIANCE = ['a', 'b'].map((activityId) => ({
  activityId,
  code: null,
  name: activityId,
  inBaseline: true,
  removed: false,
  currentStart: '2026-01-06',
  currentFinish: '2026-01-10',
  currentTotalFloat: 0,
  baselineStart: '2026-01-01',
  baselineFinish: '2026-01-05',
  baselineTotalFloat: 0,
  startVarianceDays: 5,
  finishVarianceDays: 5,
  floatVarianceDays: 0,
}));

function Harness({ swimlanes }: { swimlanes: SwimlaneInput | null }) {
  const ui = useTsldCanvasUiState();
  useEffect(() => {
    ui.toggleBaselineOverlay();
    ui.toggleLevelledOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arms the fixture once on mount
  }, []);
  return (
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={[]}
      dataDate="2026-01-01"
      canvasUi={ui}
      varianceRows={VARIANCE}
      swimlanes={swimlanes}
    />
  );
}

function lastLanes(key: 'baselineGhosts' | 'levelledGhosts'): Record<string, number> {
  const last = seen.props[seen.props.length - 1]!;
  const ghosts = (last[key] ?? []) as { id: string; laneIndex: number }[];
  return Object.fromEntries(ghosts.map((g) => [g.id, g.laneIndex]));
}

describe('TsldPanel — ghosts follow the bar into its swimlane row', () => {
  it('draws baseline and levelled ghosts at the display lane while swimlanes are shown', () => {
    render(<Harness swimlanes={INPUT} />);
    expect(lastLanes('baselineGhosts')).toEqual({ a: 0, b: 1 });
    expect(lastLanes('levelledGhosts')).toEqual({ a: 0, b: 1 });
  });

  it('leaves them at the stored lane with no swimlane input (off-path parity)', () => {
    render(<Harness swimlanes={null} />);
    expect(lastLanes('baselineGhosts')).toEqual({ a: 0, b: 0 });
    expect(lastLanes('levelledGhosts')).toEqual({ a: 0, b: 0 });
  });
});
