import { useId } from 'react';

import type { TsldToolbarContext } from './tsld-toolbar-context';

import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/form';
import { KEY_STEP } from '@/components/ui/panel-resizer';
import { SizeField, useSizeNotice } from '@/components/ui/size-field';
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
 * Indents a width field to the text of the `CheckboxField` label above it, so it reads as belonging to
 * that column rather than as a sibling of the checkboxes.
 */
const FIELD_INDENT = 'pl-6';

/** Why a width inside the column bounds can still be limited: the chart's floor (ADR-0173 D2). */
const CHART_GUARD = `so the chart keeps at least ${CHART_MIN_WIDTH} px`;

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
  const { setNotice, status } = useSizeNotice();

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
              <SizeField
                subject={`${GANTT_COLUMN_LABELS[key]} width`}
                value={columns.widths[key]}
                min={COLUMN_MIN}
                max={COLUMN_MAX}
                step={KEY_STEP}
                hintId={columnHintId}
                apply={(width) => columns.setWidth(key, width)}
                onNotice={setNotice}
                limitReason={CHART_GUARD}
                className={FIELD_INDENT}
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
        <SizeField
          subject="Table width"
          value={columns.table.size}
          min={columns.table.min}
          max={columns.table.max}
          step={KEY_STEP}
          hintId={tableHintId}
          apply={columns.table.setSize}
          onNotice={setNotice}
          className={FIELD_INDENT}
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
      {/* Always mounted (`useSizeNotice`): a live region has to exist before its content changes. */}
      {status}
    </div>
  );
}
