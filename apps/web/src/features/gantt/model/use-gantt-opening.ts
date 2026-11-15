import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { resolveHiddenColumns } from '../layout/narrow-default';

import {
  DEFAULT_HIDDEN_COLUMNS,
  type GanttColumnKey,
  type ParsedHiddenColumns,
} from './gantt-view-state';

import { layoutSize } from '@/components/layout/workspace/workspace-scale';

/** What {@link useGanttOpening} hands the host. */
export interface GanttOpening {
  /** The columns this view hides: the stated choice, else the narrow or the usual default. */
  hidden: ReadonlySet<GanttColumnKey>;
  /**
   * The columns the view **opened** with, held for the opening. The grid pane's seed is taken from
   * these, so ticking a column on or off afterwards does not move a divider nobody touched.
   */
  openingHidden: ReadonlySet<GanttColumnKey>;
  /**
   * The view **opened** narrow with no choice stated, held for the opening: the pane's seed gives
   * Activity its floor, and ticking a column afterwards must not move a divider nobody touched.
   */
  openingNarrow: boolean;
  /** No choice was stated and the frame was narrow: the chooser says why Code and Finish are off. */
  narrowDefault: boolean;
  /** Paper: the stated choice, else the standard set. Paper is not narrow. */
  printHidden: ReadonlySet<GanttColumnKey>;
}

interface Measured {
  key: string;
  frameWidth: number;
  threshold: number;
  openingHidden: ReadonlySet<GanttColumnKey>;
  openingNarrow: boolean;
}

const STANDARD_HIDDEN: ReadonlySet<GanttColumnKey> = new Set(DEFAULT_HIDDEN_COLUMNS);

/**
 * **Which columns a Gantt with no column choice opens with, decided once per opening**
 * (`docs/specs/gantt-narrow-default-columns/` §4.4).
 *
 * The frame is measured in a layout effect so the first painted frame already has the right columns,
 * and then **held**: resizing the window afterwards changes nothing, because columns that appear and
 * vanish under a resizing pointer are worse than a default that is slightly wrong until the next
 * opening. An opening is one stay in the Gantt view of one plan (`openingKey`); leaving the view or
 * changing plan decides again. An unmeasured frame (jsdom, `display: none`) is not narrow, so until a
 * width is read — and for ever where none can be — the usual columns stand, which is today's
 * behaviour.
 *
 * The threshold is read at the moment of measuring and held with it, so a baseline or code column
 * that arrives a moment later does not flip the columns under the planner.
 */
export function useGanttOpening(input: {
  frameRef: RefObject<HTMLElement | null>;
  /** The Gantt is the projection on screen. */
  active: boolean;
  openingKey: string;
  /**
   * What the threshold depends on has loaded: the activities, the baseline variance and the code
   * columns. The decision waits for it, because it is held once taken and an early measure would be
   * made against a threshold that a baseline or code column arriving a moment later would have raised.
   * Until then (and for ever where it never comes) the usual columns stand.
   */
  ready: boolean;
  parsed: ParsedHiddenColumns;
  threshold: number;
}): GanttOpening {
  const { frameRef, active, openingKey, ready, parsed, threshold } = input;
  const [measured, setMeasured] = useState<Measured | null>(null);
  // Leaving the view ends the opening. Adjusted while rendering, the pattern React documents for
  // state that follows a prop, rather than in an effect that would cascade a second render.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setMeasured(null);
  }

  // Read by the measuring effect without making it re-run when they change: it decides once. Written
  // in an effect declared first, so it is current when the measuring one runs.
  const latest = useRef({ parsed, threshold });
  useLayoutEffect(() => {
    latest.current = { parsed, threshold };
  });

  useLayoutEffect(() => {
    if (!active || !ready) return;
    const element = frameRef.current;
    if (!element) return;
    const take = (frameWidth: number): void =>
      setMeasured({
        key: openingKey,
        frameWidth,
        threshold: latest.current.threshold,
        openingNarrow: !latest.current.parsed.stated && frameWidth < latest.current.threshold,
        openingHidden: resolveHiddenColumns({
          parsed: latest.current.parsed,
          frameWidth,
          threshold: latest.current.threshold,
        }),
      });
    const width = layoutSize(element).width;
    if (width > 0) {
      take(width);
      return;
    }
    // Not laid out yet: take the first real width, then stop looking.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const next = layoutSize(element).width;
      if (next > 0) {
        take(next);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, openingKey, ready, frameRef]);

  const opening = active && measured?.key === openingKey ? measured : null;
  const hidden = useMemo(
    () =>
      resolveHiddenColumns({
        parsed,
        frameWidth: opening?.frameWidth ?? 0,
        threshold: opening?.threshold ?? threshold,
      }),
    [parsed, opening, threshold],
  );
  const narrowDefault =
    !parsed.stated && opening !== null && opening.frameWidth < opening.threshold;

  return {
    hidden,
    openingHidden: opening?.openingHidden ?? hidden,
    openingNarrow: opening?.openingNarrow ?? false,
    narrowDefault,
    printHidden: parsed.stated ? parsed.hidden : STANDARD_HIDDEN,
  };
}
