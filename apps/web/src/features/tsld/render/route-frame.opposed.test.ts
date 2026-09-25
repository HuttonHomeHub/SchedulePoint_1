import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW_TOGGLES, type TsldScene } from './paint';
import type { Point, RectCache, RenderActivity, RenderEdge, Viewport } from './render-model';
import { routeFrame } from './route-frame';

/**
 * **No two links on one track running opposite ways** (product owner, 2026-09-25, on
 * `web-v0.150.0`): "the links into the install analyser room end node go in two directions and are
 * a tad confusing when scaled out … fixed when you zoom in though, but then zooming in too far
 * causes it again".
 *
 * The scene is that plan's shape around the node, rebuilt from the screenshots: two FF links into
 * Install Analyser Room's finish (from Complete Piping Tie-ins in its own lane, and from Equipment
 * Grouting in the lane below), and an FS from that finish to Install Welfare two days later, two
 * lanes down. At 4.5 px/day — the whole plan at 1646 px — the two days are narrower than the stub
 * rule, so the link leaving can only go down; before the fix every link into the node came up that
 * same vertical. At 56 px/day the leaving link chose the vertical by the tie-break, since the
 * shared end exempted the pair from the overlap count. Both are the report; 13 px/day is between.
 *
 * Verified red against the shipped router (`9092cf27`): opposed pairs at all three zooms.
 */
function act(id: string, lane: number, start: string, finish: string): RenderActivity {
  return {
    id,
    type: 'TASK',
    label: id,
    earlyStart: start,
    earlyFinish: finish,
    isCritical: false,
    isNearCritical: false,
    laneIndex: lane,
  };
}

function edge(p: string, s: string, type: RenderEdge['type'], isDriving: boolean): RenderEdge {
  return { id: `${p}>${s}>${type}`, predecessorId: p, successorId: s, type, lagDays: 0, isDriving };
}

function scene(): TsldScene {
  return {
    activities: [
      act('LVHV', 0, '2026-09-12', '2026-10-12'),
      act('Pond', 0, '2026-10-12', '2026-11-25'),
      act('PipeSup', 1, '2026-03-30', '2026-04-19'),
      act('Piping', 1, '2026-04-19', '2026-06-27'),
      act('PipeTest', 1, '2026-06-27', '2026-07-12'),
      act('TieIns', 1, '2026-07-12', '2026-07-25'),
      act('PreComm', 1, '2026-07-25', '2026-08-08'),
      act('Analyser', 1, '2026-11-27', '2026-12-17'),
      act('Pavings', 2, '2026-03-30', '2026-04-28'),
      act('Grout', 2, '2026-04-28', '2026-05-12'),
      act('EIPre', 3, '2026-06-28', '2026-07-12'),
      act('Welfare', 3, '2026-12-19', '2027-01-02'),
    ],
    edges: [
      edge('LVHV', 'Pond', 'FS', true),
      edge('Pond', 'Analyser', 'FS', true),
      edge('PipeSup', 'Piping', 'FS', true),
      edge('Piping', 'PipeTest', 'FS', true),
      edge('PipeTest', 'TieIns', 'FS', true),
      edge('TieIns', 'PreComm', 'FS', true),
      edge('TieIns', 'Analyser', 'FF', false),
      edge('Pavings', 'Grout', 'FS', true),
      edge('Grout', 'Analyser', 'FF', false),
      edge('EIPre', 'Welfare', 'FF', false),
      edge('Analyser', 'Welfare', 'FS', true),
    ],
    dataDate: '2026-03-30',
    view: { ...DEFAULT_VIEW_TOGGLES },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: (day: string) => {
      const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
      return weekday !== 0 && weekday !== 6;
    },
  } as unknown as TsldScene;
}

/** Every pair of links sharing some length of one track while running opposite ways. */
function opposedPairs(lines: ReadonlyMap<RenderEdge, Point[]>): string[] {
  type Seg = {
    link: string;
    horizontal: boolean;
    fixed: number;
    lo: number;
    hi: number;
    dir: number;
  };
  const segs: Seg[] = [];
  for (const [e, line] of lines) {
    const id = `${e.predecessorId}>${e.successorId}>${e.type}`;
    for (let i = 1; i < line.length; i += 1) {
      const a = line[i - 1]!;
      const b = line[i]!;
      if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6) {
        segs.push({
          link: id,
          horizontal: true,
          fixed: a.y,
          lo: Math.min(a.x, b.x),
          hi: Math.max(a.x, b.x),
          dir: Math.sign(b.x - a.x),
        });
      } else if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6) {
        segs.push({
          link: id,
          horizontal: false,
          fixed: a.x,
          lo: Math.min(a.y, b.y),
          hi: Math.max(a.y, b.y),
          dir: Math.sign(b.y - a.y),
        });
      }
    }
  }
  const found = new Set<string>();
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      const s = segs[i]!;
      const t = segs[j]!;
      if (s.link === t.link || s.horizontal !== t.horizontal) continue;
      if (Math.abs(s.fixed - t.fixed) > 0.01 || s.dir === t.dir) continue;
      if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) <= 0.5) continue;
      found.add([s.link, t.link].sort().join(' against '));
    }
  }
  return [...found];
}

function route(pxPerDay: number): Map<RenderEdge, Point[]> {
  const s = scene();
  const view: Viewport = { pxPerDay, originX: 0, originY: 0 };
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const rectCache: RectCache = new Map();
  return routeFrame(s, view, new Set(byId.keys()), byId, rectCache).lines;
}

describe('routeFrame: links on one track never run opposite ways', () => {
  it.each([4.5, 13, 56])('at %s px/day, nothing into the node runs against the link out', (ppd) => {
    const lines = route(ppd);
    expect(lines.size).toBe(11);
    expect(opposedPairs(lines)).toEqual([]);
  });

  it('still attaches every link into the node at the node', () => {
    // The fix must not buy the result by moving an end: every link into Analyser's finish still
    // ends on the same point, and the link out still starts there.
    for (const ppd of [4.5, 13, 56]) {
      const lines = route(ppd);
      const byId = new Map(
        [...lines].map(([e, line]) => [`${e.predecessorId}>${e.successorId}>${e.type}`, line]),
      );
      const out = byId.get('Analyser>Welfare>FS')!;
      for (const id of ['TieIns>Analyser>FF', 'Grout>Analyser>FF']) {
        expect(byId.get(id)!.at(-1)).toEqual(out[0]);
      }
    }
  });
});
