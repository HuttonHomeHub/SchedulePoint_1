import { useId, useState } from 'react';

import type { MilestoneChoice } from './make-milestone-gate';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { RadioCardGroup } from '@/components/ui/radio-card-group';
import { formatCanvasDate } from '@/features/tsld/render/geometry';

/**
 * **Make milestone…: choose Finish or Start, having read how each is dated** (ADR-0162 decision 4,
 * spec D4/D5, M4-T3).
 *
 * Start keeps the reported date, so it shows it. Finish may read an earlier day and says so in
 * words rather than previewing a date: the finish reading is "the day of the last working minute
 * before the instant" on the activity's calendar, and computing that here would be a second copy of
 * the engine's working-time rule (the ADR-0065 argument). The real date is announced from the
 * recalculated row once it arrives.
 *
 * **Focus is the caller's, set BEFORE this opens** (spec D4, ADR-0149 D8): a native `<dialog>`
 * restores focus on close to whatever held it at `showModal()`, and the control that opened this
 * disappears once the task is a milestone. So each host moves focus to the activity first, and this
 * component makes no focus call on confirm.
 *
 * On failure the dialog stays open with the error as an alert in its body, as `ArrangeDialog` does,
 * and nothing is closed; Confirm is `aria-disabled` while the save is in flight, never native
 * `disabled`, which would blur focus to `<body>` (ADR-0145). The caller mounts it with a fresh `key`
 * per opening, so a pick never carries over.
 */
export interface MakeMilestoneDialogProps {
  open: boolean;
  onClose: () => void;
  /** The activity's name, for the title's subject and the announcement the caller makes. */
  activityName: string;
  /** The date the activity reads now (`YYYY-MM-DD`), or null before the plan is calculated. */
  reportedDate: string | null;
  /** The preselected option (`defaultMilestoneType`). */
  defaultType: MilestoneChoice;
  /** The activity carries the plan's reported finish, so choosing Finish may move that label. */
  carriesProjectFinish: boolean;
  /** Save the conversion. Resolves on success (the caller closes the dialog); rejects with the
   * sentence to show. */
  onConfirm: (type: MilestoneChoice) => Promise<void>;
}

export const FINISH_DESCRIPTION =
  'Dated by the day the work before it ends. A finish milestone is drawn at the end of its day, so ' +
  'after a weekend it appears on the Friday rather than the Monday. Its successors, float and every ' +
  'other date are unchanged.';

export const PROJECT_FINISH_NOTE =
  'This activity carries the plan’s finish. Its finish instant is unchanged, but the plan’s ' +
  'reported finish may now read an earlier day, because a finish milestone’s date is read that way.';

export function MakeMilestoneDialog({
  open,
  onClose,
  activityName,
  reportedDate,
  defaultType,
  carriesProjectFinish,
  onConfirm,
}: MakeMilestoneDialogProps): React.ReactElement {
  const [picked, setPicked] = useState<MilestoneChoice | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const choice = picked ?? defaultType;
  const showsFinishNote = carriesProjectFinish && choice === 'FINISH_MILESTONE';

  const confirm = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(choice);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The change was not saved.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Make “${activityName}” a milestone`}
      description="It has no duration, so it is probably an event rather than work. Choose which kind of milestone it is."
    >
      <div className="flex flex-col gap-4">
        {error ? <NoticeStrip role="alert" tone="warning" message={error} /> : null}

        <RadioCardGroup<MilestoneChoice>
          label="Kind of milestone"
          value={choice}
          onChange={setPicked}
          options={[
            {
              value: 'FINISH_MILESTONE',
              title: 'Finish milestone',
              description: FINISH_DESCRIPTION,
              figures: null,
            },
            {
              value: 'START_MILESTONE',
              title: 'Start milestone',
              description:
                reportedDate === null
                  ? 'Keeps its date.'
                  : `Keeps its date, ${formatCanvasDate(reportedDate, { weekday: true })}.`,
              figures: null,
            },
          ]}
        />

        {showsFinishNote ? (
          <p id={noteId} className="text-muted-foreground text-sm">
            {PROJECT_FINISH_NOTE}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            aria-disabled={pending}
            aria-busy={pending}
            {...(showsFinishNote ? { 'aria-describedby': noteId } : {})}
            onClick={(event) => {
              if (pending) {
                event.preventDefault();
                return;
              }
              void confirm();
            }}
            className="aria-disabled:pointer-events-none"
          >
            {pending ? 'Converting…' : 'Make milestone'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
