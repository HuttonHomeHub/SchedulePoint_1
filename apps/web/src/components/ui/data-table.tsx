import type { UseQueryResult } from '@tanstack/react-query';
import { Children, Fragment, isValidElement, memo } from 'react';

import { DataTableWindowedBody } from './data-table-windowed-body';

import { Skeleton } from '@/components/ui/page/skeleton';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { cn } from '@/lib/utils';

/** A column definition for {@link DataTable}. */
export interface Column<T> {
  /** Header text; also the accessible header even when visually hidden. */
  header: string;
  /**
   * Cell renderer for a row.
   *
   * `DataTable` memoises each row on row identity and `columns` identity, so a host that memoises
   * `columns` also stops its rows re-rendering. **If you memoise `columns`, every input a cell reads
   * must be in the memo deps or be read through a subscribing leaf** — a cell closing over anything
   * else keeps showing the value it saw when the array was last rebuilt (`ActivitiesTable`
   * subscribes its checkbox and menu trigger to a per-table store for exactly this reason).
   */
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
  /**
   * **`auto` contributes no class, and since `docs/TECH_DEBT.md` #344 it is still not nothing.**
   *
   * ADR-0146 D3's rule is that `auto` must be *written down* even though it is also the default,
   * because a rule whose exception is its default is vacuous unless somebody declares the
   * exception. That was prose: `WIDTH_CLASSES.auto` is `''`, so a column declared `auto` and a
   * column that never mentioned `width` rendered **identical DOM** and no instrument could tell
   * them apart.
   *
   * It has to be able to. The wrap gate's whole discriminator is *declared* `auto` (a deliberate,
   * reasoned wrap — the audit log's three columns) versus `auto` **by omission** (a wrap nobody
   * decided — Members' five). The tempting alternative, gating on whether the table has spare
   * width, was measured and is worthless: **zero of the nine wraps in the measured estate sit in a
   * table with positive slack** (`docs/specs/table-wrap-coverage/m0/README.md` §2), so a
   * slack-gated rule fires on nothing at all and excuses the defect and the legitimate case alike.
   *
   * So the declaration is emitted as `data-col-width` on every `<th>` and `<td>`. The cost is
   * stated plainly: **it makes `width: 'auto'` load-bearing**, and deleting one of the audit log's
   * three declarations now turns a gate red instead of being invisible. That is the point — but it
   * means "this line changes no CSS" is no longer the whole truth about `auto`, and this comment is
   * where a reader finds that out.
   */
  auto: '',
};

/** A column's head classes, its declared width composed with whatever the caller passed. */
/**
 * **The width preset is composed LAST, so it wins a same-modifier collision.**
 *
 * `cn` is `tailwind-merge`, so on a conflict the later class survives: a caller writing
 * `cellClassName="md:max-w-40"` beside `width: 'bounded'` gets `md:max-w-prose`, not its own cap.
 * That is the opposite precedence from `SearchField`'s `cn(defaults, className)`, where the caller
 * wins, and from this repository's usual "className extends, never clobbers" habit — so it is
 * stated rather than left for the next author to discover. No consumer collides today (checked
 * across every `cellClassName`/`headClassName` in the tree at M8), which is why this is a docblock
 * and a test rather than a change.
 *
 * It is the right way round for what `width` is: a declaration about the COLUMN's role in the
 * table's arithmetic (FC-2), which a per-cell class has no business silently overriding. A caller
 * who genuinely wants their own cap says `width: 'auto'` and owns it.
 */
function headClassesOf<T>(column: Column<T>): string {
  return cn(column.headClassName ?? 'py-2 pr-4 font-medium', WIDTH_CLASSES[column.width ?? 'auto']);
}

/** A column's cell classes, its declared width composed with whatever the caller passed. */
function cellClassesOf<T>(column: Column<T>): string {
  return cn(column.cellClassName ?? 'py-2 pr-4', WIDTH_CLASSES[column.width ?? 'auto']);
}

/**
 * **The skeleton gets the caller's classes and NOT the declared width, and that is the opposite of
 * the obvious thing.**
 *
 * `fit` works by making a cell's min-content width equal to its text's single-line width. The
 * skeleton has no text: its `<th>` renders nothing at all (the header material is `aria-hidden`
 * placeholder, deliberately) and its `<td>` holds a contentless block with a percentage width,
 * which contributes nothing to intrinsic sizing. So a `fit` column applied to the skeleton has
 * nothing to fit and collapses to its 1px floor.
 *
 * **Measured in Chromium before this was split out**, on the Calendars table at 1646: `Working
 * days` rendered **16px while loading and 190px settled**, and `Actions` rendered **0px** — the
 * table visibly reflowing the instant the rows arrived, which is the exact defect a skeleton exists
 * to prevent. Raised by the component review as a mechanism; the numbers are why it was fixed
 * rather than noted.
 *
 * The caller's own `cellClassName` is still honoured, so a hidden-below-`lg` column stays hidden in
 * the skeleton too and the row keeps its column count.
 */
function skeletonClassesOf<T>(column: Column<T>, kind: 'head' | 'cell'): string {
  return kind === 'head'
    ? (column.headClassName ?? 'py-2 pr-4 font-medium')
    : (column.cellClassName ?? 'py-2 pr-4');
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
 * One body row (plus its optional detail sibling), memoised on **row identity and column identity**
 * (`docs/TECH_DEBT.md` #334, M2-F2).
 *
 * `DataTable` re-renders whenever its host does, and at 2,000 rows that meant re-running every cell
 * renderer for a change that touched one row. A host that keeps `columns` referentially stable and
 * keeps a row's volatile state out of the cell closures (`ActivitiesTable` mounts small
 * self-subscribing leaves) now costs the unchanged rows one shallow compare each.
 *
 * **It is identity-neutral for every other call site**, which is the condition this shared primitive
 * was changed on: they declare `columns` inline, so the array is new on every render, the compare
 * never hits, and the row renders exactly as it did — plus the compare. Nor does it change the DOM:
 * the `<tr>`s are the same siblings the keyed `Fragment` produced, in the same order.
 *
 * `detail` is compared by identity too, so a table that uses `renderDetail` (whose node is new each
 * call) re-renders its rows as before; a table that does not passes `undefined` and can skip.
 * Cast because `memo` erases a component's type parameter.
 */
const DataTableRow = memo(function DataTableRow<T>({
  row,
  columns,
  contained,
  detail,
  virtualIndex,
  measureRef,
}: {
  row: T;
  columns: Column<T>[];
  contained: boolean;
  detail: React.ReactNode;
  virtualIndex?: number | undefined;
  measureRef?: ((node: HTMLTableRowElement | null) => void) | undefined;
}): React.ReactElement {
  return (
    <>
      {/* `virtualIndex` and `measureRef` are set only by the windowed mode (ADR-0165): the row's
        place in the table for `aria-rowindex` (the header is row 1) and the virtualizer's hook to
        measure its real height. Both are `undefined` for every other table, and an `undefined`
        attribute renders nothing, so their DOM is what it always was. */}
      <tr
        className={contained ? '' : 'border-border border-b'}
        ref={measureRef}
        data-index={virtualIndex}
        aria-rowindex={virtualIndex === undefined ? undefined : virtualIndex + 2}
      >
        {columns.map((column) => (
          <td
            key={column.header}
            className={
              contained
                ? cn(cellClassesOf(column), 'border-border border-b')
                : cellClassesOf(column)
            }
            data-col-width={column.width ?? 'undeclared'}
          >
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
        fits, and it needs no grid roles at all.

        `contained` moves this row's own border onto its cell too — `border-separate`
        does not render a `<tr>`'s border in any engine this table targets, so leaving
        it here would silently drop the rule the moment `scroll="contained"` is set. */}
      {detail === undefined || detail === null ? null : (
        <tr className={contained ? '' : 'border-border border-b'}>
          <td
            colSpan={columns.length}
            className={contained ? cn('p-0', 'border-border border-b') : 'p-0'}
          >
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}) as <T>(props: {
  row: T;
  columns: Column<T>[];
  contained: boolean;
  detail: React.ReactNode;
  virtualIndex?: number | undefined;
  measureRef?: ((node: HTMLTableRowElement | null) => void) | undefined;
}) => React.ReactElement;

/** What every {@link DataTable} takes, however it scrolls. */
interface DataTableBaseProps<T> {
  caption: string;
  /**
   * Column definitions. Keep the array referentially stable to let unchanged rows skip rendering,
   * and see {@link Column.cell} for what that obliges a cell to do. An inline array is always safe
   * and re-renders every row on each parent render, as before.
   */
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
  /**
   * Who scrolls: the PAGE (default) or this REGION (`docs/specs/activities-panel-scale/`,
   * TECH_DEBT #334).
   *
   * - **`'page'`** — today's DOM, byte for byte (SC-4). The region stays `overflow-x-auto` alone;
   *   nothing bounds its height, so `overflow-y` computes to `auto` per CSS Overflow 3 §3 but the
   *   region never actually scrolls vertically because an ancestor already does. The header is not
   *   pinned — `position: sticky` sticks within its nearest **scrollport**, and this region is not
   *   one on that axis, so a sticky header here would be **inert**: it would type-check, pass every
   *   jsdom suite, and change nothing a planner can see (the ADR-0064 §7 dead-end shape).
   * - **`'contained'`** — this table owns BOTH axes. The region fills its parent (`min-h-0 flex-1`),
   *   the header pins to the region's top with the page background, and the region carries
   *   `scroll-padding-top` so a Shift+Tabbed control scrolls in **below** the header rather than
   *   entirely behind it (WCAG 2.2 §2.4.11). Use this only inside a HEIGHT-CAPPED pane —
   *   `ActivitiesTable` is the one call site that needs it; the other 23 sit in ordinary page flow,
   *   where a bounded scroller would be exactly as inert as an unpinned header in a bounded one.
   *
   * **One prop rather than a separate `stickyHeader` boolean**, deliberately: a sticky header with
   * no bounded scroll to pin against is the inert combination above, and a second boolean would make
   * it representable. Binding the two removes the dead-end rather than documenting around it.
   *
   * **The border rule moves from the row to the cell in `'contained'` mode, and that is a real-browser
   * question this change could not answer — no Playwright run backs it (owed; see
   * `docs/specs/activities-panel-scale/m1-premise.md`).** Tailwind's Preflight sets
   * `border-collapse: collapse` on every `<table>`; whether a collapsed-model row border survives a
   * `sticky` cell is engine-dependent. So `'contained'` switches to `border-separate
   * border-spacing-0` and draws the header rule on each `<th>` and each row's rule on its `<td>`s —
   * the spec's stated safe default when the three-engine check has not been run, composed with the
   * caller's `headClassName`/`cellClassName` the way `width` already composes.
   */
  scroll?: 'page' | 'contained';
}

/**
 * The windowed mode's contract, as a type (ADR-0165 D6). Intersected with
 * {@link DataTableBaseProps}, so `windowed: true` narrows `scroll` to `'contained'` (windowing needs
 * a bounded scroller) and `renderDetail` to `never` (variable-height detail rows defeat a row
 * estimate). A caller who writes either wrong gets a compile error, not a runtime warning.
 */
type DataTableModeProps =
  | {
      /**
       * Render only the rows in view (ADR-0165, `docs/TECH_DEBT.md` #334 M3). **Opt-in, and it
       * carries costs, so the default is off.**
       *
       * - **Find-in-page cannot find a row that is not in view**, and a screen reader's table
       *   navigation reaches it only as the window moves. The product owner accepted both for the
       *   activities panel (ADR-0165, CQ-B), where the diagram's listbox stays the complete route.
       *   Do not switch this on for a table whose rows people search with Ctrl+F.
       * - **Column widths are measured from the first window and frozen** (D1), so a longer value
       *   that scrolls into view wraps rather than widening its column. `width: 'fit'` means "the
       *   first window's width" here, which amends ADR-0146 for a windowed table.
       * - `aria-rowcount` and `aria-rowindex` say where each row is. That is reasoned from ARIA 1.2,
       *   not observed with a screen reader.
       *
       * Valid only with `scroll="contained"`, and not with `renderDetail`.
       *
       * **It must be the literal `true`.** The type union that enforces the two rules above is
       * discriminated on it, so a `boolean` variable does not compile, by design.
       */
      windowed?: false | undefined;
    }
  | {
      windowed: true;
      scroll: 'contained';
      renderDetail?: never;
    };

/** {@link DataTable}'s props. */
export type DataTableProps<T> = DataTableBaseProps<T> & DataTableModeProps;

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
  scroll = 'page',
  windowed = false,
}: DataTableProps<T>): React.ReactElement {
  // `scroll` shapes only the populated table below. The loading, error and empty branches return
  // before it is read, and need no scroller of their own: each is a bounded, short block (a
  // three-row skeleton or a sentence) that fits inside the smallest open panel.
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
                  <th key={column.header} scope="col" className={skeletonClassesOf(column, 'head')}>
                    {column.srHeader ? <span className="sr-only">{column.header}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
                <tr key={rowIndex} className="border-border border-b">
                  {columns.map((column) => (
                    <td key={column.header} className={skeletonClassesOf(column, 'cell')}>
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

  const contained = scroll === 'contained';
  const tableClassName = contained
    ? 'w-full border-separate border-spacing-0 text-sm'
    : 'w-full text-sm';
  // Built once for both modes, so a windowed table's header is the one a plain table renders.
  const head = (
    <thead>
      <tr
        // Row 1 of the windowed table's `aria-rowcount` (ADR-0165 D2); no other table sets it.
        aria-rowindex={windowed ? 1 : undefined}
        className={
          contained
            ? 'text-muted-foreground text-left'
            : 'border-border text-muted-foreground border-b text-left'
        }
      >
        {columns.map((column) => (
          <th
            key={column.header}
            scope="col"
            className={
              contained
                ? cn(
                    headClassesOf(column),
                    'bg-background border-border sticky top-0 z-20 border-b',
                  )
                : headClassesOf(column)
            }
            data-col-width={column.width ?? 'undeclared'}
          >
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
  );

  return (
    // Focusable + labelled so a keyboard-only user can scroll a wide table
    // (WCAG 2.1.1); the caption names the region. A scroll container with a
    // `region` role is the recommended pattern here — the lint rule doesn't model it.
    //
    // `contained`'s classes are a LITERAL ternary rather than routed through `cn()`: the `'page'`
    // branch must stay the exact string it always was (SC-4), never a functionally-equivalent
    // reordering `cn()` could produce.
    //
    // `min-h-32` (128px — the header and about three rows) is `contained`'s floor. Without it the
    // region shrinks to whatever its siblings leave, and in the activities panel's default 280px a
    // selection's bulk-assign bar left 50px: the header and no rows at all (measured 2026-09-28).
    // With the floor the region keeps its rows and the host scrolls the rest (see its body div).
    // From `md` up only: the single-pane narrow layout gives the whole panel body ~89px at 390,
    // less than the floor itself, so there it would make the body scroll with nothing selected.
    <div
      className={
        contained ? 'min-h-0 flex-1 scroll-pt-12 overflow-auto md:min-h-32' : 'overflow-x-auto'
      }
      role="region"
      aria-label={caption}
      {...(describedById === undefined ? {} : { 'aria-describedby': describedById })}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      {windowed ? (
        <DataTableWindowedBody
          rows={rows}
          columns={columns}
          getRowKey={getRowKey}
          caption={caption}
          tableClassName={tableClassName}
          head={head}
          renderRow={(row, virtualIndex, measureRef) => (
            <DataTableRow
              key={getRowKey(row)}
              row={row}
              columns={columns}
              contained={contained}
              detail={undefined}
              virtualIndex={virtualIndex}
              measureRef={measureRef}
            />
          )}
        />
      ) : (
        <table className={tableClassName}>
          <caption className="sr-only">{caption}</caption>
          {head}
          <tbody>
            {rows.map((row) => (
              <DataTableRow
                key={getRowKey(row)}
                row={row}
                columns={columns}
                contained={contained}
                detail={renderDetail?.(row)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
