import { useId } from 'react';

import type { TsldToolbarContext } from './tsld-toolbar-context';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
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
import {
  CODE_COLUMN_CAP_REASON,
  CODE_COLUMNS_FAILED_SENTENCE,
  CODE_COLUMNS_LOADING_SENTENCE,
  MAX_CODE_COLUMNS,
  NO_CODES_REASON,
  type CodeColumnsChoice,
} from '@/lib/code-columns';

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
      {HIDEABLE_COLUMNS.filter(
        (key) => key !== 'swimlane' || columns.swimlanesOffered === true,
      ).map((key) => {
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
      <CodeColumnsList
        choice={columns.codes}
        width={columns.widths.codes}
        setWidth={(width) => columns.setWidth('codes', width)}
        hintId={columnHintId}
        onNotice={setNotice}
      />
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

/**
 * **Codes**, a folded sub-section of the Columns group (P6 activity codes, M3-T2): one checkbox per live
 * type in type order, its list scrolling inside a bounded height so the `View ▾` panel does not grow with
 * the number of types (its floor budget, `tsld-toolbar-items.tsx`). Off by default; read-only columns.
 *
 * At the cap the unticked boxes are shaded with their reason and stay focusable (ADR-0083 and ADR-0204);
 * a ticked box is never shaded, so a column can always be switched off. The one shared width appears
 * only while a code column is shown, as every other column's does.
 */
function CodeColumnsList({
  choice,
  width,
  setWidth,
  hintId,
  onNotice,
}: {
  choice: CodeColumnsChoice;
  width: number;
  setWidth: (width: number) => number;
  hintId: string;
  onNotice: (notice: string | null) => void;
}): React.ReactElement {
  const atCap = choice.shownIds.length >= MAX_CODE_COLUMNS;
  const capId = useId();
  return (
    <Disclosure
      label="Codes"
      collapsed="hidden"
      className="border-border border-t pt-1"
      defaultOpen={choice.shownIds.length > 0}
    >
      {choice.status === 'ready' && choice.types.length > 0 ? (
        <div className="flex flex-col">
          <div className="flex max-h-40 flex-col overflow-y-auto" data-testid="code-columns-list">
            {choice.types.map((type) => {
              const shown = choice.shownIds.includes(type.id);
              return (
                <CheckboxField
                  key={type.id}
                  label={type.name}
                  density="compact"
                  checked={shown}
                  // The reason is printed ONCE below the list and pointed at by every shaded box, not
                  // repeated under each of up to a hundred (ADR-0083 D4). The click is cancelled, so
                  // the box stays focusable and states why.
                  {...(shown || !atCap
                    ? {}
                    : {
                        'aria-disabled': true,
                        'aria-describedby': capId,
                        onClick: (event: React.MouseEvent) => event.preventDefault(),
                      })}
                  onChange={() => {
                    // The cancelled click above is not enough on its own: the framework still reports a
                    // change on some browsers, and a shaded box must write nothing.
                    if (!shown && atCap) return;
                    choice.setShown(
                      shown
                        ? choice.shownIds.filter((id) => id !== type.id)
                        : [...choice.shownIds, type.id],
                    );
                  }}
                />
              );
            })}
          </div>
          {atCap ? (
            <p id={capId} className="text-muted-foreground px-2 pt-1 text-xs">
              {CODE_COLUMN_CAP_REASON}
            </p>
          ) : null}
          {choice.shownIds.length > 0 ? (
            <SizeField
              subject="Width of all code columns"
              value={width}
              min={COLUMN_MIN}
              max={COLUMN_MAX}
              step={KEY_STEP}
              hintId={hintId}
              apply={setWidth}
              onNotice={onNotice}
              limitReason={CHART_GUARD}
              className={FIELD_INDENT}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground px-2 text-xs">
          {choice.status === 'loading'
            ? CODE_COLUMNS_LOADING_SENTENCE
            : choice.status === 'error'
              ? CODE_COLUMNS_FAILED_SENTENCE
              : NO_CODES_REASON}
        </p>
      )}
    </Disclosure>
  );
}
