import type { SwimlaneSource } from '@repo/types';
import { useId, useMemo, useState } from 'react';

import {
  CODE_CARD_NONE_ELIGIBLE,
  codeCardDescription,
  codeNoneHint,
  valuesInUseBadge,
} from '../model/code-swimlane-copy';
import type { CodeSourcePicker } from '../model/use-code-source-picker';

import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { SelectField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { RadioCardGroup } from '@/components/ui/radio-card-group';
import {
  clampWbsLevel,
  offeredWbsLevels,
  type WbsSwimlaneLevel,
  type WbsSwimlaneLevels,
} from '@/features/wbs';

/** The sources a planner can choose between. `NONE` is the absence of a choice, not a choice. */
export type ChosenSource = Exclude<SwimlaneSource, 'NONE'>;

const groups = (n: number): string => (n === 1 ? '1 group' : `${String(n)} groups`);

/**
 * **Where the swimlanes come from** (swimlanes M3-T1, feature-spec US-4; p6-activity-codes M4): by hand,
 * one per WBS group at a level, or one per value of a code. The one set of fields both the setup dialog and the manage dialog render, so the two
 * cannot word the choice differently.
 *
 * The WBS card is shaded, with its reason, when the plan has no summary to make a swimlane of — an
 * `aria-disabled` radio the arrow keys still reach, so the reason is readable (ADR-0082, ADR-0204). The
 * level is a `SelectField` beside the group and not inside the card: a control nested in a `radio` is
 * not reachable as one. Only levels that hold a summary are offered, each with how many, and the
 * caller preselects `levels.suggested`.
 *
 * **The code card** is shaded with exactly one reason (`code.cardReason`), and its type picker is a
 * `Combobox` beside the group for the same reason as the level: some of its options are shaded with a
 * reason of their own (no value in use, or more than swimlanes can show), and a native `<option
 * disabled>` drops out of the keyboard and carries no reason (ADR-0082, ADR-0204). The picker renders
 * while the card is the chosen one, and also while the card is shaded because no code can be chosen:
 * its sentence points at each code's reason, so those must be reachable (arrow keys land on a shaded
 * option and read it) rather than hidden behind a card that cannot be selected.
 */
export function SwimlaneSourceFields({
  source,
  onSource,
  level,
  onLevel,
  levels,
  loaded,
  code,
}: {
  source: ChosenSource;
  onSource: (source: ChosenSource) => void;
  level: WbsSwimlaneLevel | null;
  onLevel: (level: WbsSwimlaneLevel) => void;
  levels: WbsSwimlaneLevels;
  /** The plan's activities have arrived; before that the WBS cannot be read. */
  loaded: boolean;
  code: CodeSourcePicker;
}): React.ReactElement {
  const offered = offeredWbsLevels(levels);
  const none = offered.length === 0;
  // A level that has emptied since it was picked (or saved) is not shown: the select would name one
  // level and the write would carry another.
  const chosenLevel = clampWbsLevel(level, levels);
  const codeName = code.choices?.find((c) => c.id === code.typeId)?.name;
  return (
    <div className="flex flex-col gap-3">
      <RadioCardGroup<ChosenSource>
        label="Where swimlanes come from"
        value={source}
        onChange={onSource}
        options={[
          {
            value: 'MANUAL',
            title: 'By hand',
            description: 'You name them and put activities in them.',
            figures: null,
          },
          {
            value: 'WBS',
            title:
              chosenLevel === null
                ? 'One per WBS group'
                : `One per WBS group at level ${String(chosenLevel)}`,
            description:
              'One for each summary at the level you choose, named after it. They follow the WBS: ' +
              'renaming or moving a summary updates them with no further step.',
            figures: null,
            disabled: none,
            disabledReason: !loaded
              ? 'The plan’s activities have not loaded yet.'
              : 'This plan has no WBS summaries to make swimlanes from. Add a summary and file activities under it first.',
          },
          {
            value: 'ACTIVITY_CODE',
            title: codeName === undefined ? 'One per code value' : `One per value of ${codeName}`,
            description: codeCardDescription(codeName),
            figures: null,
            disabled: code.cardReason !== null,
            disabledReason: code.cardReason,
          },
        ]}
      />
      {source === 'WBS' && !none ? (
        <SelectField
          label="WBS level"
          value={String(chosenLevel)}
          onChange={(event) => onLevel(Number(event.target.value) as WbsSwimlaneLevel)}
          hint="Work under a summary at this level, at any depth, is in its swimlane. The rest is in “No swimlane”."
        >
          {offered.map((l) => (
            <option key={l} value={l}>
              {`Level ${String(l)}: ${groups(levels.counts[l - 1] ?? 0)}${
                l === levels.suggested ? ' (suggested)' : ''
              }`}
            </option>
          ))}
        </SelectField>
      ) : null}
      {source === 'ACTIVITY_CODE' || code.cardReason === CODE_CARD_NONE_ELIGIBLE ? (
        <CodePicker code={code} />
      ) : null}
    </div>
  );
}

/** The "Code" picker and its hint, shown beside the group while the code card is the chosen one. */
function CodePicker({ code }: { code: CodeSourcePicker }): React.ReactElement {
  const id = useId();
  const hintId = useId();
  const [query, setQuery] = useState('');
  const choices = code.choices;
  const options = useMemo<ComboboxOption[]>(() => {
    const needle = query.trim().toLowerCase();
    return (choices ?? [])
      .filter((c) => needle === '' || c.name.toLowerCase().includes(needle))
      .map((c) => ({
        value: c.id,
        label: c.name,
        badge: valuesInUseBadge(c.valuesInUse),
        ...(c.reason === null ? {} : { disabled: true, disabledReason: c.reason }),
      }));
  }, [choices, query]);
  const name = choices?.find((c) => c.id === code.typeId)?.name;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Code</Label>
      <Combobox
        id={id}
        value={code.typeId ?? ''}
        onChange={code.onType}
        query={query}
        onQueryChange={setQuery}
        options={options}
        selectedLabel={name}
        loading={code.loading}
        errored={code.errored}
        describedBy={name === undefined ? undefined : hintId}
        toggleLabel="Show codes"
        emptyMessage="No code matches that."
        placeholder="Choose a code"
      />
      {name === undefined ? null : (
        <p id={hintId} className="text-muted-foreground text-sm">
          {codeNoneHint(name)}
        </p>
      )}
    </div>
  );
}
