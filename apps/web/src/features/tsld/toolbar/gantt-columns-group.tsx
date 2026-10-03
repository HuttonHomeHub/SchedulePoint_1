import { useId, useState } from 'react';

import type { TsldToolbarContext } from './tsld-toolbar-context';

import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { COLUMN_MAX, COLUMN_MIN, isResizableKey } from '@/features/gantt/layout/column-widths';
import { GANTT_COLUMN_LABELS } from '@/features/gantt/layout/grid-columns';
import { HIDEABLE_COLUMNS } from '@/features/gantt/model/gantt-view-state';

/** The step of the arrow keys on a width field — `PanelResizer`'s, so the two controls agree. */
const WIDTH_STEP = 16;

type GanttColumnsBundle = NonNullable<TsldToolbarContext['ganttColumns']>;

/**
 * **One typed width** (ADR-0173) — a native spinbutton, because a typed number is the keyboard,
 * screen-reader and single-pointer route to what a drag reaches (WCAG 2.1.1, 2.5.7).
 *
 * **Applies on Enter, blur or an arrow step — never per keystroke.** A field that applied as it was
 * typed would clamp the first digit of `160` to the 48 px minimum and snap the text out from under
 * the cursor. Out of range clamps and shows the clamped value; non-numeric reverts to the current
 * width.
 *
 * The arrows are handled here rather than left to the browser's step so a step APPLIES (the browser
 * would only change the draft); the toolbar's key veto already yields ArrowUp/Down to a number input
 * (`OWNS_ALL_KEYS`), so this does not fight it.
 */
function WidthField({
  label,
  value,
  min,
  max,
  hintId,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  hintId: string;
  onCommit: (width: number) => void;
}): React.ReactElement {
  const id = useId();
  // `null` while the field shows the committed value; a string only between typing and committing.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number): number => Math.min(max, Math.max(min, Math.round(n)));

  const commit = (raw: string): void => {
    setDraft(null);
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    onCommit(clamp(n));
  };

  return (
    <div className="flex items-center gap-2 pl-6">
      <label htmlFor={id} className="text-muted-foreground min-w-0 flex-1 text-sm">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={WIDTH_STEP}
        value={draft ?? String(value)}
        aria-describedby={hintId}
        className="w-24"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          if (draft !== null) commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(event.currentTarget.value);
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const typed = Number(event.currentTarget.value);
            const from =
              Number.isFinite(typed) && event.currentTarget.value.trim() !== '' ? typed : value;
            commit(String(clamp(from + (event.key === 'ArrowUp' ? WIDTH_STEP : -WIDTH_STEP))));
          }
        }}
      />
      <span aria-hidden="true" className="text-muted-foreground text-sm">
        px
      </span>
    </div>
  );
}

/**
 * **The Gantt's Columns group** (ADR-0095 M5-T1, widths ADR-0173): which columns show, how wide each
 * is, how wide the table is, and a way back to standard.
 *
 * A width field appears **only for a shown column** — a hidden column has nothing to size, and it
 * returns at the width last given because the stored width is not forgotten when it hides.
 */
export function GanttColumnsGroup({
  columns,
}: {
  columns: GanttColumnsBundle;
}): React.ReactElement {
  const columnHintId = useId();
  const tableHintId = useId();
  const resetReasonId = useId();

  return (
    <div className="flex flex-col gap-2">
      {HIDEABLE_COLUMNS.map((key) => {
        const shown = !columns.hidden.has(key);
        return (
          <div key={key} className="flex flex-col">
            <CheckboxField
              label={GANTT_COLUMN_LABELS[key]}
              density="compact"
              checked={shown}
              onChange={() => {
                const next = new Set(columns.hidden);
                if (shown) next.add(key);
                else next.delete(key);
                columns.setHidden(next);
              }}
            />
            {shown && isResizableKey(key) ? (
              <WidthField
                label={`${GANTT_COLUMN_LABELS[key]} width`}
                value={columns.widths[key]}
                min={COLUMN_MIN}
                max={COLUMN_MAX}
                hintId={columnHintId}
                onCommit={(width) => columns.setWidth(key, width)}
              />
            ) : null}
          </div>
        );
      })}
      <p id={columnHintId} className="text-muted-foreground text-xs">
        Column widths are {COLUMN_MIN} to {COLUMN_MAX} pixels.
      </p>
      <div className="border-border flex flex-col gap-1 border-t pt-2">
        <WidthField
          label="Table width"
          value={columns.table.size}
          min={columns.table.min}
          max={columns.table.max}
          hintId={tableHintId}
          onCommit={columns.table.setSize}
        />
        <p id={tableHintId} className="text-muted-foreground pl-6 text-xs">
          {columns.table.min} to {columns.table.max} pixels, the same as dragging the divider.
        </p>
      </div>
      {/* Shaded rather than disabled (ADR-0082): it stays focusable so its reason is reachable. The
          guard is on the handler, `aria-disabled` is what a screen reader hears. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-disabled={columns.isDefault || undefined}
        aria-describedby={columns.isDefault ? resetReasonId : undefined}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onClick={() => {
          if (!columns.isDefault) columns.reset();
        }}
      >
        Reset widths
      </Button>
      {columns.isDefault ? (
        <p id={resetReasonId} className="text-muted-foreground text-xs">
          Already at standard widths
        </p>
      ) : null}
    </div>
  );
}
