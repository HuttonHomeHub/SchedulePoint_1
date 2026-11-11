import { describe, expect, it } from 'vitest';

import { classifyHit } from './hit-test';
import { activityRect, LANE_HEIGHT, type RenderActivity } from './render-model';

const VIEW = { pxPerDay: 20, originX: 0, originY: 0 };
const DATA_DATE = '2026-01-05';

const activity = (
  id: string,
  type: RenderActivity['type'],
  span: [string, string],
): RenderActivity => ({
  id,
  type,
  laneIndex: 0,
  label: id,
  drawnStart: span[0],
  drawnFinish: span[1],
  isCritical: false,
  isNearCritical: false,
});

describe('classifyHit end zones without the resize vocabulary', () => {
  const y = LANE_HEIGHT / 2;

  it('classifies every point of a milestone as an end handle, never body', () => {
    // The fact the two-click link and LOE tools rest on (they read the zone back as the activity):
    // the milestone's rect is 2 * MILESTONE_RADIUS wide, narrower than two end zones.
    const milestone = activity('m', 'FINISH_MILESTONE', ['2026-01-09', '2026-01-09']);
    const rect = activityRect(milestone, VIEW, DATA_DATE)!;
    expect(rect.w).toBeLessThan(16);
    const kinds = new Set(
      [1, rect.w / 4, rect.w / 2, (3 * rect.w) / 4, rect.w - 1].map(
        (dx) => classifyHit([milestone], { x: rect.x + dx, y }, VIEW, DATA_DATE).kind,
      ),
    );
    expect([...kinds].sort()).toEqual(['finishHandle', 'startHandle']);
  });

  it('keeps the middle of a wide bar as body', () => {
    const bar = activity('t', 'TASK', ['2026-01-05', '2026-01-09']);
    const hit = classifyHit([bar], { x: 50, y }, VIEW, DATA_DATE);
    expect(hit).toEqual({ kind: 'body', id: 't' });
  });
});
