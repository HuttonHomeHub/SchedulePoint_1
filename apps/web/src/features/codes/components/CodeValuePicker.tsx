import { useMemo, useState } from 'react';

import { useCodeValues } from '../api/use-code-values';
import { codeValueName, codeValueOptionLabel } from '../model/code-names';

import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  FieldGateLock,
  resolveFieldGate,
  useFieldGate,
  type FieldGate,
} from '@/components/ui/field-gate';
import { Label } from '@/components/ui/label';
import { matchesLibraryQuery } from '@/lib/library-filters';

/** The row that clears the type. It rides as a real option, not the primitive's empty one: see below. */
const NONE_VALUE = '__none__';
export const NO_VALUE_LABEL = 'None';

/**
 * What the picker holds. **Three states, because "nothing chosen yet" and "None" are different
 * answers** (the bulk bar must not read an untouched field as an instruction to clear):
 * `undefined` is unchosen, `null` is None, a string is a value id.
 */
export type CodeValueChoice = string | null | undefined;

/**
 * **One code type's value, chosen from its values** (`m3-ui-design.md` §7.1). The `Combobox`, not a
 * select: a type can hold 1,000 values and the primitive was built for that — type-ahead, a current
 * value that always renders, a loading row. The primitive never fetches and its keys are untouched:
 * opening it calls `onQueryChange('')`, and **the first call is what turns the values query on**, so
 * an editor holding thirty pickers fetches nothing until a planner opens one. The list is then
 * filtered here, on the client, over at most 1,000 rows.
 *
 * "None" is an ordinary first option rather than the primitive's `emptyOption`, because `emptyOption`
 * emits `''` and `''` is also what "unchosen" looks like to it: the three states stay distinct.
 *
 * `selectedLabel` is the current value's text from the name resolver, so the field reads right
 * before anything is opened. Shaded (`readOnly`, ADR-0083) for a gate that is shut, by the
 * enclosing group's gate or this one's own; `disabled` only while there is no type to load for.
 */
export function CodeValuePicker({
  orgSlug,
  planId,
  codeTypeId,
  id,
  label,
  hideLabel = false,
  value,
  onChange,
  selectedLabel,
  gate,
  describedBy,
  eager = false,
  placeholder,
}: {
  orgSlug: string;
  planId: string;
  /** Absent until a type is chosen: the picker is then disabled, there being nothing to list. */
  codeTypeId: string | undefined;
  id: string;
  label: string;
  /** The label is for assistive technology only (a host that already names the field visibly). */
  hideLabel?: boolean;
  value: CodeValueChoice;
  /** `valueName` is the chosen value's name (`codeValueName`), `null` for None, for a host that records it. */
  onChange: (value: string | null, valueName: string | null) => void;
  /** The current value's text, from the resolver; the loaded list is the fallback. */
  selectedLabel?: string | undefined;
  /** This picker's own gate; absent takes the enclosing group's (`FieldGateProvider`). */
  gate?: FieldGate | null | undefined;
  describedBy?: string | undefined;
  /** Load the values as soon as there is a type, rather than on first open. */
  eager?: boolean;
  placeholder?: string;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(false);
  const { shut, groupReasonId } = resolveFieldGate(gate, useFieldGate());
  const values = useCodeValues(orgSlug, planId, codeTypeId, opened || eager);

  const options = useMemo<ComboboxOption[]>(() => {
    const none: ComboboxOption = { value: NONE_VALUE, label: NO_VALUE_LABEL };
    const live = (values.data ?? [])
      .filter((v) => matchesLibraryQuery(query, v.shortCode, v.description))
      .map((v) => ({ value: v.id, label: codeValueOptionLabel(v) }));
    return [none, ...live];
  }, [values.data, query]);

  const comboValue = value === undefined ? '' : value === null ? NONE_VALUE : value;
  const loaded = typeof value === 'string' ? values.data?.find((v) => v.id === value) : undefined;
  const text =
    value === null
      ? NO_VALUE_LABEL
      : (selectedLabel ?? (loaded === undefined ? undefined : codeValueOptionLabel(loaded)));
  const described = [describedBy, groupReasonId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={id}
        className={hideLabel ? 'sr-only' : shut ? 'flex items-center gap-1.5' : ''}
      >
        {label}
        {shut && !hideLabel ? <FieldGateLock /> : null}
      </Label>
      <Combobox
        id={id}
        value={comboValue}
        onChange={(next) => {
          if (next === NONE_VALUE) {
            onChange(null, null);
            return;
          }
          const chosen = values.data?.find((v) => v.id === next);
          onChange(next, chosen === undefined ? null : codeValueName(chosen));
        }}
        query={query}
        onQueryChange={(next) => {
          setOpened(true);
          setQuery(next);
        }}
        options={options}
        selectedLabel={text}
        // `readOnly`, not `disabled`: the current value stays focusable and readable (ADR-0083 D1).
        readOnly={shut}
        disabled={codeTypeId === undefined}
        loading={values.isPending && (opened || eager) && codeTypeId !== undefined}
        errored={values.isError}
        describedBy={described}
        toggleLabel={`Show ${label} values`}
        emptyMessage="No value matches that."
        {...(placeholder === undefined ? {} : { placeholder })}
      />
    </div>
  );
}
