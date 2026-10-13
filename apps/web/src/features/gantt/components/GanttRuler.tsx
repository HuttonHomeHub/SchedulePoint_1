import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  buildRulerTicks,
  MONTH_LABEL_MIN_PITCH_PX,
  monthLabelSamples,
} from '../layout/ruler-ticks';

/**
 * Height of the ruler band, in pixels. Fixed, so a reader's own line-height override (WCAG 1.4.12)
 * can push a label's box past the row; nothing clips it, because no ancestor hides overflow.
 */
export const RULER_HEIGHT = 34;

/**
 * What separates one label's right edge from the next label's left edge, so neighbours read as two
 * words rather than one string. The labels' common `left-1` inset cancels in a left-to-left pitch,
 * so the pitch is the measured width plus this gap alone. At the default size it is the 14 px
 * {@link MONTH_LABEL_MIN_PITCH_PX} carries over a 49.6 px label.
 */
const LABEL_GAP_PX = 14;

const MONTH_LABEL_SAMPLES = monthLabelSamples();

export interface GanttRulerProps {
  /** The chart's x = 0 date. */
  anchorIso: string;
  widthPx: number;
  pxPerDay: number;
}

/**
 * The time header above the bars.
 *
 * It sits inside the Gantt's single scroll container, so it scrolls **horizontally with the bars**
 * and sticks vertically — no synchronisation, the same structural trick the pinned grid column
 * uses.
 *
 * Level of detail is deliberate: at a wide zoom a tick per day is illegible noise, so day ticks
 * appear only once each has room to be read. Month lines are always present, because a bar chart
 * with no month boundaries cannot be read at all; their labels thin to every second month, quarter
 * or year as the zoom drops, so names never overprint. That decision is the shared
 * {@link buildRulerTicks}, so the printed document places months identically.
 *
 * **The label pitch is measured, not assumed** (#501): the labels are in `rem`, so at 200 % text the
 * widest is 99 px against the 64 px the default size needs. A hidden probe holds every month's label
 * in the same type; a `ResizeObserver` reads its width when the text size changes, not on every
 * render. Where there is no observer (jsdom) the default pitch stands.
 */
export function GanttRuler({ anchorIso, widthPx, pxPerDay }: GanttRulerProps): React.ReactElement {
  const probeRef = useRef<HTMLDivElement>(null);
  const [labelPitchPx, setLabelPitchPx] = useState(MONTH_LABEL_MIN_PITCH_PX);

  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => {
      // Read before first paint (layout effect), so a 200 % correction never flashes the overprinted
      // labels. Never below the default: the constant already covers the default size, and a zero read
      // from a not-yet-laid-out probe must not lift the floor off the labels.
      setLabelPitchPx(
        Math.max(
          MONTH_LABEL_MIN_PITCH_PX,
          Math.ceil(probe.getBoundingClientRect().width) + LABEL_GAP_PX,
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    return () => observer.disconnect();
  }, []);

  const ticks = useMemo(
    () => buildRulerTicks(anchorIso, widthPx, pxPerDay, labelPitchPx),
    [anchorIso, widthPx, pxPerDay, labelPitchPx],
  );

  return (
    <>
      <div className="relative h-full" aria-hidden="true" data-testid="gantt-ruler">
        {ticks.map((tick) => (
          <div
            key={`${tick.major ? 'm' : 'd'}-${tick.x}`}
            className={
              tick.major
                ? 'border-border absolute inset-y-0 border-l'
                : 'border-border/50 absolute bottom-0 h-2 border-l'
            }
            style={{ left: tick.x }}
          >
            {tick.label !== '' ? (
              <span className="text-muted-foreground text-micro pointer-events-none absolute top-1 left-1 leading-none whitespace-nowrap">
                {tick.label}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div
        ref={probeRef}
        aria-hidden="true"
        // Absolute, so it anchors to the nearest positioned ancestor and takes no layout of its own.
        // One grid cell holds every label, so the box is as wide as the widest and one line high:
        // a stacked list would add its height to the scroll container.
        className="text-micro pointer-events-none invisible absolute top-0 left-0 grid whitespace-nowrap [&>span]:col-start-1 [&>span]:row-start-1"
      >
        {MONTH_LABEL_SAMPLES.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </>
  );
}
