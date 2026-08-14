import type { ActivitySummary } from '@repo/types';

/**
 * One request to open the tabbed activity editor (ADR-0060 §7, M5) — the single currency every
 * entry point speaks.
 *
 * Before this, three surfaces opened three dialogs through three pieces of state: the row menu's
 * **Edit** / **Report progress** / **Steps**, the canvas selection bar's equivalents, and the
 * toolbar's **Update progress…**. Each pair could drift, and two of them did — the table and the
 * workspace disagreed about which dialog a Contributor could reach. Collapsing the *intent* to one
 * type removes the drift at the source: there is one thing to construct and one component that
 * consumes it, so a new entry point cannot invent a fourth behaviour.
 *
 * The intent holds an **id**, never a row. Every host re-derives the row from the live activities
 * query, so a refetch carries the current `version` into the next save and the editor closes by
 * itself when its target is deleted — the same rule the crud dialogs already followed.
 */
export type ActivityEditorTab =
  | 'general'
  | 'scheduling'
  | 'logic'
  | 'progress'
  | 'cost'
  | 'resources'
  | 'notes'
  /** A WBS summary's membership (`VITE_WBS_IMPROVEMENTS`) — present only on a `WBS_SUMMARY`. */
  | 'members';

/** Why the editor is being opened. Maps to a tab — and, for steps, to a focus target within it. */
export type ActivityEditorPurpose =
  | 'edit'
  | 'progress'
  | 'steps'
  | 'logic'
  | 'resources'
  | 'notes'
  /** Manage a WBS summary's membership — only ever raised for a `WBS_SUMMARY`. */
  | 'members'
  /**
   * Fix a constraint that broke logic (ADR-0094 M4-T3) — the Scheduling tab.
   *
   * The only purpose the conflict remedies needed that did not already exist: `resources` covers a
   * levelling overrun, and the hand-placed clash has a real one-click fix rather than a route. It is
   * NOT `'edit'`, which lands on General: a planner sent to fix a mandatory constraint should arrive
   * where the constraint is, not where the name is.
   */
  | 'constraint';

export interface ActivityEditorIntent {
  activityId: string;
  tab: ActivityEditorTab;
  /**
   * Move focus to the Weighted-steps panel once the tab renders. Set only by the **Steps** entry
   * point: it lands on a tab with three panels, and dropping the user at the top of it would make
   * the action feel like it opened the wrong thing.
   */
  focusSteps?: true;
}

/**
 * Map an entry point's purpose to the intent that satisfies it. Pure, so the whole mapping is a
 * table test rather than three mounted hosts.
 *
 * **Progress and Steps share a tab.** That is the epic's central claim made concrete: the reported
 * %, the value measure and the weighted steps are one subject, and the only difference between the
 * two entry points is where focus lands.
 */
export function openActivityEditor(
  activity: Pick<ActivitySummary, 'id'>,
  purpose: ActivityEditorPurpose,
): ActivityEditorIntent {
  switch (purpose) {
    // Logic and Resources were dialogs of their own until the convergence epic; as purposes they
    // are the plainest kind — one entry point, one tab, no focus target inside it.
    case 'logic':
      return { activityId: activity.id, tab: 'logic' };
    case 'resources':
      return { activityId: activity.id, tab: 'resources' };
    case 'members':
      return { activityId: activity.id, tab: 'members' };
    // **Add note** used to open the Logic dialog and then scroll + focus its Notes section, because
    // notes had no home of their own. With a tab, the intent IS the reveal.
    case 'notes':
      return { activityId: activity.id, tab: 'notes' };
    case 'progress':
      return { activityId: activity.id, tab: 'progress' };
    case 'steps':
      return { activityId: activity.id, tab: 'progress', focusSteps: true };
    case 'constraint':
      return { activityId: activity.id, tab: 'scheduling' };
    case 'edit':
      return { activityId: activity.id, tab: 'general' };
  }
}
