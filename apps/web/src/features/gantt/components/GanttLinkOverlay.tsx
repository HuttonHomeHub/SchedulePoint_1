import type { GanttLinkPath } from '../layout/link-paths';

/**
 * **The dependency arrows — one SVG in the existing scroll container.**
 *
 * Not a second scroller and not a canvas: both would put the overlay on its own coordinate system,
 * and the whole reason this is cheap is that a link here is an elbow through whitespace rather than
 * a routed path (see `link-paths.ts`, and the structural test that keeps that true).
 *
 * `aria-hidden`, because an SVG elbow is not readable. The textual equivalent is
 * `predecessorSummary` rendered `sr-only` in the row — spec GV-3's rule that every visual encoding
 * has a text equivalent, which `grid-columns.ts` already honours for dates and float, and which the
 * arrows would otherwise be the first thing on this surface to break.
 *
 * `pointer-events: none` throughout. The overlay sits above the bars, so without it every arrow
 * would be a hole in the drag surface — the resize handle under a passing link would silently stop
 * responding, on exactly the dense plans where both matter.
 */

/** Where a link enters and leaves vertically, given the row height. */
const rowCentre = (rowIndex: number, rowHeight: number): number =>
  rowIndex * rowHeight + rowHeight / 2;

export interface GanttLinkOverlayProps {
  paths: readonly GanttLinkPath[];
  /** How many links the cap withheld. Rendered as text by the caller, never swallowed here. */
  withheld: number;
  rowHeight: number;
  /** Total drawable height — the virtualizer's own total, so the overlay cannot outgrow the rows. */
  height: number;
  width: number;
  /** Left edge of the chart region, so x is in the same frame the bars are drawn in. */
  chartLeft: number;
  /** Where a row's bar starts and ends, in chart pixels. Null when it has no geometry. */
  barBoundsForRow: (rowIndex: number) => { x: number; width: number } | null;
}

export function GanttLinkOverlay({
  paths,
  rowHeight,
  height,
  width,
  chartLeft,
  barBoundsForRow,
}: GanttLinkOverlayProps): React.ReactElement | null {
  if (paths.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      style={{ width, height }}
      // `--muted-foreground` is the validated token: `token-contrast.test.ts` carries it against the
      // chart ground AND against `--accent`, so an arrow crossing the selected row stays visible.
      // The pair went in before this file existed (ADR-0083's ordering).
      stroke="var(--muted-foreground)"
      fill="none"
    >
      {paths.map((path) => {
        // An off-window endpoint has no row, so it is drawn as a stub to the chart edge rather than
        // as if the chain stopped there — a link that ends in mid-air is a claim about the plan; a
        // stub is a claim about the viewport.
        const fromY = path.fromRow === null ? null : rowCentre(path.fromRow, rowHeight);
        const toY = path.toRow === null ? null : rowCentre(path.toRow, rowHeight);
        const fromBar = path.fromRow === null ? null : barBoundsForRow(path.fromRow);
        const toBar = path.toRow === null ? null : barBoundsForRow(path.toRow);

        // Both ends unusable: nothing honest to draw. The culling rule already dropped the
        // both-off-window case, so this covers a row whose activity has no computed dates.
        if ((fromY === null || fromBar === null) && (toY === null || toBar === null)) return null;

        const startX = fromBar === null ? 0 : chartLeft + fromBar.x + fromBar.width;
        const startY = fromY ?? toY!;
        const endX = toBar === null ? width : chartLeft + toBar.x;
        const endY = toY ?? fromY!;

        // The elbow: out of the predecessor, across a gutter, down or up, into the successor. Three
        // segments, no search. A quarter of the row height as the gutter keeps the vertical leg off
        // the bars it passes between.
        const gutter = rowHeight / 4;
        const midX = Math.max(startX + gutter, endX - gutter);
        const d = `M ${String(startX)} ${String(startY)} H ${String(midX)} V ${String(endY)} H ${String(endX)}`;

        return (
          <path
            key={path.id}
            d={d}
            strokeWidth={1.25}
            // A dashed stub says "continues off-screen" without a second colour, which would need
            // its own contrast pair and would be one more thing to keep validated.
            strokeDasharray={path.fromOffscreen || path.toOffscreen ? '3 3' : undefined}
          />
        );
      })}
    </svg>
  );
}
