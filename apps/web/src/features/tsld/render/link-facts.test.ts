import { describe, expect, it } from 'vitest';

import { linkFactsOf, plateScoringOf } from './link-facts';
import { LABEL_PAD_PX, screenXOfDay, type RenderActivity, type RenderEdge } from './render-model';
import { allItems, sceneRowText } from './row-text-layout';
import { DEFAULT_VIEW_TOGGLES } from './view-toggles';

/**
 * **A link's route-independent facts** (links-and-labels M2, spec D-5): the gap it waits and its
 * lag plate. The painter and the router both read this module, so what it says about when a label
 * or a plate exists, and what it reads, is pinned here rather than only through the painter's log
 * (the M4 component and test reviews).
 */
const DATA_DATE = '2026-01-01';
const SCENE = { dataDate: DATA_DATE, isWorkingDay: () => true };
const measure = (t: string): number => t.length * 7;
const DETAIL = { pxPerDay: 12, originX: 60, originY: 40 };
const WORKING = { ...DETAIL, pxPerDay: 5 };
const OVERVIEW = { ...DETAIL, pxPerDay: 1 };

const act = (id: string, lane: number, start?: string, finish?: string): RenderActivity => ({
  id,
  type: 'TASK',
  laneIndex: lane,
  label: id,
  earlyStart: start,
  earlyFinish: finish,
});
// A finishes 5 Jan, B starts 12 Jan: six days waiting, every day working here.
const A = act('A', 0, '2026-01-02', '2026-01-05');
const B = act('B', 2, '2026-01-12', '2026-01-16');
const edge = (over: Partial<RenderEdge> = {}): RenderEdge => ({
  id: 'A-B',
  predecessorId: 'A',
  successorId: 'B',
  type: 'FS',
  isDriving: false,
  ...over,
});

describe('linkFactsOf', () => {
  it('labels a waiting link with its gap, over the screen span it waits', () => {
    const facts = linkFactsOf(SCENE, DETAIL, DEFAULT_VIEW_TOGGLES, measure);
    const gap = facts.gapOf(edge(), A, B)!;
    expect(gap.text).toBe('6d');
    // The interval runs from A's right edge (day 5) to B's start (day 11).
    expect(gap.x0).toBe(screenXOfDay(5, DETAIL));
    expect(gap.x1).toBe(screenXOfDay(11, DETAIL));
  });

  it('draws no gap for a driving link, a missing date, the overview tier, the switch off or no measure', () => {
    const on = linkFactsOf(SCENE, DETAIL, DEFAULT_VIEW_TOGGLES, measure);
    expect(on.gapOf(edge({ isDriving: true }), A, B)).toBeNull();
    expect(on.gapOf(edge(), act('A', 0, '2026-01-02'), B)).toBeNull();
    expect(on.gapOf(edge(), A, act('B', 2, undefined, '2026-01-16'))).toBeNull();
    expect(linkFactsOf(SCENE, OVERVIEW, DEFAULT_VIEW_TOGGLES, measure).gapsOn).toBe(false);
    expect(
      linkFactsOf(SCENE, DETAIL, { ...DEFAULT_VIEW_TOGGLES, linkSlack: false }, measure).gapsOn,
    ).toBe(false);
    expect(linkFactsOf(SCENE, DETAIL, DEFAULT_VIEW_TOGGLES, null).gapsOn).toBe(false);
    // The working tier still labels gaps: the control for the overview case above.
    expect(linkFactsOf(SCENE, WORKING, DEFAULT_VIEW_TOGGLES, measure).gapsOn).toBe(true);
  });

  it('puts a lag on a plate, with the gap beside it on one plate when the link also waits', () => {
    const facts = linkFactsOf(SCENE, DETAIL, DEFAULT_VIEW_TOGGLES, measure);
    const lagged = edge({ lagDays: 2 });
    const gap = facts.gapOf(lagged, A, B);
    expect(gap).not.toBeNull();
    expect(facts.plateTextOf(lagged, gap)).toBe(`+2d · ${gap!.text}`);
    expect(facts.plateTextOf(lagged, null)).toBe('+2d');
    expect(facts.plateTextOf(edge({ lagDays: -1 }), null)).toBe('−1d');
    expect(facts.plateTextOf(edge(), gap)).toBeNull();
    expect(facts.plateWidth('+2d')).toBe(measure('+2d') + LABEL_PAD_PX * 2);
  });

  it('draws plates at the detail tier only, and only with labels on', () => {
    const lagged = edge({ lagDays: 2 });
    expect(
      linkFactsOf(SCENE, WORKING, DEFAULT_VIEW_TOGGLES, measure).plateTextOf(lagged, null),
    ).toBeNull();
    expect(
      linkFactsOf(SCENE, DETAIL, { ...DEFAULT_VIEW_TOGGLES, labels: false }, measure).platesOn,
    ).toBe(false);
    expect(linkFactsOf(SCENE, DETAIL, DEFAULT_VIEW_TOGGLES, null).platesOn).toBe(false);
  });
});

describe('plateScoringOf', () => {
  const scene = {
    activities: [A, B],
    edges: [edge({ lagDays: 2 })],
    dataDate: DATA_DATE,
    visualRefresh: true,
    isWorkingDay: () => true,
  };
  const byId = new Map([
    ['A', A],
    ['B', B],
  ]);
  const layout = (visualRefresh: boolean) => {
    const cache = new Map();
    const text = sceneRowText(
      { ...scene, visualRefresh },
      DETAIL,
      { width: 1200, height: 400 },
      DEFAULT_VIEW_TOGGLES,
      measure,
      cache,
    );
    return { cache, text };
  };

  it('gives the router each lagged link’s plate width, and nothing for an unlagged one', () => {
    const facts = linkFactsOf(SCENE, DETAIL, DEFAULT_VIEW_TOGGLES, measure);
    const { cache, text } = layout(true);
    const scoring = plateScoringOf(facts, scene, DETAIL, new Set(['A', 'B']), byId, cache, text)!;
    expect(scoring).not.toBeNull();
    const lagged = scene.edges[0]!;
    expect(scoring.widthOf(lagged)).toBe(
      facts.plateWidth(facts.plateTextOf(lagged, facts.gapOf(lagged, A, B))!),
    );
    expect(scoring.widthOf(edge())).toBeNull();
    expect(scoring.widthOf(edge({ lagDays: 2, successorId: 'missing' }))).toBeNull();
    expect(allItems(text).length).toBeGreaterThan(0);
  });

  it('is null off the refreshed path and where plates are not drawn', () => {
    const { cache, text } = layout(false);
    const ids = new Set(['A', 'B']);
    const facts = linkFactsOf(SCENE, DETAIL, DEFAULT_VIEW_TOGGLES, measure);
    expect(
      plateScoringOf(facts, { ...scene, visualRefresh: false }, DETAIL, ids, byId, cache, text),
    ).toBeNull();
    const working = linkFactsOf(SCENE, WORKING, DEFAULT_VIEW_TOGGLES, measure);
    expect(plateScoringOf(working, scene, WORKING, ids, byId, cache, text)).toBeNull();
  });
});
