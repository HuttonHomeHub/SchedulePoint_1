import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HIDDEN_COLUMNS,
  NARROW_DEFAULT_HIDDEN,
  type GanttColumnKey,
} from '../model/gantt-view-state';

import {
  DEFAULT_COLUMN_WIDTHS,
  DEFAULT_NAME_WIDTH,
  NAME_COLUMN_MIN_WIDTH,
  defaultGridWidth,
  shownColumns,
} from './column-widths';
import { narrowThreshold, resolveHiddenColumns } from './narrow-default';
import {
  ACTIONS_COLUMN_WIDTH,
  GRID_END_GUTTER,
  TIMELINE_MIN_SHARE,
  VARIANCE_COLUMN_WIDTH,
  pinnedExtraWidth,
} from './pinned-geometry';

const PLAIN = { swimlanesOffered: false, extraPinned: pinnedExtraWidth(false, true), codeCount: 0 };
const threshold = narrowThreshold(PLAIN);
const unstated = { stated: false } as const;

/** The usual columns' pane, written out from the constants rather than from the function under test. */
const WIDE_SEED =
  DEFAULT_NAME_WIDTH +
  DEFAULT_COLUMN_WIDTHS.code +
  DEFAULT_COLUMN_WIDTHS.duration +
  DEFAULT_COLUMN_WIDTHS.earlyStart +
  DEFAULT_COLUMN_WIDTHS.earlyFinish +
  DEFAULT_COLUMN_WIDTHS.totalFloat +
  ACTIONS_COLUMN_WIDTH +
  GRID_END_GUTTER;

describe('narrowThreshold', () => {
  it("is the usual columns' pane divided by the share the timeline is owed", () => {
    expect(threshold).toBeCloseTo(WIDE_SEED / (1 - TIMELINE_MIN_SHARE), 6);
  });

  it('is raised by a baseline, by a code column and by the Swimlane column', () => {
    const withBaseline = narrowThreshold({
      ...PLAIN,
      extraPinned: pinnedExtraWidth(true, true),
    });
    expect(withBaseline).toBeCloseTo(
      (WIDE_SEED + VARIANCE_COLUMN_WIDTH) / (1 - TIMELINE_MIN_SHARE),
      6,
    );
    expect(narrowThreshold({ ...PLAIN, codeCount: 2 })).toBeCloseTo(
      (WIDE_SEED + 2 * DEFAULT_COLUMN_WIDTHS.codes) / (1 - TIMELINE_MIN_SHARE),
      6,
    );
    expect(narrowThreshold({ ...PLAIN, swimlanesOffered: true })).toBeGreaterThan(threshold);
    expect(withBaseline).toBeGreaterThan(threshold);
  });
});

describe('resolveHiddenColumns', () => {
  it('uses a stated choice at every width, including none and an unmeasured frame', () => {
    const stated = { stated: true, hidden: new Set<GanttColumnKey>(['duration']) } as const;
    const none = { stated: true, hidden: new Set<GanttColumnKey>() } as const;
    for (const frameWidth of [0, 1, threshold - 1, threshold, 10_000]) {
      expect([...resolveHiddenColumns({ parsed: stated, frameWidth, threshold })]).toEqual([
        'duration',
      ]);
      expect(resolveHiddenColumns({ parsed: none, frameWidth, threshold }).size).toBe(0);
    }
  });

  it('treats an unmeasured frame as not narrow, so the usual columns stand', () => {
    expect([...resolveHiddenColumns({ parsed: unstated, frameWidth: 0, threshold })]).toEqual([
      ...DEFAULT_HIDDEN_COLUMNS,
    ]);
  });

  it('goes narrow just below the threshold and not at it', () => {
    expect([
      ...resolveHiddenColumns({ parsed: unstated, frameWidth: threshold - 1, threshold }),
    ]).toEqual([...NARROW_DEFAULT_HIDDEN]);
    expect([
      ...resolveHiddenColumns({ parsed: unstated, frameWidth: threshold, threshold }),
    ]).toEqual([...DEFAULT_HIDDEN_COLUMNS]);
  });

  it('puts the threshold where the usual pane takes exactly the share the timeline does not', () => {
    expect(threshold * (1 - TIMELINE_MIN_SHARE)).toBeCloseTo(WIDE_SEED, 6);
  });

  it('keeps the timeline its share on the narrow set with Activity at its floor, down to a 670 px Gantt', () => {
    const narrowSeed = defaultGridWidth(
      shownColumns(new Set(NARROW_DEFAULT_HIDDEN)),
      PLAIN.extraPinned,
      0,
      NAME_COLUMN_MIN_WIDTH,
    );
    expect(narrowSeed).toBe(
      WIDE_SEED -
        DEFAULT_COLUMN_WIDTHS.code -
        DEFAULT_COLUMN_WIDTHS.earlyFinish -
        (DEFAULT_NAME_WIDTH - NAME_COLUMN_MIN_WIDTH),
    );
    // A 747 px Gantt (1024 window, Explorer open) is under the threshold and the share holds there.
    expect(1 - narrowSeed / 747).toBeGreaterThanOrEqual(TIMELINE_MIN_SHARE);
    expect(narrowSeed / (1 - TIMELINE_MIN_SHARE)).toBeLessThan(700);
  });
});
