import type {
  ActivityStep,
  ActivitySummary,
  CalendarSummary,
  DependencySummary,
} from '@repo/types';

import type { ActivityEditorGating } from '../lib/activity-editor-gating';
import type { ActivityEditorIntent } from '../lib/activity-editor-intent';
import type { ProgressFormValues } from '../schemas/activity-schemas';
import type { StepsFormValues } from '../schemas/step-schemas';

import type { OnAssignmentEdited } from '@/features/resources';
import type { OnReparented } from '@/features/wbs';

/** The props the host sees — and the session is handed the same ones, minus `open`. */
export interface ActivityEditorDialogProps {
  orgSlug: string;
  planId: string;
  open: boolean;
  onClose: () => void;
  /**
   * Why the editor was opened (ADR-0060 §7): which tab to land on, and whether to move focus to the
   * Weighted-steps panel. Omitted ⇒ General, the plain **Edit** behaviour.
   */
  intent?: ActivityEditorIntent;
  /** Called after a scope saves, with the pre-save row and the server's post-save row (ADR-0048). */
  onSaved?: (before: ActivitySummary, after: ActivitySummary) => void;
  /**
   * Called after the weighted steps save, with the list as it stood before and the server's saved one
   * (undo-redo M3). Like {@link onSaved} it is made by the frame, so it survives the editor closing.
   */
  onStepsSaved?: (
    activity: ActivitySummary,
    before: readonly ActivityStep[],
    after: readonly ActivityStep[],
  ) => void;
  /** Told of every resource-assignment write made on the Resources tab (undo-redo M3). */
  onAssignmentEdited?: OnAssignmentEdited;
  /** Told when the Members tab files rows under (or out of) the summary being edited (undo-redo M3). */
  onReparented?: OnReparented;
  /**
   * The row being edited. This editor is edit-only; creation is {@link ActivityCreateDialog}. A modal
   * guarantees it cannot change while the editor is open (ADR-0108 D7, ADR-0169 D5).
   */
  activity: ActivitySummary | undefined;
  /** Per-scope writability and its reason (`deriveActivityEditorGating`). */
  gating: ActivityEditorGating;
  calendars?: CalendarSummary[];
  /** The calendar list is still in flight — the picker says so rather than reading as "inherit". */
  calendarsLoading?: boolean;
  /** The calendar list failed — surfaced in the picker, not swallowed. */
  calendarsError?: boolean;
  /**
   * The plan's own calendar id — what an activity's empty `calendarId` ("inherit") resolves to.
   * Route-composed like {@link calendars}; needed only to read the duration field's working-hours
   * factor (ADR-0070). Absent leaves that field in whole working days.
   */
  planCalendarId?: string;
  planActivities?: ActivitySummary[];
  /**
   * The plan's activities are still in flight — the WBS picker says so rather than reading as
   * "this plan has no summaries", which is the same distinction {@link calendarsLoading} draws.
   * Both mount sites already held this signal and were passing it to the create dialog; the editor
   * had nowhere to put it until M2-T3.
   */
  planActivitiesLoading?: boolean;
  /** The plan's activities failed to load — surfaced in the WBS picker, not swallowed. */
  planActivitiesError?: boolean;
  /**
   * Composition-root wiring for the **Logic** tab, grouped so the tab's seams arrive and leave
   * together rather than as four loose props (the cross-plan slot is the `notesSlot` precedent:
   * this feature must not import `cross-plan-dependencies` sideways). Absent ⇒ the tab renders the
   * plain panel, which is what a host without those flags wants.
   */
  logic?: {
    /** `VITE_PROGRAMME_SCHEDULING`'s cross-plan links section (ADR-0045). */
    crossPlanSlot?: React.ReactNode;
    /** Undo recording for an added link (ADR-0048 M2). */
    onAdded?: (dependency: DependencySummary) => void;
    /** Undo recording for a removed link (ADR-0048 M2). */
    onRemoved?: (dependency: DependencySummary) => void;
    onEdited?: (before: DependencySummary, after: DependencySummary) => void;
    /** The coalesced keyboard lag nudge (ADR-0052 M3) — `Shift+←/→` on a link's row buttons. */
    onNudgeLag?: (dependency: DependencySummary, delta: number) => void;
  };
  /**
   * The `VITE_NOTES` activity-notes section (ADR-0046), passed by the composition root for the same
   * reason as the cross-plan slot: this feature must not import the notes data layer sideways.
   * Absent ⇒ no Notes tab, which is what a host without the flag wants.
   */
  notesSlot?: React.ReactNode;
  /**
   * The **History** tab's panel (ADR-0174), passed by the composition root because it needs the plan's
   * calendars and currency and this feature must not import the history feature sideways (it reads
   * this feature's labels). Absent ⇒ no History tab. Unflagged: ADR-0088 D1.
   */
  historySlot?: React.ReactNode;
}

/** What the frame can ask of the session it hosts: close the way the footer Close does. */
export interface ActivityEditorSessionHandle {
  requestClose: () => void;
}

/** One scope save, as the session describes it to the frame that owns the mutation. */
export interface ScopeSave {
  activity: ActivitySummary;
  patch: Record<string, unknown>;
  label: string;
  /** Session-local effects of a success: marking the scope clean, "Saved.". */
  onSuccess: (after: ActivitySummary) => void;
  onError: (error: Error) => void;
}

/** One Reported-progress save (`PATCH …/progress`). */
export interface ProgressSave {
  activity: ActivitySummary;
  hoursPerDay: number | undefined;
  values: ProgressFormValues;
  /** `adjustments` is how many repairs the server applied to keep the report consistent. */
  onSuccess: (adjustments: number) => void;
  onError: (error: Error) => void;
}

/** One weighted-steps save (`PUT …/steps`). */
export interface StepsSave {
  activity: ActivitySummary;
  /**
   * The saved list this save replaces, for the host that records it; `undefined` when the list had
   * not loaded, in which case nothing is recorded.
   */
  before: readonly ActivityStep[] | undefined;
  steps: StepsFormValues['steps'];
  onSuccess: (saved: ActivityStep[]) => void;
  onError: (error: Error) => void;
}

/**
 * The three writes the editor makes — definition fields, reported progress and weighted steps — as the
 * frame offers them to the session (ADR-0169 D-10). Each is its own endpoint and its own mutation.
 *
 * The frame owns the mutation observers so a save that finishes after the editor closed still
 * records its undo and announces. Each `save*` settles ITS OWN callbacks, so overlapping saves each
 * report. The `*Pending` flags are the observers': `fieldsPending` is shared by every scope that saves
 * through `PATCH …/:id` (General, Scheduling, Cost, Measure), and each follows the most recent call, and — the
 * observers outliving a session — a fresh opening sees the previous opening's save as pending until
 * it settles, which keeps a second write from racing a first on the same row version.
 */
export interface ActivityEditorSaves {
  saveFields: (save: ScopeSave) => void;
  saveProgress: (save: ProgressSave) => void;
  saveSteps: (save: StepsSave) => void;
  fieldsPending: boolean;
  progressPending: boolean;
  stepsPending: boolean;
}

/**
 * What the frame hands one opening of the editor: everything the dialog was given except the
 * frame-owned `open`, `onSaved` and `activity` (the row arrives non-optional, keyed), plus the seams
 * the frame owns — the close handle and the scope-save mutation.
 */
export interface ActivityEditorSessionProps extends Omit<
  ActivityEditorDialogProps,
  'open' | 'onSaved' | 'onStepsSaved' | 'activity'
> {
  handleRef: React.Ref<ActivityEditorSessionHandle>;
  activity: ActivitySummary;
  saves: ActivityEditorSaves;
}
