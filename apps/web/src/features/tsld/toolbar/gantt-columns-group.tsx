import { useId, useRef, useState } from 'react';

import type { TsldToolbarContext } from './tsld-toolbar-context';

import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { KEY_STEP } from '@/components/ui/panel-resizer';
import { clampSize } from '@/components/ui/use-resizable-panel-prefs';
import {
  CHART_MIN_WIDTH,
  COLUMN_MAX,
  COLUMN_MIN,
  isResizableKey,
} from '@/features/gantt/layout/column-widths';
import { GANTT_COLUMN_LABELS } from '@/features/gantt/layout/grid-columns';
import { HIDEABLE_COLUMNS } from '@/features/gantt/model/gantt-view-state';

type GanttColumnsBundle = NonNullable<TsldToolbarContext['ganttColumns']>;

/**
 * What to say when the width applied is not the width typed — **a typed value is never changed
 * silently** (ADR-0173). Three ways it can differ: nothing usable was typed, the number was outside
 * the field's bounds, or the bounds were fine and the chart guard limited it. Said in words, once,
 * in a polite status — a clamp is not an error, so nothing is marked invalid.
 */
function limitedNotice(
  subject: string,
  min: number,
  max: number,
  asked: number | null,
  applied: number,
): string | null {
  if (asked === null) return `${subject} not changed. Enter ${min} to ${max} pixels.`;
  if (applied === asked) return null;
  return asked < min || asked > max
    ? `${subject} limited to ${applied} px. Allowed range is ${min} to ${max} pixels.`
    : `${subject} limited to ${applied} px so the chart keeps at least ${CHART_MIN_WIDTH} px.`;
}

/**
 * **One typed width** (ADR-0173) — a native spinbutton, because a typed number is the keyboard,
 * screen-reader and single-pointer route to what a drag reaches (WCAG 2.1.1, 2.5.7).
 *
 * **A private component rather than `TextField`**, deliberately: it needs a draft that is held
 * between typing and committing, Escape to discard it, and an arrow step that applies — none of which
 * `TextField`'s public contract has, and changing that contract is outside this spec's scope.
 *
 * **Applies on Enter, blur or an arrow step — never per keystroke.** A field that applied as it was
 * typed would clamp the first digit of `160` to the 48 px minimum and snap the text out from under
 * the cursor. **Escape discards the draft** and the blur that closing the popover causes afterwards
 * must not commit it, which is what `discarded` is for.
 *
 * The arrows are handled here rather than left to the browser's step so a step APPLIES (the browser
 * would only change the draft); the toolbar's key veto already yields ArrowUp/Down to a number input
 * (`OWNS_ALL_KEYS`), so this does not fight it.
 */
function WidthField({
  subject,
  value,
  min,
  max,
  hintId,
  apply,
  onNotice,
}: {
  subject: string;
  value: number;
  min: number;
  max: number;
  hintId: string;
  /** Apply a width; returns the width actually applied. */
  apply: (width: number) => number;
  onNotice: (message: string | null) => void;
}): React.ReactElement {
  const id = useId();
  // `null` while the field shows the committed value; a string only between typing and committing.
  const [draft, setDraft] = useState<string | null>(null);
  const discarded = useRef(false);

  const commit = (raw: string): void => {
    setDraft(null);
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) {
      onNotice(limitedNotice(subject, min, max, null, value));
      return;
    }
    const asked = Math.round(n);
    onNotice(limitedNotice(subject, min, max, asked, apply(clampSize(asked, min, max))));
  };

  return (
    // `pl-6` insets the row to the text of the CheckboxField label above it, so a width field reads
    // as belonging to that column rather than as a sibling of the checkboxes.
    <div className="flex items-center gap-2 pl-6">
      <label htmlFor={id} className="text-muted-foreground min-w-0 flex-1 text-sm">
        {subject}
      </label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={KEY_STEP}
        value={draft ?? String(value)}
        aria-describedby={hintId}
        className="w-24"
        onChange={(event) => {
          discarded.current = false;
          setDraft(event.target.value);
        }}
        onBlur={(event) => {
          if (draft !== null && !discarded.current) commit(event.target.value);
          discarded.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(event.currentTarget.value);
          } else if (event.key === 'Escape') {
            // Not stopped: Escape still closes the popover, which is what the planner asked for.
            // Closing moves focus away and fires a blur; `discarded` makes that blur skip the commit
            // (it is cleared by the blur itself, or by the next edit if no blur arrives).
            discarded.current = draft !== null;
            setDraft(null);
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const typed = Number(event.currentTarget.value);
            const from =
              Number.isFinite(typed) && event.currentTarget.value.trim() !== '' ? typed : value;
            commit(String(from + (event.key === 'ArrowUp' ? KEY_STEP : -KEY_STEP)));
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
 *
 * Everything the group does to a typed value, or to the layout, is said in the one polite status at
 * the bottom: a limited width, an unusable entry, a reset.
 */
export function GanttColumnsGroup({
  columns,
}: {
  columns: GanttColumnsBundle;
}): React.ReactElement {
  const columnHintId = useId();
  const tableHintId = useId();
  const resetReasonId = useId();
  // `id` changes on every notice so an identical message is a new node and is announced again — a
  // live region only speaks when its content changes.
  const [notice, setNoticeState] = useState<{ id: number; text: string } | null>(null);
  const noticeCount = useRef(0);
  const setNotice = (text: string | null): void => {
    if (text === null) {
      setNoticeState(null);
      return;
    }
    noticeCount.current += 1;
    setNoticeState({ id: noticeCount.current, text });
  };

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
                subject={`${GANTT_COLUMN_LABELS[key]} width`}
                value={columns.widths[key]}
                min={COLUMN_MIN}
                max={COLUMN_MAX}
                hintId={columnHintId}
                apply={(width) => columns.setWidth(key, width)}
                onNotice={setNotice}
              />
            ) : null}
          </div>
        );
      })}
      <p id={columnHintId} className="text-muted-foreground text-xs">
        Widths are {COLUMN_MIN} to {COLUMN_MAX} pixels. Activity takes the room that is left, and
        the chart always keeps at least {CHART_MIN_WIDTH} pixels.
      </p>
      <div className="border-border flex flex-col gap-1 border-t pt-2">
        <WidthField
          subject="Table width"
          value={columns.table.size}
          min={columns.table.min}
          max={columns.table.max}
          hintId={tableHintId}
          apply={columns.table.setSize}
          onNotice={setNotice}
        />
        <p id={tableHintId} className="text-muted-foreground pl-6 text-xs">
          {columns.table.min} to {columns.table.max} pixels, the same as the Grid width divider
          between the table and the chart. Printing uses the standard layout.
        </p>
      </div>
      {/* Shaded rather than disabled (ADR-0082): it stays focusable so its reason is reachable. The
          guard is on the handler, `aria-disabled` is what a screen reader hears. No `pointer-events-none`:
          that would also remove the hover and click that state the reason, and the button must stay
          focusable and targetable for exactly that. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-disabled={columns.isDefault || undefined}
        aria-describedby={columns.isDefault ? resetReasonId : undefined}
        onClick={() => {
          if (columns.isDefault) return;
          columns.reset();
          setNotice('Widths reset to standard.');
        }}
      >
        Reset widths
      </Button>
      {columns.isDefault ? (
        <p id={resetReasonId} className="text-muted-foreground text-xs">
          Already at standard widths
        </p>
      ) : null}
      {/* Always mounted: a live region has to exist before its content changes to be announced. */}
      <p role="status" className="text-muted-foreground text-xs">
        {notice === null ? null : <span key={notice.id}>{notice.text}</span>}
      </p>
    </div>
  );
}
