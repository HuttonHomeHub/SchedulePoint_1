import type { SwimlaneSource } from '@repo/types';

import { SelectField } from '@/components/ui/form';
import { RadioCardGroup } from '@/components/ui/radio-card-group';
import { WBS_SWIMLANE_LEVELS, type WbsSwimlaneLevel, type WbsSwimlaneLevels } from '@/features/wbs';

/** The two sources a planner can choose between. `NONE` is the absence of a choice, not a choice. */
export type ChosenSource = Exclude<SwimlaneSource, 'NONE'>;

const groups = (n: number): string => (n === 1 ? '1 group' : `${String(n)} groups`);

/**
 * **Where the swimlanes come from** (swimlanes M3-T1, feature-spec US-4): by hand, or one per WBS group
 * at a level. The one set of fields both the setup dialog and the manage dialog render, so the two
 * cannot word the choice differently.
 *
 * The WBS card is shaded, with its reason, when the plan has no summary to make a swimlane of — an
 * `aria-disabled` radio the arrow keys still reach, so the reason is readable (ADR-0082, ADR-0204). The
 * level is a `SelectField` beside the group and not inside the card: a control nested in a `radio` is
 * not reachable as one. Only levels that hold a summary are offered, each with how many, and the
 * caller preselects `levels.suggested`.
 */
export function SwimlaneSourceFields({
  source,
  onSource,
  level,
  onLevel,
  levels,
  loaded,
}: {
  source: ChosenSource;
  onSource: (source: ChosenSource) => void;
  level: WbsSwimlaneLevel | null;
  onLevel: (level: WbsSwimlaneLevel) => void;
  levels: WbsSwimlaneLevels;
  /** The plan's activities have arrived; before that the WBS cannot be read. */
  loaded: boolean;
}): React.ReactElement {
  const offered = WBS_SWIMLANE_LEVELS.filter((l) => (levels.counts[l - 1] ?? 0) > 0);
  const none = offered.length === 0;
  const chosenLevel = level ?? levels.suggested;
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
        ]}
      />
      {source === 'WBS' && !none ? (
        <SelectField
          label="WBS level"
          value={String(chosenLevel ?? offered[0])}
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
    </div>
  );
}
