import { useEffect, useId, useRef } from 'react';

import type { GanttCellGate } from '../model/cell-gate';

import { cn } from '@/lib/utils';

/**
 * **One grid cell: text a planner reads, or a field they are typing into.**
 *
 * ## Why the input is not always there
 *
 * A cell renders as **text** until it is the open one. Forty visible rows across six columns is 240
 * controls, and mounting an `<input>` for each would put 240 focusable nodes into a virtualized list
 * whose whole performance argument (ADR-0059) is that the live node count is bounded by the viewport
 * rather than the plan. It would also break that argument *invisibly*: the rows would still be
 * bounded, so the browser-measured row assertion would stay green while the tab order grew by a
 * factor of six.
 *
 * ## Read-only, never `disabled` (ADR-0083)
 *
 * A shut cell keeps its value at full contrast and dims only its chrome, keeps its place in the
 * grid, and carries `aria-readonly` — the ARIA property that exists for exactly this and means
 * something different from `aria-disabled`. Its reason is an `sr-only` sibling linked by
 * `aria-describedby`, not text sitting nearby: a reason a screen-reader user reaches only by
 * chance is a reason that was not given (ADR-0082's ruling, and the correction ADR-0073 C2.5 made
 * to a caveat reachable only by reading serially).
 *
 * That treatment is why the `['--muted', '--foreground']` pair went into
 * `token-contrast.test.ts` **before** this file existed: making a gated field readable removes the
 * 1.4.3 exemption `disabled:opacity-50` relies on, so the value has to clear 4.5:1 on the dimmed
 * fill rather than merely look faded.
 */

export interface GanttCellProps {
  /** What the cell reads when it is not being edited. */
  value: string;
  /**
   * The field's accessible name while it is open — the column AND the row, e.g. "Duration,
   * Foundations".
   *
   * **Required, not optional.** A bare `<input>` inside a `gridcell` has no accessible name at all:
   * a sighted planner reads the column header and the row above it, and a screen-reader user
   * arriving in edit mode is told only "edit text". Making it optional would let a caller ship that
   * silently, which is the shape this register keeps recording.
   */
  label: string;
  /** Column index for `aria-colindex` — the grid's own numbering, 1-based. */
  colIndex: number;
  width: number;
  align?: 'right' | undefined;
  gate: GanttCellGate;
  /** True when this exact cell is open for editing. */
  editing: boolean;
  /** The in-progress text. Only meaningful while `editing`. */
  text: string;
  /** True while the write is in flight — the field stays visible and stops accepting input. */
  busy?: boolean;
  /** Set when the last commit was refused; the planner's text is still in `text`. */
  errorMessage?: string | null;
  onBegin: () => void;
  onChange: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string | undefined;
  children?: React.ReactNode;
}

export function GanttCell({
  value,
  label,
  colIndex,
  width,
  align,
  gate,
  editing,
  text,
  busy = false,
  errorMessage = null,
  onBegin,
  onChange,
  onCommit,
  onCancel,
  className,
  children,
}: GanttCellProps): React.ReactElement {
  const reasonId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the field when it opens, and select its contents — a planner who pressed F2 to replace a
  // duration should be able to type immediately rather than clear first. Selecting is what a
  // spreadsheet does and is the difference between "5 d" needing one keystroke and needing four.
  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    input.select();
  }, [editing]);

  const describedBy =
    [gate.reason === null ? null : reasonId, errorMessage === null ? null : errorId]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div
      role="gridcell"
      aria-colindex={colIndex}
      // `-1`, so the cell is a programmatic focus target and NOT a tab stop. That is the APG
      // treegrid pattern — the grid owns focus and moves it into a cell on demand — and it is what
      // the epic's F2 cell mode needs. It also satisfies `jsx-a11y/interactive-supports-focus`,
      // which correctly refuses a `gridcell` carrying an activation handler with no way to reach it
      // from the keyboard: without this the double-click would be a pointer-only affordance.
      tabIndex={-1}
      // The ARIA property for "you may read this but not change it". Deliberately not
      // `aria-disabled`, which announces the cell as inoperable and is how a value a planner still
      // needs to READ gets treated as decoration.
      aria-readonly={gate.readOnly ? true : undefined}
      // **A sighted planner gets the reason too.** It was `sr-only` alone until the M6 ux gate,
      // which is the mirror of the defect ADR-0082 was written about: a reason nobody can reach.
      // "A summary rolls this up from the activities inside it" is not deducible from a dimmed
      // fill, and the two precedents in this tree disagreed with the omission — `ToolbarButton`
      // gives a shaded control a native `title`, and the `View ▾` lens toggles render the reason
      // visibly, with a comment saying a sighted planner needs it as much as a screen-reader one.
      {...(gate.readOnly && gate.reason !== null ? { title: gate.reason } : {})}
      {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
      className={cn(
        'shrink-0 truncate px-2 text-xs',
        align === 'right' && 'text-right tabular-nums',
        // Chrome dimmed, value not. `--muted` as the fill with `--foreground` text is the pair the
        // contrast matrix already validates across every theme and scope.
        gate.readOnly && 'bg-muted text-foreground',
        className,
      )}
      style={{ width }}
      onDoubleClick={gate.writable ? onBegin : undefined}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={text}
          readOnly={busy}
          aria-busy={busy || undefined}
          aria-label={label}
          className="bg-field text-field-foreground border-input h-6 w-full rounded border px-1"
          // Guarded as well as `readOnly`. The reducer already drops a `change` while committing, so
          // this is belt-and-braces — but the test that asserted "no callback while busy" failed
          // against the attribute alone: jsdom does not enforce `readOnly` for a programmatic value
          // set, and neither does anything that drives this component other than a real keyboard.
          // Making the assertion true beat weakening it to match.
          onChange={(event) => {
            if (busy) return;
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              // Stop the row's own handler seeing it — Enter on a Gantt row activates the row, and
              // committing a cell must not also change the selection out from under the planner.
              event.stopPropagation();
              onCommit();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              // Likewise: Escape belongs to the field that is open, which is ADR-0079's rule for
              // the search box applied to a cell. Without this the canvas-era window handler would
              // also disarm a tool the planner never armed.
              event.stopPropagation();
              onCancel();
              return;
            }
            if (event.key === 'Tab') {
              // Commit and let focus move — a spreadsheet's Tab saves, it does not discard.
              onCommit();
              return;
            }
            // **Every other navigation key belongs to the field while the field is open.**
            //
            // This was the M6 accessibility gate's first finding and it is a DATA-LOSS path, not a
            // nicety. The grid's own handler runs unconditionally on the bubbled event, so an
            // ArrowLeft meant to move the caret toggled the row's disclosure AND had its default
            // cancelled — and an ArrowUp moved real focus to another row while the reducer still
            // held this cell as `editing`, orphaning the typed text with no announcement. F2 on the
            // new row then overwrote it silently.
            //
            // `stopPropagation` only: the field's own default behaviour (caret movement, selection)
            // is exactly what should happen, so `preventDefault` would trade one broken key for
            // another. Same rule as Enter and Escape above — ADR-0079's "a key typed into a field
            // belongs to that field", which this component applied to two keys and not to six.
            if (
              event.key.startsWith('Arrow') ||
              event.key === 'Home' ||
              event.key === 'End' ||
              event.key === 'PageUp' ||
              event.key === 'PageDown'
            ) {
              event.stopPropagation();
            }
          }}
          onBlur={onCancel}
        />
      ) : (
        (children ?? value)
      )}

      {gate.reason === null ? null : (
        <span id={reasonId} className="sr-only">
          {gate.reason}
        </span>
      )}
      {errorMessage === null ? null : (
        <span id={errorId} className="text-destructive-text sr-only">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
