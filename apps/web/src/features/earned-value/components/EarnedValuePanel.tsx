import type { EarnedValueActivity } from '@repo/types';
import { TrendingDown } from 'lucide-react';

import { isCostReadForbidden, useEarnedValue } from '../api/use-earned-value';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatMoney } from '@/lib/format-money';

/**
 * Format an Earned-Value index (SPI/CPI) for display: two decimal places, or an em dash when the
 * ratio is `null` (its divisor was zero — the read never emits `Infinity`). Matches the money
 * formatter's `—` sentinel so a table cell reads consistently whether the gap is a money or a ratio.
 */
function formatRatio(ratio: number | null): string {
  return ratio === null ? '—' : ratio.toFixed(2);
}

/** Round a performance percentage (0–100) to a whole number for display. */
function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

/**
 * An acronym with its full term exposed via a native `<abbr title>` — a screen-reader and hover
 * expansion for the EVM acronyms (BAC, PV, EV, …) the table headers and KPI sub-lines use, so the terms
 * are defined in place without a Tooltip primitive. `title` is the only mechanism that adds no visual
 * chrome; the visible text stays the compact acronym.
 */
function Abbr({ short, full }: { short: string; full: string }): React.ReactElement {
  return (
    <abbr title={full} className="no-underline">
      {short}
    </abbr>
  );
}

/**
 * A performance-index badge (SPI or CPI) that pairs the ratio with a **word + icon**, never colour
 * alone (WCAG 2.2 — 1.4.1 Use of Color): a ratio `< 1` is flagged "Behind"/"Over" with a
 * downward-trend icon and the critical token; `>= 1` (or `null`) reads as plain text. `behindLabel`
 * is the sub-1 word for this index (schedule vs. cost).
 */
function IndexValue({
  ratio,
  behindLabel,
}: {
  ratio: number | null;
  behindLabel: string;
}): React.ReactElement {
  const behind = ratio !== null && ratio < 1;
  if (!behind) {
    return <span className="tabular-nums">{formatRatio(ratio)}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{formatRatio(ratio)}</span>
      <Badge variant="critical" size="sm">
        <TrendingDown aria-hidden="true" className="mr-1 size-3" />
        {behindLabel}
      </Badge>
    </span>
  );
}

/** One headline KPI tile: a label, a large value, and an optional sub-line (e.g. a variance). */
function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="border-border flex flex-col gap-1 rounded-lg border p-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {/* A second <dd> (a definition list allows many per <dt>), not a <p>: a <div> grouped inside
          a <dl> may only contain <dt>/<dd>, so the sub-line must be a <dd> to keep the list valid
          (axe definition-list / WCAG 1.3.1). */}
      {sub ? <dd className="text-muted-foreground text-xs">{sub}</dd> : null}
    </div>
  );
}

/**
 * The plan **Earned-Value** analysis (EV4b, ADR-0042): headline KPI tiles for the plan total (SPI,
 * CPI, EAC, and the BAC/EV/AC/VAC money figures) and a per-activity + WBS table (BAC, PV, EV, AC, SV,
 * CV, SPI, CPI, EAC). A pure read from `GET …/schedule/earned-value` — it schedules nothing.
 *
 * States (docs/UX_STANDARDS.md): loading spinner; a **restricted** notice when the caller lacks
 * `cost:read` (a 403 → non-Planner, NOT a generic error); a retryable error for any other failure; an
 * empty state when the plan has no activities. Money is rendered via {@link formatMoney} (integer minor
 * units → the plan currency); ratios show two decimals, a `null` ratio as an em dash. Behind-schedule /
 * over-budget indices are flagged with a word + icon, never colour alone (WCAG 2.2 AA).
 *
 * Activity names come from the route-composed `activities` list (like the tables/dialogs elsewhere), so
 * the feature stays dependency-free of the activities feature; absent a match, the row shows a short id.
 */
export function EarnedValuePanel({
  orgSlug,
  planId,
  activities = [],
}: {
  orgSlug: string;
  planId: string;
  /** The plan's activities, for resolving each EV row's display name (route-composed). */
  activities?: { id: string; name: string; code: string | null }[];
}): React.ReactElement {
  const query = useEarnedValue(orgSlug, planId);

  const shell = (children: React.ReactNode) => (
    <section aria-label="Earned value" className="flex flex-col gap-4">
      {children}
    </section>
  );

  if (query.isPending) return shell(<Spinner label="Loading earned value…" />);

  if (query.isError) {
    if (isCostReadForbidden(query.error)) {
      // `role="status"` so a screen-reader user not focused on the panel still hears the permission
      // boundary when the query resolves from the loading spinner (WCAG 4.1.3) — matching the sibling
      // async-resolved notices (EditLockBanner, ActivityResourcesDialog).
      return shell(
        <div
          role="status"
          className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm"
        >
          <p className="text-foreground font-medium">Cost &amp; earned value is restricted</p>
          <p className="mt-1">
            Only Planners and Org Admins can view cost and earned-value figures for this plan.
          </p>
        </div>,
      );
    }
    return shell(
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-destructive-text text-sm">
          Couldn’t load earned value. Please try again.
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>,
    );
  }

  const ev = query.data;
  const { total, currencyCode } = ev;
  const money = (minor: number | null) => formatMoney(minor, currencyCode);

  const nameById = new Map(activities.map((a) => [a.id, a] as const));
  const rowName = (row: EarnedValueActivity): string => {
    const activity = nameById.get(row.activityId);
    if (!activity) return row.activityId.slice(0, 8);
    return activity.code ? `${activity.code} · ${activity.name}` : activity.name;
  };

  // One declarative column spec drives both the header row and each body row, so the 11 columns stay in
  // step (a header and its cells can't drift apart) instead of two hand-maintained parallel lists. The
  // acronym headers carry an `<abbr>` so the EVM terms are defined in place (WCAG — labelled clearly).
  const numericHead = 'py-2 pr-4 text-right font-medium';
  const numericCell = 'py-2 pr-4 text-right tabular-nums';
  const columns: {
    key: string;
    header: React.ReactNode;
    headClassName: string;
    cellClassName: string;
    cell: (row: EarnedValueActivity) => React.ReactNode;
  }[] = [
    {
      key: 'name',
      header: 'Activity',
      headClassName: 'py-2 pr-4 font-medium',
      cellClassName: 'py-2 pr-4',
      cell: (row) => rowName(row),
    },
    {
      key: 'percent',
      header: '% complete',
      headClassName: numericHead,
      cellClassName: numericCell,
      cell: (row) => formatPercent(row.performancePercent),
    },
    {
      key: 'bac',
      header: <Abbr short="BAC" full="Budget at Completion" />,
      headClassName: numericHead,
      cellClassName: numericCell,
      cell: (row) => money(row.bac),
    },
    {
      key: 'pv',
      header: <Abbr short="PV" full="Planned Value" />,
      headClassName: numericHead,
      cellClassName: numericCell,
      cell: (row) => money(row.pv),
    },
    {
      key: 'ev',
      header: <Abbr short="EV" full="Earned Value" />,
      headClassName: numericHead,
      cellClassName: numericCell,
      cell: (row) => money(row.ev),
    },
    {
      key: 'ac',
      header: <Abbr short="AC" full="Actual Cost" />,
      headClassName: numericHead,
      cellClassName: numericCell,
      cell: (row) => money(row.ac),
    },
    {
      key: 'sv',
      header: <Abbr short="SV" full="Schedule Variance" />,
      headClassName: numericHead,
      cellClassName: numericCell,
      cell: (row) => money(row.sv),
    },
    {
      key: 'cv',
      header: <Abbr short="CV" full="Cost Variance" />,
      headClassName: numericHead,
      cellClassName: numericCell,
      cell: (row) => money(row.cv),
    },
    {
      key: 'spi',
      header: <Abbr short="SPI" full="Schedule Performance Index" />,
      headClassName: numericHead,
      cellClassName: 'py-2 pr-4 text-right',
      cell: (row) => (
        <span className="inline-flex justify-end">
          <IndexValue ratio={row.spi} behindLabel="Behind" />
        </span>
      ),
    },
    {
      key: 'cpi',
      header: <Abbr short="CPI" full="Cost Performance Index" />,
      headClassName: numericHead,
      cellClassName: 'py-2 pr-4 text-right',
      cell: (row) => (
        <span className="inline-flex justify-end">
          <IndexValue ratio={row.cpi} behindLabel="Over" />
        </span>
      ),
    },
    {
      key: 'eac',
      header: <Abbr short="EAC" full="Estimate at Completion" />,
      headClassName: numericHead,
      cellClassName: numericCell,
      cell: (row) => money(row.eac),
    },
  ];

  return shell(
    <>
      {currencyCode === null ? (
        <p className="text-muted-foreground text-sm">
          No plan currency set — figures show with no currency symbol. Set one in the plan’s
          Earned-Value settings.
        </p>
      ) : null}
      {ev.costBaselineMissing ? (
        <p className="text-muted-foreground text-sm">
          No active cost baseline — Planned Value falls back to the live budget.
        </p>
      ) : null}
      {ev.costWarningCount > 0 ? (
        <p className="text-warning-text text-sm">
          {ev.costWarningCount} {ev.costWarningCount === 1 ? 'activity has' : 'activities have'}{' '}
          booked cost while not started — review the actuals.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile
          label="Schedule Performance Index"
          value={<IndexValue ratio={total.spi} behindLabel="Behind" />}
          sub={
            <>
              <Abbr short="SV" full="Schedule Variance" /> {money(total.sv)}
            </>
          }
        />
        <KpiTile
          label="Cost Performance Index"
          value={<IndexValue ratio={total.cpi} behindLabel="Over" />}
          sub={
            <>
              <Abbr short="CV" full="Cost Variance" /> {money(total.cv)}
            </>
          }
        />
        <KpiTile
          label="Estimate at Completion"
          value={money(total.eac)}
          sub={
            <>
              <Abbr short="VAC" full="Variance at Completion" /> {money(total.vac)}
            </>
          }
        />
        <KpiTile label="Budget at Completion" value={money(total.bac)} />
        <KpiTile label="Earned Value" value={money(total.ev)} />
        <KpiTile label="Actual Cost" value={money(total.ac)} />
      </dl>

      {ev.activities.length === 0 ? (
        // `role="status"` so the resolved empty state is announced when the query settles (WCAG 4.1.3).
        <div
          role="status"
          className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm"
        >
          No activities to measure yet. Add activities with cost or resources, then Recalculate.
        </div>
      ) : (
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Earned value by activity"
          // Focusable + labelled scroll container so a keyboard-only user can scroll the wide table
          // (WCAG 2.1.1); the caption names the region — mirrors the shared DataTable primitive. The
          // inline disable stays on the `tabIndex` line so Prettier can't split it off (a11y review).
          tabIndex={0 /* eslint-disable-line jsx-a11y/no-noninteractive-tabindex */}
        >
          <table className="w-full text-sm">
            <caption className="sr-only">Earned value by activity</caption>
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left">
                {columns.map((column) => (
                  <th key={column.key} scope="col" className={column.headClassName}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ev.activities.map((row) => (
                <tr key={row.activityId} className="border-border border-b">
                  {columns.map((column) => (
                    <td key={column.key} className={column.cellClassName}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
}
