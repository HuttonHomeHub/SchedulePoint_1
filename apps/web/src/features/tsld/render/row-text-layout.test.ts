import { describe, expect, it } from 'vitest';

import type { LaneRow } from './paint-frame';
import {
  LABEL_ELLIPSIS,
  LABEL_FONT,
  LABEL_GAP_PX,
  MILESTONE_LABEL_FONT,
  NODE_TEXT_CLEAR_PX,
  rowReservesTextRows,
  rowSlots,
  screenYOfLane,
  wrappedNameYs,
  type Rect,
  type RenderActivity,
  type Viewport,
} from './render-model';
import { allItems, layoutRowText, type RowTextInput } from './row-text-layout';
import { DEFAULT_VIEW_TOGGLES, type TsldViewToggles } from './view-toggles';

/**
 * **The row's text layout, one case per branch** (links-and-labels M1-T1, spec §4.2).
 *
 * Every branch moved verbatim from the painter's layers 3.6–3.8, and each case here is lifted from
 * the comment that records why the branch exists, so a case names the defect it would let back.
 * Widths come from a fixed-width measure (6 px a character regular, 7 bold) that also records what
 * it was asked for, so a case can assert WHICH font a string was measured in.
 */
const VIEW: Viewport = { pxPerDay: 12, originX: 0, originY: 0 };
const SIZE = { width: 1600, height: 400 };

function act(over: Partial<RenderActivity> & { id: string }): RenderActivity {
  return {
    type: 'TASK',
    laneIndex: 0,
    label: over.id,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-20',
    isCritical: false,
    isNearCritical: false,
    ...over,
  };
}

const rect = (x: number, w: number, lane = 0): Rect => ({
  x,
  y: screenYOfLane(lane, VIEW) + 27,
  w,
  h: 6,
});

function input(
  rows: LaneRow[][],
  over: Partial<Omit<RowTextInput, 'rows' | 'toggles'>> & {
    toggles?: Partial<TsldViewToggles>;
  } = {},
): { args: RowTextInput; calls: { text: string; font: string | undefined }[] } {
  const calls: { text: string; font: string | undefined }[] = [];
  const map = new Map<number, LaneRow[]>();
  for (const row of rows) map.set(row[0]!.activity.laneIndex, row);
  const { toggles, ...rest } = over;
  return {
    calls,
    args: {
      rows: () => map,
      view: VIEW,
      size: SIZE,
      toggles: { ...DEFAULT_VIEW_TOGGLES, dates: true, ...toggles },
      visualRefresh: true,
      reservesTextRows: rowReservesTextRows(),
      measure: (text, font) => {
        calls.push({ text, font });
        return text.length * (font === MILESTONE_LABEL_FONT ? 7 : 6);
      },
      labelOf: (a) => a.label,
      ...rest,
    },
  };
}

const slots = (lane = 0): ReturnType<typeof rowSlots> => rowSlots(screenYOfLane(lane, VIEW));

describe('the name row (layer 3.6)', () => {
  it('the reserved-row path is the one under test', () => {
    // Every case below assumes a name row above the bar. If the row stops reserving one, they are
    // testing the legacy branch and would say nothing about the product.
    expect(rowReservesTextRows()).toBe(true);
  });

  it('a first-in-row name centres freely on its bar, overhanging into empty lane', () => {
    const a = act({ id: 'a', label: 'Excavate' }); // 48 px on a 20 px bar
    const { args } = input([[{ activity: a, rect: rect(200, 20) }]]);
    const step = layoutRowText(args).names!.steps[0]!;
    expect(step.line?.text).toBe('Excavate');
    expect(step.line?.x).toBe(210);
    expect(step.line?.y).toBe(slots().nameY);
  });

  it('a gap is shared: each side claims HALF of it, so two names stay LABEL_GAP_PX apart', () => {
    const a = act({ id: 'a', label: 'aaaaaaaaaaaaaaaaaaaa' });
    const b = act({ id: 'b', label: 'bbbbbbbbbbbbbbbbbbbb' });
    const { args } = input([
      [
        { activity: a, rect: rect(100, 40) },
        { activity: b, rect: rect(160, 40) },
      ],
    ]);
    const [sa, sb] = layoutRowText(args).names!.steps;
    const right = sa!.line!.ink.x + sa!.line!.ink.w;
    expect(sb!.line!.ink.x - right).toBeGreaterThanOrEqual(LABEL_GAP_PX - 1e-9);
  });

  it('the half is NOT clamped at zero: overlapping rects leave no budget and print nothing', () => {
    // FC-N6a: a milestone's glyph can overlap its neighbour's rect. Clamping each side's room at 0
    // left both names their whole rect width and they collided.
    const m = act({ id: 'm', type: 'FINISH_MILESTONE', label: 'Handover' });
    const t = act({ id: 't', type: 'FINISH_MILESTONE', label: 'Commission' });
    const n = act({ id: 'n', type: 'FINISH_MILESTONE', label: 'Energise' });
    // Three 14 px glyphs 4 px apart: each overlaps the next by 10 px. For the middle one each half
    // is (−10 − LABEL_GAP_PX) / 2, so its budget is 14 − 14 = 0.
    const { args } = input([
      [
        { activity: m, rect: rect(100, 14) },
        { activity: t, rect: rect(104, 14) },
        { activity: n, rect: rect(108, 14) },
      ],
    ]);
    expect(LABEL_GAP_PX).toBe(4); // the arithmetic above
    const names = layoutRowText(args).names!;
    // No room: no step at all, so not even the bold font is set for it.
    expect(names.steps.find((s) => s.activityId === 't')).toBeUndefined();
  });

  it("keeps a long bar's name on the part of the bar that is on screen (#380)", () => {
    const a = act({ id: 'a', label: 'Long run' }); // 48 px
    const { args } = input([[{ activity: a, rect: rect(-2000, 2300) }]]);
    const step = layoutRowText(args).names!.steps[0]!;
    // The bar's middle (−850) is off screen; the visible part is 0..300. The name is clamped into
    // the visible part on the side nearest the middle: centre 24, its left edge on x = 0.
    expect(step.line?.x).toBe(24);
    expect(step.line?.ink.x).toBe(0);
  });

  it('a lone ellipsis is not a name: the step records the suppression and draws nothing', () => {
    const a = act({ id: 'a', label: 'Commissioning' });
    const b = act({ id: 'b', label: 'x' });
    // Budget = 4 + (−2 room each side) … too small for one character plus the ellipsis.
    const { args } = input([
      [
        { activity: act({ id: 'z', label: 'z' }), rect: rect(80, 10) },
        { activity: a, rect: rect(100, 4) },
        { activity: b, rect: rect(110, 10) },
      ],
    ]);
    const step = layoutRowText(args).names!.steps.find((s) => s.activityId === 'a')!;
    expect(step.line).toBeNull();
    expect(step.wrap).toBeNull();
  });

  it('a milestone name is bold, and measured under its own font key', () => {
    const m = act({ id: 'm', type: 'FINISH_MILESTONE', label: 'Handover' });
    const { args, calls } = input([[{ activity: m, rect: rect(300, 14) }]], {
      toggles: { dates: false },
    });
    const step = layoutRowText(args).names!.steps[0]!;
    expect(step.bold).toBe(true);
    expect(step.line?.font).toBe(MILESTONE_LABEL_FONT);
    expect(
      calls.filter((c) => c.text === 'Handover').every((c) => c.font === MILESTONE_LABEL_FONT),
    ).toBe(true);
  });

  it('a name that would truncate proposes a wrap, with the one-line fallback beside it', () => {
    const a = act({ id: 'a', label: 'Install analyser room' }); // 126 px
    const { args } = input([
      [
        { activity: act({ id: 'p', label: 'p' }), rect: rect(10, 20) },
        { activity: a, rect: rect(100, 60) },
        { activity: act({ id: 'n', label: 'n' }), rect: rect(190, 20) },
      ],
    ]);
    const step = layoutRowText(args).names!.steps.find((s) => s.activityId === 'a')!;
    expect(step.line).toBeNull();
    expect(step.wrap).not.toBeNull();
    const wrapped = wrappedNameYs(slots());
    expect(step.wrap!.upper.y).toBe(wrapped.upper);
    expect(step.wrap!.lower.y).toBe(wrapped.lower);
    expect(step.wrap!.fallback?.text.endsWith(LABEL_ELLIPSIS)).toBe(true);
    expect(step.wrap!.fallback?.y).toBe(slots().nameY);
    // The router's view (spec D-4) reads the fallback, not the wrap.
    expect(allItems(layoutRowText(args)).map((i) => i.kind)).toContain('name');
  });
});

describe('the dates row (layer 3.7)', () => {
  it('a milestone writes ONE date, centred under its glyph', () => {
    const m = act({
      id: 'm',
      type: 'FINISH_MILESTONE',
      earlyStart: '2026-01-20',
      earlyFinish: '2026-01-20',
    });
    const { args } = input([[{ activity: m, rect: rect(300, 14) }]]);
    const step = layoutRowText(args).dates!.reserved[0]!;
    expect(step.items.map((i) => [i.kind, i.align])).toEqual([['milestone-date', 'center']]);
    expect(step.items[0]!.x).toBe(307);
  });

  it('dates that fit go inside the ends, clear of the node discs', () => {
    const a = act({ id: 'a' });
    const { args } = input([[{ activity: a, rect: rect(100, 200) }]]);
    const [start, finish] = layoutRowText(args).dates!.reserved[0]!.items;
    expect(start!.kind).toBe('date-start');
    expect(start!.x).toBe(100 + NODE_TEXT_CLEAR_PX);
    expect(finish!.x).toBe(300 - NODE_TEXT_CLEAR_PX);
    expect(finish!.align).toBe('right');
  });

  it('writes one date per node: the finish is withheld where the next bar starts there (#379)', () => {
    const a = act({ id: 'a' });
    const b = act({ id: 'b', earlyStart: '2026-01-21', earlyFinish: '2026-02-05' });
    const { args } = input([
      [
        { activity: a, rect: rect(100, 200) },
        { activity: b, rect: rect(300, 200) },
      ],
    ]);
    const [sa, sb] = layoutRowText(args).dates!.reserved;
    expect(sa!.items.map((i) => i.kind)).toEqual(['date-start']);
    expect(sb!.items.map((i) => i.kind)).toEqual(['date-start', 'date-finish']);
  });

  it('flanks the ends it has room beside when the pair does not fit inside', () => {
    const a = act({ id: 'a' });
    const { args } = input([[{ activity: a, rect: rect(300, 30) }]]);
    const kinds = layoutRowText(args).dates!.reserved[0]!.items.map((i) => [i.kind, i.align]);
    expect(kinds).toEqual([
      ['date-start', 'right'],
      ['date-finish', 'left'],
    ]);
  });

  it('draws nothing where it has neither room, and still records the step', () => {
    const a = act({ id: 'a' });
    const { args } = input([
      [
        { activity: act({ id: 'p' }), rect: rect(0, 290) },
        { activity: a, rect: rect(300, 30) },
        { activity: act({ id: 'n' }), rect: rect(340, 300) },
      ],
    ]);
    const step = layoutRowText(args).dates!.reserved.find((s) => s.activityId === 'a')!;
    expect(step.items).toEqual([]);
  });

  it('is withheld at the overview tier', () => {
    const { args } = input([[{ activity: act({ id: 'a' }), rect: rect(100, 200) }]], {
      view: { pxPerDay: 1, originX: 0, originY: 0 },
    });
    expect(layoutRowText(args).dates).toBeNull();
  });
});

describe('the centre item (layer 3.8)', () => {
  const withCentre = { toggles: { centreItem: true } };

  it('prints the full form where it fits', () => {
    const a = act({ id: 'a', durationDays: 5, remainingFloat: 3 });
    const { args } = input([[{ activity: a, rect: rect(100, 400) }]], withCentre);
    expect(layoutRowText(args).centre!.items.map((i) => i.text)).toEqual(['5d · 3d float left']);
  });

  it('falls back to the short form, then to nothing', () => {
    const a = act({ id: 'a', durationDays: 5, remainingFloat: 3 });
    const narrow = input([[{ activity: a, rect: rect(100, 60) }]], {
      toggles: { centreItem: true, dates: false },
    });
    expect(layoutRowText(narrow.args).centre!.items.map((i) => i.text)).toEqual(['5d']);
    const tiny = input([[{ activity: a, rect: rect(100, 20) }]], {
      toggles: { centreItem: true, dates: false },
    });
    expect(layoutRowText(tiny.args).centre!.items).toEqual([]);
    expect(layoutRowText(tiny.args).centre!.measured).toBe(true);
  });

  it('a critical activity prints its duration alone', () => {
    const a = act({ id: 'a', durationDays: 5, remainingFloat: 0, isCritical: true });
    const { args } = input([[{ activity: a, rect: rect(100, 400) }]], withCentre);
    expect(layoutRowText(args).centre!.items.map((i) => i.text)).toEqual(['5d']);
  });

  it('measures nothing on a scene with no durations (its lazy font stays unset)', () => {
    const { args, calls } = input([[{ activity: act({ id: 'a' }), rect: rect(100, 400) }]], {
      toggles: { centreItem: true, dates: false, labels: true },
    });
    const layout = layoutRowText(args);
    expect(layout.centre!.measured).toBe(false);
    expect(calls.every((c) => c.text === 'a')).toBe(true);
  });
});

describe('the boxes', () => {
  it('an ink box is the font px high; a line box is LABEL_LINE_H high, both from the alignment', () => {
    const a = act({ id: 'a', label: 'Pour' }); // 24 px
    const { args } = input([[{ activity: a, rect: rect(200, 60) }]], { toggles: { dates: false } });
    const item = layoutRowText(args).names!.steps[0]!.line!;
    expect(item.ink).toEqual({ x: 230 - 12, y: item.y - 5.5, w: 24, h: 11 });
    expect(item.line.x).toBe(218);
    expect(item.line.h).toBeGreaterThan(item.ink.h);
    expect(item.font).toBe(LABEL_FONT);
  });
});
