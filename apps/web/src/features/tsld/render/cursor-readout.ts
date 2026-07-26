import type { GestureState } from '../interaction/gesture-machine';

import {
  addCalendarDays,
  dayColumnAt,
  formatCanvasDate,
  screenXOfDay,
  type Point,
  type Viewport,
} from './render-model';

/**
 * The **cursor date readout** (ADR-0054 §2, `VITE_CANVAS_LIVE_FEEDBACK`) — the pure half. Given
 * the in-flight gesture (or none) and the pointer, it decides *which day* the planner is actually
 * choosing and what sentence describes it.
 *
 * The point of the whole feature is that this number cannot lie: the day is taken from the SAME
 * gesture state the machine will commit, not from the raw pointer, so a snapped drag shows the day
 * it will land on rather than the pixel under the cursor. Only when nothing is being manipulated
 * does it fall back to the pointer's own day column ({@link dayColumnAt} — the function
 * hit-testing and the gesture machine both use).
 *
 * No canvas, DOM or React here; the painter turns the result into a chip and a guideline.
 */
export interface CursorReadout {
  /** Screen x of the guideline and the chip's anchor — the day boundary, not the raw pointer. */
  x: number;
  /** The sentence the chip states, e.g. `Start 2 Jan`, `Finish 6 Jan`, or `2 Jan – 6 Jan · 5d`. */
  label: string;
}

/**
 * The label for a single day offset about the data date, in the SAME compact form the flanking
 * bar dates use ({@link formatCanvasDate}, `2 Jan`).
 *
 * Deliberately not `formatCalendarDate` (`02 Jan 2026`): this chip follows the pointer every
 * frame and must stay short enough to track, and §3 already established that the ruler above
 * carries the year. Using two different date formats a few pixels apart would also read as an
 * inconsistency rather than a distinction.
 */
function dayLabel(dataDate: string, dayOffset: number): string {
  return formatCanvasDate(addCalendarDays(dataDate, dayOffset));
}

/**
 * Name the datum in the chip. A bare date cannot say *which* date it is, and the epic's sibling
 * readouts all self-describe (the lag chip reads `SS + 3d`, the resize readout `7d`) — so a
 * reposition and a start-edge resize would otherwise be indistinguishable from idle hover.
 */
function qualified(kind: 'Start' | 'Finish' | null, label: string): string {
  return kind ? `${kind} ${label}` : label;
}

/**
 * The readout for the current gesture + pointer, or `null` when there is nothing honest to say.
 *
 * Per gesture, the datum is the one being **chosen**, not merely the one under the cursor:
 *
 * - **creating** — the span so far, plus its inclusive whole-day duration;
 * - **repositioning** — the tentative **start** (a drop imposes an SNET at that day, ADR-0023);
 * - **resizing** a finish edge — the tentative **finish**; a start edge — the tentative **start**
 *   (the edge the planner is holding is the one whose date is in question);
 * - **lagDragging** — `null`: that gesture already carries its own `SS + 3d` chip (ADR-0052 M3),
 *   and two chips racing each other around one anchor is worse than one;
 * - **linking** / **idle hover** — the plain day under the pointer, so scrubbing the canvas reads
 *   as a date ruler.
 */
export function cursorReadout(args: {
  state: GestureState;
  point: Point | null;
  view: Viewport;
  dataDate: string;
}): CursorReadout | null {
  const { state, point, view, dataDate } = args;
  const at = (day: number, label: string): CursorReadout => ({
    x: screenXOfDay(day, view),
    label,
  });

  switch (state.kind) {
    case 'creating': {
      const left = Math.min(state.originDay, state.currentDay);
      const right = Math.max(state.originDay, state.currentDay);
      const days = right - left + 1;
      return at(right + 1, `${dayLabel(dataDate, left)} – ${dayLabel(dataDate, right)} · ${days}d`);
    }
    case 'repositioning':
      return at(
        state.currentStartDay,
        qualified('Start', dayLabel(dataDate, state.currentStartDay)),
      );
    case 'resizing': {
      if (state.edge === 'start') {
        return at(
          state.currentStartDay,
          qualified('Start', dayLabel(dataDate, state.currentStartDay)),
        );
      }
      // The inclusive finish day; the guideline sits on its right-hand boundary, which is the
      // edge the planner is physically holding.
      const finish = state.currentStartDay + state.currentDurationDays - 1;
      return at(finish + 1, qualified('Finish', dayLabel(dataDate, finish)));
    }
    case 'lagDragging':
      return null; // the ADR-0052 lag chip already owns this anchor
    default: {
      if (!point) return null;
      const day = dayColumnAt(point.x, view);
      return at(day, dayLabel(dataDate, day));
    }
  }
}
