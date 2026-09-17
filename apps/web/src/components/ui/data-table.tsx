import type { UseQueryResult } from '@tanstack/react-query';
import { Children, Fragment, isValidElement } from 'react';

import { Skeleton } from '@/components/ui/page/skeleton';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { cn } from '@/lib/utils';

/** A column definition for {@link DataTable}. */
export interface Column<T> {
  /** Header text; also the accessible header even when visually hidden. */
  header: string;
  /** Cell renderer for a row. */
  cell: (row: T) => React.ReactNode;
  /**
   * Render a control in the header cell instead of the {@link header} text — a select-all checkbox,
   * a sort trigger. The control must carry its own accessible name, because it replaces the text
   * that would otherwise have named the column. {@link header} is still required: it stays the
   * column's key and its identity in code.
   */
  headerCell?: () => React.ReactNode;
  /**
   * Visually hide the header (e.g. an actions column).
   *
   * **Ignored when {@link headerCell} is set** — the render takes `headerCell` first, so a column
   * declaring both gets the control and never the hidden text. Declaring both looks load-bearing
   * and is not (`docs/TECH_DEBT.md` #73), so don't: a `headerCell` control carries its own
   * accessible name, which is what the hidden text would have been for.
   */
  srHeader?: boolean;
  headClassName?: string;
  cellClassName?: string;
  /**
   * How wide this column may grow, declared as a PROPERTY OF THE CONTENT rather than as a number.
   *
   * - **`fit`** — take exactly what the content needs and surrender the rest. For a column whose
   *   values have a known, bounded shape: a weekday list, a code, a status, a date.
   * - **`bounded`** — may grow, up to a reading measure, then wrap. For prose that can be long.
   * - **`auto`** (the default) — no opinion; the browser distributes as it always has.
   *
   * **Why `fit` is `w-px whitespace-nowrap` and not a `rem` cap.** ADR-0145 M4-T2 capped four
   * columns with fixed widths — `md:w-44` for `Working days`, `md:w-24` for `Code` — and the
   * measurement behind them was real: they shortened the distance between a row's first and last
   * fact by 34-122px. What nothing asked was whether the content still rendered on ONE LINE inside
   * the cap. It does not. `"Mon, Tue, Wed, Thu, Fri, Sat"` needs 191px in a 176px column and
   * `NL-HYDROPUMP` needs 103px in a 96px one, so both wrap — while the table around them has
   * 271-518px of slack. **The remedy became the defect**, which is why this value is expressed as a
   * function of content: measured, a `fit` column takes 210px at a 1104px table and 210px at a
   * 1488px one, handing every pixel of the surplus to the free column beside it. A number chosen
   * against one measure has to be re-derived the next time the measure changes, and nobody does.
   *
   * **It is applied from `md:` upwards, and that is FC-6 rather than a preference.** Measured in
   * Chromium: a table whose columns are all `fit` renders **793px wide inside a 320px container**,
   * because `white-space: nowrap` has no fallback — a column that may not wrap and may not fit can
   * only push the table wider. The same content without `fit` stays inside the viewport and wraps.
   * So the columns shrink to fit on a desktop and are free to wrap below the breakpoint. "This is a
   * desktop app" is a design stance; WCAG 2.2 §1.4.10 Reflow is a merge requirement (CLAUDE.md §13).
   *
   * **It composes with `cellClassName` rather than replacing it**, which is what lets a caller
   * declare a width without restating `py-2 pr-4` — `docs/TECH_DEBT.md` #335's actual ask. The
   * blunter fix that row proposes (merge the override into the default with `cn` instead of
   * replacing it with `??`) is **deliberately not taken here**: ADR-0145 M4 declined it because
   * seven overrides omit `py-2` on purpose, and this epic re-took that decision rather than
   * inheriting it. Composing the width alone reaches #335's goal at no blast radius, so the risky
   * merge buys nothing this needs.
   */
  width?: 'fit' | 'bounded' | 'auto';
}

/**
 * The classes each `Column.width` contributes. Expressed once so a table cannot disagree with its
 * own skeleton — the loading state reuses a column's classes for exactly that reason.
 */
const WIDTH_CLASSES: Record<NonNullable<Column<unknown>['width']>, string> = {
  fit: 'md:w-px md:whitespace-nowrap',
  /**
   * `max-w-prose` — Tailwind's own 65ch reading measure, and **not an arbitrary `[48ch]`**, which is
   * what this was until the ADR-0097 sizing ratchet refused it (FC-7: the ratchets do not rise).
   * The ratchet was right for the reason it exists: a one-off measure invented inside a primitive is
   * how a design system acquires a second scale. `ch` is still the unit that matters here — a
   * reading measure is a count of characters, so it stays right when the typeface changes — and the
   * scale already has one. It still WRAPS, which is the difference from `fit`.
   */
  bounded: 'md:max-w-prose',
  auto: '',
};

/** A column's head classes, its declared width composed with whatever the caller passed. */
function headClassesOf<T>(column: Column<T>): string {
  return cn(column.headClassName ?? 'py-2 pr-4 font-medium', WIDTH_CLASSES[column.width ?? 'auto']);
}

/** A column's cell classes, its declared width composed with whatever the caller passed. */
function cellClassesOf<T>(column: Column<T>): string {
  return cn(column.cellClassName ?? 'py-2 pr-4', WIDTH_CLASSES[column.width ?? 'auto']);
}

/**
 * How many skeleton rows a loading table shows.
 *
 * Three, matching `ListRowSkeleton`'s default — enough to read as a list rather than a single
 * misplaced row, few enough that a short list does not shrink when the real rows arrive. Not a
 * prop: a caller cannot know how many rows the server will return, so a number chosen per call
 * site would be guessing with extra steps (CQ-4).
 */
const SKELETON_ROWS = 3;

/**
 * Is this `empty` node one the caller deliberately left blank?
 *
 * Narrow on purpose: a `<></>` with nothing in it, which is what a call site writes when the state
 * has nothing to say. Anything else — text, an element, a conditional that happens to render
 * nothing at runtime — is framed, because React cannot tell us what a node renders without
 * rendering it, and guessing would make the frame's presence depend on data.
 */
function isEmptyNode(empty: React.ReactNode): boolean {
  return (
    isValidElement(empty) &&
    empty.type === Fragment &&
    Children.count((empty.props as { children?: React.ReactNode }).children) === 0
  );
}

/**
 * The dashed frame every resource list's empty state sits in.
 *
 * One constant rather than fourteen copies of the same class string
 * (`docs/specs/empty-state-consolidation/`). Exported so a surface that legitimately renders an
 * empty state OUTSIDE a `DataTable` — a panel, a dialog — reaches for the same thing rather than
 * writing it again, which is how the fourteen happened.
 */
export const EMPTY_FRAME =
  'border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm';

/**
 * The single table primitive (DESIGN_SYSTEM.md → Tables). Renders the shared
 * loading / error-with-retry / empty / populated states so every resource list
 * behaves identically. Pass a `react-query` result and column definitions; the
 * caller supplies its own empty state (icon + copy + optional action).
 */
export function DataTable<T>({
  caption,
  columns,
  query,
  getRowKey,
  renderDetail,
  empty,
  loadingLabel,
  errorLabel = 'Couldn’t load this list. Please try again.',
  describedById,
}: {
  caption: string;
  columns: Column<T>[];
  /**
   * A `react-query` result, narrowed to what the states need. `refetch` is typed as returning
   * `unknown` rather than borrowed from `UseQueryResult` so an INFINITE query's result can be
   * adapted here too — its refetch resolves to a paged shape, and the retry button only ever
   * fires it. Widening the primitive beat giving the audit log a second table (ADR-0072).
   */
  query: Pick<UseQueryResult<T[]>, 'isPending' | 'isError' | 'data'> & { refetch: () => unknown };
  getRowKey: (row: T) => string;
  /**
   * An optional panel rendered as a SIBLING row beneath `row`, spanning every column.
   *
   * Return `null`/`undefined` for a row with nothing to disclose — the extra `<tr>` is then not
   * rendered at all, so a table that never discloses is byte-for-byte what it was before this
   * prop existed. The disclosure TRIGGER belongs in one of the row's own cells; this only provides
   * somewhere legal for the panel to live (see the comment at the render site).
   */
  renderDetail?: (row: T) => React.ReactNode;
  empty: React.ReactNode;
  loadingLabel: string;
  errorLabel?: string;
  /**
   * Id of prose that qualifies what the rows mean, associated with the scroll region.
   *
   * Reading order alone is not enough: this region is focusable and carries `role="region"`, so a
   * screen-reader user navigating by landmark lands *inside* the table having skipped whatever sits
   * above it. Where that prose is a safety caveat — "this does not mean they got in" — being
   * reachable only by reading serially is the wrong contract.
   */
  describedById?: string | undefined;
}): React.ReactElement {
  if (query.isPending) {
    // **A skeleton, not a spinner** (`docs/TECH_DEBT.md` #161(b),
    // `docs/specs/empty-state-consolidation/` M7). `docs/UX_STANDARDS.md` asks for a skeleton
    // wherever the content has a known shape, and a table's shape is known: it is this component's
    // own `columns`. That obligation has been written down since the archetypes were built —
    // `skeleton.tsx` says in as many words that each archetype owns its loading render because
    // "`DataTable` knows its own" — and was never built here, so seventeen resource lists span a
    // centred spinner and then reflow into a table.
    //
    // The header row is the real one, and the body is `columns.length` cells wide, because a
    // skeleton whose column count differs from the settled table reflows the page under the
    // reader's cursor — which is the defect a skeleton exists to prevent, not merely a cosmetic
    // mismatch. Each cell reuses its column's own `cellClassName` for the same reason.
    //
    // `loadingLabel` is KEPT and announced. It is required on every caller and `shoot.mjs` asserts
    // on it to photograph this state; deleting it would break the instrument that found the defect.
    // The material is `aria-hidden` (see `Skeleton`) so an assistive reader gets that one sentence
    // rather than a few dozen announced grey rectangles.
    return (
      <div aria-busy="true">
        <span className="sr-only" role="status">
          {loadingLabel}
        </span>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left">
                {columns.map((column) => (
                  <th key={column.header} scope="col" className={headClassesOf(column)}>
                    {column.srHeader ? <span className="sr-only">{column.header}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
                <tr key={rowIndex} className="border-border border-b">
                  {columns.map((column) => (
                    <td key={column.header} className={cellClassesOf(column)}>
                      <Skeleton className="h-3.5 w-full max-w-40" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (query.isError) {
    // The ONE failure shape (`components/ui/query-error-state.tsx`). `DataTable` consumes it rather
    // than rendering its own copy, which is the condition the extraction was taken on: a shared
    // component this primitive did not use would be two implementations of one shape held together
    // by a test, and they drift invisibly.
    return <QueryErrorState label={errorLabel} onRetry={() => void query.refetch()} />;
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    // **The empty state carries `describedById` too.** It used to return before the region below,
    // so the prose qualifying what these rows mean — the safety caveat on `/me/activity`, say —
    // reached a reader with rows and not a reader with none, which is the state where an
    // unexplained absence is most likely to be misread. No `role="region"` here: there is nothing
    // to scroll and nothing to label, so this associates the description with the copy itself.
    //
    // **The frame lives here, not at the call site** (`docs/specs/empty-state-consolidation/` M3).
    // Fourteen of the fifteen consumers hand-wrote the same dashed box around their own copy, which
    // is fourteen chances for one of them to drift and no way to change the treatment once. It goes
    // INSIDE the `aria-describedby` div rather than replacing it: `docs/TECH_DEBT.md` #93(d) records
    // the empty branch having once returned before that association existed, and a frame that
    // wrapped the outside would silently undo it.
    //
    // **It renders only when there is something to frame.** `staff.tsx:598` passes `empty={<></>}`,
    // and an unconditional frame turns that into a dashed rectangle containing nothing — the
    // primitive asserting an absence where the call site deliberately said nothing.
    //
    // The test is an EMPTY FRAGMENT specifically, not a general "does this render anything", which
    // React cannot answer without rendering. A truthiness check is wrong (`<></>` is a truthy
    // element) and so is `Children.count(empty)`, which returns 1 for a fragment because the
    // fragment IS the child — that was the first version, and the case below caught it.
    return (
      <div {...(describedById === undefined ? {} : { 'aria-describedby': describedById })}>
        {isEmptyNode(empty) ? empty : <div className={EMPTY_FRAME}>{empty}</div>}
      </div>
    );
  }

  return (
    // Focusable + labelled so a keyboard-only user can scroll a wide table
    // (WCAG 2.1.1); the caption names the region. A scroll container with a
    // `region` role is the recommended pattern here — the lint rule doesn't model it.
    <div
      className="overflow-x-auto"
      role="region"
      aria-label={caption}
      {...(describedById === undefined ? {} : { 'aria-describedby': describedById })}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            {columns.map((column) => (
              <th key={column.header} scope="col" className={headClassesOf(column)}>
                {column.headerCell ? (
                  column.headerCell()
                ) : column.srHeader ? (
                  <span className="sr-only">{column.header}</span>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const detail = renderDetail?.(row);
            return (
              <Fragment key={getRowKey(row)}>
                <tr className="border-border border-b">
                  {columns.map((column) => (
                    <td key={column.header} className={cellClassesOf(column)}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
                {/* **A SIBLING row with ONE cell spanning the table — never a non-cell child of the
                    row above.** `role="row"` (which a `<tr>` maps to) may contain only
                    `gridcell`/`columnheader`/`rowheader`, and putting a panel directly inside a row
                    is an `aria-required-children` violation axe rates CRITICAL — 110 of them shipped
                    in ADR-0095 M5 and were caught by a journey rather than by review.

                    Deliberately not a `treegrid`: that pattern buys roving tabindex and per-cell
                    navigation, which a detail panel with no per-cell actions does not need and
                    would have to hand-roll. A disclosure over a plain table is the APG pattern that
                    fits, and it needs no grid roles at all. */}
                {detail === undefined || detail === null ? null : (
                  <tr className="border-border border-b">
                    <td colSpan={columns.length} className="p-0">
                      {detail}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
