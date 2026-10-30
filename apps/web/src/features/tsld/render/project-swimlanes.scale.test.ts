import { describe, expect, it } from 'vitest';

import { projectSwimlanes, type SwimlaneInput } from './project-swimlanes';

import { anActivity } from '@/test/activity-fixture';

const DATA_DATE = '2026-01-01';
const ACTIVITIES = 5000;
const RUNS = 9;

/** 5,000 activities spread over `bands` swimlanes, each activity a short bar, the members of one band following one another, so a band is one lane and the stack is as many lanes as bands. */
function scene(bands: number): {
  input: SwimlaneInput;
  activities: ReturnType<typeof anActivity>[];
} {
  const swimlanes = Array.from({ length: bands }, (_, i) => ({
    id: `b${String(i)}`,
    name: `Band ${String(i)}`,
  }));
  const membership = new Map<string, string | null>();
  const activities = Array.from({ length: ACTIVITIES }, (_, i) => {
    const id = `a${String(i)}`;
    membership.set(id, `b${String(i % bands)}`);
    const start = (Math.floor(i / bands) * 4) % 300;
    return anActivity({
      id,
      laneIndex: 0,
      visualEffectiveStart: new Date(Date.UTC(2026, 0, 1 + start)).toISOString().slice(0, 10),
      visualEffectiveFinish: new Date(Date.UTC(2026, 0, 3 + start)).toISOString().slice(0, 10),
    });
  });
  return {
    activities,
    input: {
      swimlanes,
      membership,
      storedLanes: new Map(),
      source: 'ACTIVITY_CODE',
      noneName: 'No Area',
    },
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function timeIt(bands: number): { ms: number; lanes: number; extents: number } {
  const { activities, input } = scene(bands);
  const options = { source: 'visual', dataDate: DATA_DATE } as const;
  projectSwimlanes(activities, input, options); // warm the JIT, so the first run is not the only slow one
  const samples: number[] = [];
  let last = projectSwimlanes(activities, input, options);
  for (let run = 0; run < RUNS; run += 1) {
    const t0 = performance.now();
    last = projectSwimlanes(activities, input, options);
    samples.push(performance.now() - t0);
  }
  return { ms: median(samples), lanes: last.laneCount, extents: last.extents.length };
}

/**
 * **The projection's cost with many bands** (m4-spec owner answer 1: a code with over 100 values in
 * use is still drawn, so 1,000 bands must not be a different order of cost from 100). Not a canvas
 * frame claim: it times `projectSwimlanes` alone, which runs once per data change and not per frame
 * (`docs/specs/p6-activity-codes/m4-record.md` §4). The ceiling is a ratio, because an absolute
 * millisecond figure belongs to the machine that took it (ADR-0128).
 */
describe('projectSwimlanes at many bands', () => {
  it('places every activity in a stack of 1,000 bands, and costs the same order as 100', () => {
    const hundred = timeIt(100);
    const thousand = timeIt(1000);
    expect(hundred.extents).toBe(100);
    expect(thousand.extents).toBe(1000);
    expect(thousand.lanes).toBeGreaterThanOrEqual(1000);
    // Ten times the bands over the same activities: far inside a tenfold ratio .
    expect(thousand.ms).toBeLessThan(hundred.ms * 10);
    process.stdout.write(
      `projectSwimlanes ${String(ACTIVITIES)} activities: 100 bands ${hundred.ms.toFixed(2)} ms (${String(hundred.lanes)} lanes), 1000 bands ${thousand.ms.toFixed(2)} ms (${String(thousand.lanes)} lanes)\n`,
    );
  });
});
