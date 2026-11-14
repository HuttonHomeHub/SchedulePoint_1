import {
  DEFAULT_HIDDEN_COLUMNS,
  NARROW_DEFAULT_HIDDEN,
  type GanttColumnKey,
  type ParsedHiddenColumns,
} from '../model/gantt-view-state';

import { defaultGridWidth, shownColumns } from './column-widths';
import { TIMELINE_MIN_SHARE } from './pinned-geometry';

/**
 * **Which columns a Gantt with no column choice opens with** (`docs/specs/gantt-narrow-default-columns/`).
 *
 * Pure, so the rule is testable without a browser: the host measures the frame once per opening and
 * hands the number in. The threshold is derived from what the usual columns would take, so a baseline,
 * a code column or the Swimlane column raise it by exactly the room they cost.
 */

/**
 * The Gantt width below which the usual columns would leave the timeline less than
 * {@link TIMELINE_MIN_SHARE} of it: `seed / (1 - share)`, the seed being the pane the usual columns
 * open at.
 */
export function narrowThreshold(input: {
  swimlanesOffered: boolean;
  extraPinned: number;
  codeCount: number;
}): number {
  const wideSeed = defaultGridWidth(
    shownColumns(new Set(DEFAULT_HIDDEN_COLUMNS), input.swimlanesOffered),
    input.extraPinned,
    input.codeCount,
  );
  return wideSeed / (1 - TIMELINE_MIN_SHARE);
}

/**
 * The hidden set this opening uses. A stated choice is returned as written and the width is never
 * consulted. Otherwise the narrow set applies when the frame is measured and below `threshold`; an
 * **unmeasured** frame (width 0: first render, jsdom, `display: none`) is not narrow, the rule
 * `chartGuard` already states for an unmeasured scroller.
 */
export function resolveHiddenColumns(input: {
  parsed: ParsedHiddenColumns;
  frameWidth: number;
  threshold: number;
}): ReadonlySet<GanttColumnKey> {
  if (input.parsed.stated) return input.parsed.hidden;
  const narrow = input.frameWidth > 0 && input.frameWidth < input.threshold;
  return new Set(narrow ? NARROW_DEFAULT_HIDDEN : DEFAULT_HIDDEN_COLUMNS);
}
