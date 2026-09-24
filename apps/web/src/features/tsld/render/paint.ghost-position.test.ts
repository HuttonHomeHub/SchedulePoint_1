import type { ActivityType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { activityRect, type RenderActivity, type Viewport } from './geometry';
import { ghostGeometry } from './paint';

/**
 * **A ghost sits where its live bar sits when the dates agree** (#383).
 *
 * The baseline, compare and levelled layers centred a milestone on the MIDDLE of its dated day,
 * while the live diamond sits on a day boundary — the start of its day, or its END for a finish
 * milestone (ADR-0155). So an unmoved milestone's ghost was drawn half a day from the diamond it
 * describes, and every existing ghost test passed: they asserted a diamond was drawn, never where.
 *
 * The oracle is `activityRect`, the live bar's own geometry, not a restatement of its arithmetic.
 */
const VIEW: Viewport = { pxPerDay: 24, originX: 40, originY: 0 };
const DATA_DATE = '2026-01-05';

function live(type: ActivityType, start: string, finish: string): RenderActivity {
  return {
    id: 'a',
    type,
    laneIndex: 0,
    label: 'A',
    earlyStart: start,
    earlyFinish: finish,
    isCritical: false,
    isNearCritical: false,
  };
}

describe('ghostGeometry places a ghost by the live bar rule (#383)', () => {
  it.each<ActivityType>(['START_MILESTONE', 'FINISH_MILESTONE'])(
    '%s: an unmoved ghost diamond is centred on the live diamond',
    (type) => {
      const rect = activityRect(live(type, '2026-01-09', '2026-01-09'), VIEW, DATA_DATE)!;
      const g = ghostGeometry(type, DATA_DATE, '2026-01-09', '2026-01-09', VIEW);
      expect(g).toEqual({ milestone: true, cx: rect.x + rect.w / 2 });
    },
  );

  it('a finish milestone ghost sits a whole day right of a start milestone ghost on the same date', () => {
    const start = ghostGeometry('START_MILESTONE', DATA_DATE, '2026-01-09', '2026-01-09', VIEW);
    const finish = ghostGeometry('FINISH_MILESTONE', DATA_DATE, '2026-01-09', '2026-01-09', VIEW);
    if (!start.milestone || !finish.milestone) throw new Error('expected milestones');
    expect(finish.cx - start.cx).toBe(VIEW.pxPerDay);
  });

  it('a task ghost spans exactly the live bar', () => {
    const rect = activityRect(live('TASK', '2026-01-06', '2026-01-08'), VIEW, DATA_DATE)!;
    const g = ghostGeometry('TASK', DATA_DATE, '2026-01-06', '2026-01-08', VIEW);
    expect(g).toEqual({ milestone: false, x1: rect.x, x2: rect.x + rect.w });
  });
});
