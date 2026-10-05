import { useRef } from 'react';

import { useUpdateActivityFields, useUpdateActivityProgress } from '../api/use-activities';
import { useReplaceActivitySteps } from '../api/use-activity-steps';
import { activitySubtitle } from '../lib/activity-editor-context';
import { ACTIVITY_TYPE_LABELS } from '../schemas/activity-schemas';

import type {
  ActivityEditorDialogProps,
  ActivityEditorSessionHandle,
  ProgressSave,
  ScopeSave,
  StepsSave,
} from './activity-editor-types';
import { ActivityEditorSession } from './ActivityEditorSession';

import { useAnnounce } from '@/components/ui/announcer';
import { Dialog } from '@/components/ui/dialog';

/**
 * The tabbed activity editor, **as a modal dialog** (ADR-0060, ADR-0101). Unconditional since ADR-0089 retired
 * `VITE_ACTIVITY_EDITOR_TABS`; there is no other edit surface.
 *
 * **Saves per write scope, not per dialog.** Each tab owns an independent form and its own Save,
 * because the three write paths this editor spans do not share a permission: definition writes need
 * the plan edit-lock, progress writes deliberately do not (ADR-0028 Q-C), and steps joined the pen
 * side in ADR-0060 §5. One merged Save would have to pick one rule and break the others — it would
 * quietly remove a Contributor's ability to report progress. Per-scope save is therefore structural,
 * not a layout preference.
 *
 * **`version` is read at submit time, never captured.** Every scope save bumps the row's version, so
 * a second save from another tab must use the version the *first* one produced. Reading it from the
 * live `activity` prop inside the submit handler is what makes a two-tab edit session work at all.
 *
 * Copy follows `docs/specs/activity-editor-restructure/copy-review.md` — reviewed as it moved, not
 * moved verbatim. Most visibly, `(optional)` is gone from labels: it was on eleven of twenty-two,
 * which is enough that it stopped meaning anything.
 *
 * M3 ships the three definition tabs; M4 adds Progress, where the reported %, the value measure and
 * the weighted steps finally sit next to each other — three dialogs' worth of screens that were
 * previously reachable only one at a time, from different menus, with no cue that one overrides
 * another.
 *
 * **The layout is ADR-0061 Direction B**: a section rail beside a pane, at the `xl` dialog size.
 * The editor is the app's only dialog that earns it, and the reason is the same one that made
 * per-scope save structural — the scopes carry *different permissions*, and a horizontal tab strip
 * has nowhere to say so. In the rail, a Contributor sees "General 🔒 / Scheduling 🔒 / Progress" on
 * arrival instead of discovering each shut form by clicking into it. Inside the pane, fields are
 * grouped into field components that both this editor and the create dialog render; above it, {@link ContextStrip}
 * keeps the computed dates and float on screen, which the previous version showed nowhere at all.
 *
 * **The frame** (ADR-0169 D3): the `<dialog>`, the scope-save mutation and the close handle — the
 * parts that must outlive an opening — around an {@link ActivityEditorSession} that is mounted per
 * opening and holds every form and every other piece of working state.
 *
 * **Why the mutation is here and the forms are not.** A save can finish after the editor has closed.
 * Its undo record (`onSaved`) and its announcement are the user's only signal that it landed, and a
 * per-call mutate callback is dropped when the observer that made the call unmounts — so the
 * observers (definition fields, reported progress, weighted steps) live in the component that does
 * not, and each call settles through its own `mutateAsync` promise. Session-local effects (marking a scope clean,
 * "Saved.") ride along as callbacks and are harmless against a session that is gone.
 *
 * **Why the `<dialog>` is here.** Rendered by the session it would be created and destroyed with each
 * opening, removed from the document while modal, which bypasses `close()` and its focus return.
 * `Dialog` already unmounts its children before `close()` runs, so the session unmounting changes
 * nothing about where focus goes.
 *
 * **Why a handle and not reported state.** A guard fed by a child reporting `isDirty` through an
 * effect is one render late by construction. The frame reads the answer at the moment of the click,
 * from the component that owns the forms.
 */
export function ActivityEditorDialog({
  orgSlug,
  planId,
  open,
  onClose,
  onSaved,
  onStepsSaved,
  activity,
  ...sessionProps
}: ActivityEditorDialogProps): React.ReactElement {
  const announce = useAnnounce();
  const update = useUpdateActivityFields(orgSlug, planId);
  const progress = useUpdateActivityProgress(orgSlug, planId);
  // The steps endpoint is addressed by the activity; a closed frame has none, and nothing can call it.
  const replaceSteps = useReplaceActivitySteps(orgSlug, planId, activity?.id ?? '');
  const sessionRef = useRef<ActivityEditorSessionHandle>(null);

  /**
   * What every failed save does. A mounted session shows the failure beside what owns it. With the
   * session gone (closed mid-save) nothing shows it, and a save that failed silently reads as one
   * that landed — SC 4.1.3 — so the live region is the only signal left.
   */
  const failed =
    (label: string, onError: (error: Error) => void) =>
    (error: Error): void => {
      onError(error);
      if (!sessionRef.current) announce(`${label} not saved: ${error.message}`);
    };

  // **Each call settles through the promise `mutateAsync` returns, never a per-call `mutate`
  // callback.** react-query v5 fires those only for the latest call an observer made
  // (`mutationObserver.js` ~126-147), so a first save still in flight when a second began lost its
  // undo record, its "Saved." and its announcement. The promise belongs to its own call.

  /**
   * Save one definition scope. `version` comes from the live row **now**, not from when the editor
   * opened — see the docblock above. The undo record and the announcement are made here, not by the
   * session, so they survive the session being unmounted mid-save.
   */
  const saveFields = ({ activity: row, patch, label, onSuccess, onError }: ScopeSave): void => {
    void update.mutateAsync({ activityId: row.id, version: row.version, patch }).then(
      (after) => {
        // The session's own effects first: they mark the scope clean, and a throw from the host's undo
        // recording must not leave a saved form looking unsaved.
        onSuccess(after);
        announce(`${label} saved.`);
        onSaved?.(row, after);
      },
      failed(label, onError),
    );
  };

  const saveProgress = ({
    activity: row,
    hoursPerDay,
    values,
    onSuccess,
    onError,
  }: ProgressSave) => {
    void progress
      .mutateAsync({ activityId: row.id, version: row.version, hoursPerDay, ...values })
      .then(
        (result) => {
          // The server reports the repairs it applied to keep the report self-consistent
          // (ADR-0035 §6). Dropping them in the port would hide a silent correction.
          const adjustments = result.meta?.warnings?.length ?? 0;
          onSuccess(adjustments);
          announce(
            adjustments > 0
              ? `Progress saved with ${adjustments} adjustment${adjustments === 1 ? '' : 's'}.`
              : 'Progress saved.',
          );
        },
        failed('Progress', onError),
      );
  };

  const saveSteps = ({ activity: row, before, steps, onSuccess, onError }: StepsSave): void => {
    void replaceSteps.mutateAsync({ version: row.version, steps }).then(
      (saved) => {
        onSuccess(saved);
        announce('Steps saved.');
        onStepsSaved?.(row, before, saved);
      },
      failed('Steps', onError),
    );
  };

  /**
   * **A request while closed is not a request.** After a Discard the host closes the `<dialog>`,
   * whose own `close` event comes straight back here with the session already gone. Treating it as
   * a request armed a confirmation for the NEXT opening (F1, `docs/specs/activity-editor-seeding`);
   * with no session to ask there is nothing to confirm, and a closed editor has nothing to close.
   */
  const requestClose = (): void => {
    if (sessionRef.current) sessionRef.current.requestClose();
    else if (open) onClose();
  };

  return (
    <Dialog
      open={open}
      // Escape routes through the same guard as the Close button — an Escape reflex is exactly the
      // case the confirmation exists for. (`Dialog` has no backdrop-click handler; the modal's
      // backdrop is inert.)
      onClose={requestClose}
      confirmBeforeClose
      size="xl"
      body="flush"
      title={activity ? activity.name : 'Edit activity'}
      {...(activity
        ? { description: activitySubtitle(activity, ACTIVITY_TYPE_LABELS[activity.type]) }
        : {})}
    >
      {open && activity ? (
        // Keyed by the row, so a subject that ever changed under an open editor remounts it: the
        // title and the forms can never disagree about which activity they describe.
        <ActivityEditorSession
          key={activity.id}
          handleRef={sessionRef}
          orgSlug={orgSlug}
          planId={planId}
          activity={activity}
          onClose={onClose}
          saves={{
            saveFields,
            saveProgress,
            saveSteps,
            fieldsPending: update.isPending,
            progressPending: progress.isPending,
            stepsPending: replaceSteps.isPending,
          }}
          {...sessionProps}
        />
      ) : null}
    </Dialog>
  );
}
