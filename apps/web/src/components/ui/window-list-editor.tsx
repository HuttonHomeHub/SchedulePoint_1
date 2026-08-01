import { Plus, X } from 'lucide-react';
import { useId, useRef } from 'react';

import { Button } from './button';

/** One row of the editor, as text — see `features/calendars/model/window-rows`. */
export interface WindowRowValue {
  start: string;
  end: string;
}

/** A per-row message, keyed by row index so it lands on the control that caused it. */
export interface WindowRowProblem {
  index: number;
  message: string;
}

/**
 * A list of working-time windows for one day, edited as `HH:MM` text rows.
 *
 * **One primitive, because windows are authored in two places** (ADR-0067 §2): the weekly pattern,
 * where a window belongs to a weekday, and a dated exception, where it belongs to a date. Two
 * editors would have to independently agree about ordering, overlap and midnight — a disagreement
 * that would be invisible, since each looks right alone and only a planner who authored the same
 * hours both ways would ever see them differ.
 *
 * **Times are text, not `<input type="time">`.** Storage ends a full day at 24:00 and the native
 * control maxes out at 23:59 (spec Q2). Reading `00:00` in an end field back as 24:00 was rejected:
 * it is read-time inference, and 00:00 is a legitimate start.
 *
 * Accessibility contract — every item here has shipped as a defect in this repository before, so
 * each is tested rather than assumed:
 * - the list is a `<ul>` (a set of things), not a `<table>` (no meaningful column relationships);
 * - each field's accessible name **begins with its visible column word** ("Start…", "End…"), so
 *   speech input matching what the eye reads works (WCAG 2.5.3 Label in Name);
 * - a row's error is `aria-describedby`-linked to both its fields, never merely printed beside
 *   them, and marked `aria-invalid`;
 * - removing a row moves focus deliberately — to the next row's start, or to Add when the list
 *   empties — rather than letting it fall to `<body>`;
 * - read-only renders the values as text with no controls at all, rather than disabled inputs.
 */
export function WindowListEditor({
  rows,
  onChange,
  legend,
  description,
  problems = [],
  readOnly = false,
  addLabel = 'Add hours',
  emptyLabel = 'Not worked.',
}: {
  rows: readonly WindowRowValue[];
  onChange: (rows: WindowRowValue[]) => void;
  /** Names the set for assistive technology, e.g. "Monday hours". Not rendered visually. */
  legend: string;
  /** Optional visible hint under the group. */
  description?: string;
  problems?: readonly WindowRowProblem[];
  readOnly?: boolean;
  addLabel?: string;
  emptyLabel?: string;
}): React.ReactElement {
  const baseId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const problemFor = (index: number): string | undefined =>
    problems.find((problem) => problem.index === index)?.message;

  const update = (index: number, patch: Partial<WindowRowValue>): void => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number): void => {
    onChange(rows.filter((_, i) => i !== index));
    // Focus after the DOM settles. Falling to `<body>` here is the classic "where am I now?" —
    // a screen-reader user loses the group entirely and a keyboard user restarts from the top.
    queueMicrotask(() => {
      const next = listRef.current?.querySelector<HTMLInputElement>('input[data-window-start]');
      (next ?? addRef.current)?.focus();
    });
  };

  if (readOnly) {
    return (
      <div role="group" aria-label={legend} className="flex flex-col gap-1.5">
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyLabel}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((row, index) => (
              <li key={index} className="text-sm">
                {row.start}–{row.end}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div role="group" aria-label={legend} className="flex flex-col gap-2">
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
      ) : (
        <ul ref={listRef} className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const problem = problemFor(index);
            const errorId = `${baseId}-error-${String(index)}`;
            // The accessible name leads with the visible column word so "Start" spoken aloud
            // matches the control a sighted user would point at (WCAG 2.5.3).
            const rowName = `${legend}, period ${String(index + 1)}`;
            return (
              <li key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    data-window-start
                    aria-label={`Start time — ${rowName}`}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? errorId : undefined}
                    value={row.start}
                    onChange={(event) => update(index, { start: event.target.value })}
                    className="border-input bg-background focus-visible:ring-ring w-24 rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  />
                  <span aria-hidden="true" className="text-muted-foreground">
                    –
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`End time — ${rowName}`}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? errorId : undefined}
                    value={row.end}
                    onChange={(event) => update(index, { end: event.target.value })}
                    className="border-input bg-background focus-visible:ring-ring w-24 rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${rowName}`}
                    onClick={() => remove(index)}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </div>
                {problem ? (
                  <p id={errorId} className="text-destructive-text text-sm">
                    {problem}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${addLabel} — ${legend}`}
          onClick={() => onChange([...rows, { start: '08:00', end: '17:00' }])}
        >
          <Plus aria-hidden="true" className="size-4" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
