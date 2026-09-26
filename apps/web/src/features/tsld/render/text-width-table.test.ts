import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MILESTONE_LABEL_FONT } from './geometry';
import { labelWidths } from './layers/text-measure';
import { LABEL_FONT, type RenderActivity } from './render-model';
import { textWidthKey, textWidthKeys } from './row-text-layout';
import { textWidthTable } from './text-width-table';
import { DEFAULT_VIEW_TOGGLES } from './view-toggles';

/**
 * **The table the Tidy worker routes with** (`docs/TECH_DEBT.md` #395 item 10). Its callers only
 * ever reach it through a real browser, so these cases pin its three properties directly: it refuses
 * rather than guessing when there is nothing to measure with, it measures each key in that key's own
 * font, and it reads through the painter's memo so the worker scores the widths on screen.
 */
const activities: RenderActivity[] = [
  {
    id: 't',
    type: 'TASK',
    laneIndex: 0,
    label: 'Pour slab',
    code: null,
    durationDays: 3,
    remainingFloat: null,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-08',
    isCritical: false,
    isNearCritical: false,
  },
  {
    id: 'm',
    type: 'FINISH_MILESTONE',
    laneIndex: 1,
    label: 'Handover',
    code: null,
    durationDays: 0,
    remainingFloat: null,
    earlyStart: '2026-01-09',
    earlyFinish: '2026-01-09',
    isCritical: false,
    isNearCritical: false,
  },
];

/** A context whose widths say which font was set when each string was measured. */
function fakeContext(): CanvasRenderingContext2D {
  const ctx = {
    font: '',
    measureText(text: string) {
      const perChar = ctx.font === MILESTONE_LABEL_FONT ? 7 : ctx.font === LABEL_FONT ? 5 : 1000;
      return { width: text.length * perChar };
    },
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe('textWidthTable', () => {
  beforeEach(() => labelWidths.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    labelWidths.clear();
  });

  it('throws, rather than guessing a width, when there is no 2D context to measure with', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(() => textWidthTable(activities, DEFAULT_VIEW_TOGGLES)).toThrow(/no 2D context/);
  });

  it('holds exactly the keys the layout can ask for, each measured in its own font', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext());
    const table = new Map(textWidthTable(activities, DEFAULT_VIEW_TOGGLES));
    const keys = textWidthKeys(activities, DEFAULT_VIEW_TOGGLES);
    expect([...table.keys()].sort()).toEqual(keys.map((k) => textWidthKey(k.text, k.font)).sort());
    // A milestone's name is bold (NetPoint grammar M4) and a task's is not; a date always takes the
    // label font. A width of 1000 a character would mean the font was left unset.
    expect(table.get(textWidthKey('Handover', MILESTONE_LABEL_FONT))).toBe(8 * 7);
    expect(table.get(textWidthKey('Pour slab', undefined))).toBe(9 * 5);
    // Every key in the font it names: 7 a character bold, 5 in the label font.
    for (const { text, font } of keys) {
      const perChar = font === MILESTONE_LABEL_FONT ? 7 : 5;
      expect(table.get(textWidthKey(text, font)), text).toBe(text.length * perChar);
    }
  });

  it('reads through the painter’s memo, so the worker scores the widths the canvas draws with', () => {
    labelWidths.measure('Pour slab', () => 123);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext());
    const table = new Map(textWidthTable(activities, DEFAULT_VIEW_TOGGLES));
    expect(table.get(textWidthKey('Pour slab', undefined))).toBe(123);
  });
});
