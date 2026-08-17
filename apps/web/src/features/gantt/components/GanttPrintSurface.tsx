import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';

import './GanttPrintSurface.css';

import { barGeometry, baselineGeometry, chartAnchor, fitPxPerDay } from '../layout/bar-geometry';
import { GANTT_COLUMNS, varianceText } from '../layout/grid-columns';
import {
  buildRows,
  rowId,
  rowsDateSpan,
  DEFAULT_GANTT_SORT,
  type GanttActivityRow,
  type GanttBucketRow,
} from '../layout/row-model';
import { buildRulerTicks } from '../layout/ruler-ticks';

import { WBS_IMPROVEMENTS_ENABLED } from '@/config/env';
import type { BarDateSource } from '@/lib/bar-dates';
import { mountPrintDocument, type PrintDocumentDeps } from '@/lib/print-document';

/**
 * The **printed programme** — the Gantt as a paper document (ADR-0059 M4).
 *
 * Three things make this a separate surface rather than a print stylesheet over the live panel:
 *
 * 1. **Nothing is virtualized.** The panel keeps ~40 rows in the DOM; printing that would emit a
 *    programme silently truncated to a scroll position. Here every row is rendered.
 * 2. **The scale fits the page**, not the viewport ({@link fitPxPerDay}). A sheet of paper cannot
 *    be panned, so a printed chart showing a window of the plan would be a document that quietly
 *    omits work.
 * 3. **It is a real `<table>`.** Browsers repeat a `<thead>` on every printed page natively — which
 *    is how the column headings and the time ruler come back at the top of page four, without a
 *    line of pagination code.
 *
 * Colours are forced light and hard-coded, the documented print exception (see the companion CSS):
 * a `@media print` sheet cannot read a runtime token, and paper wants dark ink on white whatever
 * theme the app is in.
 */

/**
 * Total document width in CSS pixels. Sized for A4/Letter **landscape** at 96 dpi inside the 12 mm
 * margins the stylesheet sets (297 mm − 24 mm ≈ 1032 px), with room to spare so a slightly
 * different paper size does not clip the last column.
 */
export const PRINT_DOCUMENT_WIDTH = 980;

/** Print row height. Tighter than the screen's 32 px — more of the programme per sheet. */
const PRINT_ROW_HEIGHT = 20;

/** Height of the ruler band inside the repeating table header. */
const PRINT_RULER_HEIGHT = 26;

/** Print column widths, keyed to the shared {@link GANTT_COLUMNS} semantics. */
const PRINT_COLUMN_WIDTHS: Record<string, number> = {
  code: 60,
  name: 180,
  earlyStart: 72,
  earlyFinish: 72,
  totalFloat: 44,
};

const PRINT_VARIANCE_WIDTH = 66;

const printColumnWidth = (key: string): number => PRINT_COLUMN_WIDTHS[key] ?? 72;

export interface GanttPrintSurfaceProps {
  /** The document title — the plan name. */
  title: string;
  /** The subtitle line — the "as of" data date. */
  subtitle: string;
  activities: readonly ActivitySummary[];
  varianceByActivityId?: ReadonlyMap<string, BaselineVarianceRow> | undefined;
  /**
   * Which persisted dates draw each bar (ADR-0033) — the same value the live panel gets. A printed
   * programme is the artefact that leaves the building and gets read in a progress meeting, so it
   * drawing a VISUAL plan from the early columns is the worse half of `docs/TECH_DEBT.md` #135:
   * nobody in that room can compare it against the diagram.
   */
  barDateSource?: BarDateSource;
}

export function GanttPrintSurface({
  title,
  subtitle,
  activities,
  barDateSource,
  varianceByActivityId,
}: GanttPrintSurfaceProps): React.ReactElement {
  // Printing is a snapshot, so the document takes the default order rather than whatever the
  // on-screen grid happened to be sorted by: a WBS-ordered programme is what a progress meeting
  // reads, and it is reproducible between two people printing the same plan.
  // The bucket prints too (WBS improvements M3). A programme whose grouping differs from the
  // screen it was printed from is the kind of divergence a progress meeting discovers out loud;
  // the collapse set is empty here, so every member prints under it.
  const rows = buildRows(activities, DEFAULT_GANTT_SORT, new Set(), {
    unassignedBucket: WBS_IMPROVEMENTS_ENABLED,
  });
  const span = rowsDateSpan(rows);

  const showVariance = varianceByActivityId !== undefined && varianceByActivityId.size > 0;
  const gridWidth =
    GANTT_COLUMNS.reduce((sum, c) => sum + printColumnWidth(c.key), 0) +
    (showVariance ? PRINT_VARIANCE_WIDTH : 0);
  const chartPx = PRINT_DOCUMENT_WIDTH - gridWidth;

  const anchor = span === null ? null : chartAnchor(span);
  const pxPerDay = span === null ? 0 : fitPxPerDay(span, chartPx);
  const ticks = anchor === null ? [] : buildRulerTicks(anchor, chartPx, pxPerDay);

  return (
    <div className="gantt-print-root" data-testid="gantt-print-surface">
      <h1 className="gantt-print-title">{title}</h1>
      <p className="gantt-print-subtitle">{subtitle}</p>

      {anchor === null ? (
        // Rows may exist, but with no computed dates there is no chart to draw. Saying so beats
        // printing an empty grid that reads as "the plan is empty".
        <p className="gantt-print-empty">
          {rows.length === 0
            ? 'This plan has no activities.'
            : 'This plan has not been calculated, so it has no dates to chart.'}
        </p>
      ) : (
        <>
          <table className="gantt-print-table" style={{ width: PRINT_DOCUMENT_WIDTH }}>
            {/* `thead` is what makes pagination free: browsers repeat it on every printed page, so
                page four still says which column is Finish and where March is. */}
            <thead>
              <tr>
                {GANTT_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.align === 'right' ? 'gantt-print-right' : undefined}
                    style={{ width: printColumnWidth(column.key) }}
                  >
                    {column.label}
                  </th>
                ))}
                {showVariance ? (
                  <th
                    scope="col"
                    className="gantt-print-right"
                    style={{ width: PRINT_VARIANCE_WIDTH }}
                  >
                    vs baseline
                  </th>
                ) : null}
                <th scope="col" style={{ width: chartPx }}>
                  <div className="gantt-print-ruler" style={{ height: PRINT_RULER_HEIGHT }}>
                    {ticks.map((tick) => (
                      <span
                        key={`${tick.major ? 'm' : 'd'}-${tick.x}`}
                        className={tick.major ? 'gantt-print-tick-major' : 'gantt-print-tick-day'}
                        style={{ left: tick.x }}
                      >
                        {tick.major ? (
                          <span className="gantt-print-tick-label">{tick.label}</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                row.kind === 'bucket' ? (
                  <PrintBucketRow
                    key={rowId(row)}
                    row={row}
                    chartPx={chartPx}
                    showVariance={showVariance}
                  />
                ) : (
                  <PrintRow
                    key={rowId(row)}
                    row={row}
                    anchorIso={anchor}
                    pxPerDay={pxPerDay}
                    barDateSource={barDateSource}
                    chartPx={chartPx}
                    variance={varianceByActivityId?.get(rowId(row))}
                    showVariance={showVariance}
                  />
                ),
              )}
            </tbody>
          </table>

          {/* On paper, colour may not survive at all. The legend names what each mark means so a
              black-and-white photocopy is still readable (WCAG 1.4.1 in spirit — the printed page
              has no hover, no tooltip and no fallback). */}
          <p className="gantt-print-legend">
            <span className="gantt-print-swatch gantt-print-bar" /> Activity
            <span className="gantt-print-swatch gantt-print-bar gantt-print-critical" /> Critical
            <span className="gantt-print-swatch gantt-print-ghost" /> Baseline
            <span className="gantt-print-swatch gantt-print-diamond" /> Milestone
          </p>
        </>
      )}
    </div>
  );
}

interface PrintRowProps {
  row: GanttActivityRow;
  anchorIso: string;
  pxPerDay: number;
  barDateSource: BarDateSource | undefined;
  chartPx: number;
  variance: BaselineVarianceRow | undefined;
  showVariance: boolean;
}

function PrintRow({
  row,
  anchorIso,
  pxPerDay,
  barDateSource,
  chartPx,
  variance,
  showVariance,
}: PrintRowProps): React.ReactElement {
  const { activity, depth } = row;
  const geometry = barGeometry(activity, anchorIso, pxPerDay, barDateSource);
  const ghost =
    showVariance && variance !== undefined ? baselineGeometry(variance, anchorIso, pxPerDay) : null;

  return (
    <tr style={{ height: PRINT_ROW_HEIGHT }}>
      {GANTT_COLUMNS.map((column, i) => (
        <td
          key={column.key}
          className={column.align === 'right' ? 'gantt-print-right' : undefined}
          style={i === 0 ? { paddingLeft: 4 + depth * 10 } : undefined}
        >
          <span className={activity.type === 'WBS_SUMMARY' ? 'gantt-print-summary' : undefined}>
            {column.value(activity)}
          </span>
        </td>
      ))}
      {showVariance ? <td className="gantt-print-right">{varianceText(variance)}</td> : null}
      <td className="gantt-print-chart" style={{ width: chartPx }}>
        {ghost === null ? null : (
          <span className="gantt-print-ghost" style={{ left: ghost.x, width: ghost.width }} />
        )}
        {geometry === null ? null : geometry.milestone ? (
          <span className="gantt-print-diamond" style={{ left: geometry.x }} />
        ) : (
          <>
            {geometry.floatWidth > 0 ? (
              <span
                className="gantt-print-float"
                style={{ left: geometry.x + geometry.width, width: geometry.floatWidth }}
              />
            ) : null}
            <span
              className={[
                'gantt-print-bar',
                activity.isCritical ? 'gantt-print-critical' : '',
                activity.type === 'WBS_SUMMARY' ? 'gantt-print-summary-bar' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: geometry.x, width: geometry.width }}
            >
              {geometry.progress > 0 ? (
                <span
                  className="gantt-print-progress"
                  style={{ width: `${geometry.progress * 100}%` }}
                />
              ) : null}
            </span>
          </>
        )}
      </td>
    </tr>
  );
}

export interface PrintGanttInput {
  /** The plan name (the print document title). */
  title: string;
  /** The subtitle line (e.g. "As of 2026-07-20"). */
  subtitle: string;
  activities: readonly ActivitySummary[];
  varianceByActivityId?: ReadonlyMap<string, BaselineVarianceRow> | undefined;
}

/**
 * Mount the printed programme, open the print dialog, and tear it down again — the shared
 * {@link mountPrintDocument} lifecycle. Synchronous: unlike the diagram path there is no image to
 * rasterise first, because a DOM Gantt is already printable.
 */
export function printGanttSchedule(input: PrintGanttInput, deps: PrintDocumentDeps = {}): void {
  mountPrintDocument(
    <GanttPrintSurface
      title={input.title}
      subtitle={input.subtitle}
      activities={input.activities}
      {...(input.varianceByActivityId ? { varianceByActivityId: input.varianceByActivityId } : {})}
    />,
    deps,
  );
}

/**
 * The derived **Unassigned** grouping line on paper. No bar: the printed programme reads across a
 * fitted page and a bracket for a group that has no dates of its own would compete with the bars
 * that do. The label and its count are what a reader needs — that this work exists and is not
 * filed.
 */
function PrintBucketRow({
  row,
  chartPx,
  showVariance,
}: {
  row: GanttBucketRow;
  chartPx: number;
  showVariance: boolean;
}): React.ReactElement {
  return (
    <tr style={{ height: PRINT_ROW_HEIGHT }}>
      <td colSpan={GANTT_COLUMNS.length + (showVariance ? 1 : 0)} style={{ paddingLeft: 4 }}>
        <span className="gantt-print-summary">
          {row.label} ({row.count})
        </span>
      </td>
      <td className="gantt-print-chart" style={{ width: chartPx }} />
    </tr>
  );
}
