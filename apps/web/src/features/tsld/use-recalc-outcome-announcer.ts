import type { ActivitySummary } from '@repo/types';
import { useCallback, useEffect, useRef } from 'react';

import { formatCalendarDate } from '@/lib/format-date';

/** The values a settle is judged against — captured when an edit is noted, compared when it settles. */
interface OutcomeBaseline {
  activityId: string;
  earlyStart: string | null;
  earlyFinish: string | null;
  projectFinish: string | null;
}

export interface RecalcOutcomeAnnouncerInput {
  /** True while a recalculation POST is in flight — either trigger (ADR-0032 M3 coalescer). */
  pending: boolean;
  /** The plan's activities, as the surface currently has them. */
  activities: readonly ActivitySummary[];
  /** The plan's computed project finish (`YYYY-MM-DD`), or null before the first recalculation. */
  projectFinish: string | null;
  /** The app's shared polite live region. */
  announce: (message: string) => void;
}

export interface RecalcOutcomeAnnouncer {
  /**
   * Record that this activity was just edited on this surface. The **next** settle describes the
   * result; the note is consumed by that settle, spoken or not.
   */
  noteEdit: (activityId: string) => void;
}

/**
 * **What a recalculation settled** — the spoken half of ADR-0032's coalesced recalc.
 *
 * A structural edit on the canvas already announces its promise ("Moved …; dates will update."),
 * and then the schedule recalculates half a second later and says nothing at all: the one
 * announcement a screen-reader user gets is the one made *before* the dates were known. (The manual
 * Recalculate button does confirm — "Schedule recalculated." — but that is a status word carrying
 * no fact, one step short of useful; this hook states the fact, and the two sentences are
 * deliberately different so the reader can tell the command's confirmation from its result.)
 *
 * So this states the **result**, at most two sentences, and only what changed:
 *
 * 1. the edited activity's resulting dates, when they moved;
 * 2. the project finish, when it moved — a **separate sentence**, never folded into the first
 *    (ADR-0073: two facts, two statements).
 *
 * Deliberately **not** here: a count of the activities whose dates moved. It reads well on a
 * knock-on-heavy edit and costs a full before/after diff of the activities list on every settle
 * (spec CQ-4(a)); the two facts above are both O(1).
 *
 * **Silence is the default.** Nothing is spoken without an edit noted on this surface, and nothing
 * is spoken when the values are the ones already there — which is also what keeps a *failed*
 * recalculation quiet without this hook needing to know it failed: nothing changed, so there is no
 * result to state, and the coalescer's own error message stands alone in the live region.
 *
 * That comparison **is** the value-stable signature: the note carries the values as they stood when
 * the edit was made, and a settle that lands on those same values says nothing. There is
 * deliberately no additional "did I already say this sentence?" memory on top — moving a bar back
 * to where it was an hour ago is news again, and suppressing it would be the only case in which
 * this hook withheld a fact that had genuinely changed.
 *
 * **Both sentences arrive in ONE `announce()` call.** The shared announcer clears and re-sets a
 * single region, so a second call in the same frame overwrites the first — two calls would risk
 * speaking one fact and dropping the other, which is the failure ADR-0073 is about.
 *
 * **Reset across plans is the host's remount**, not a key here: both workspaces render the panel as
 * `key={model.planId}`, so a plan switch builds a new hook with no note, no baseline and no memory.
 *
 * Pure of network by construction: it takes values, never queries. The ADR-0032 coalescer
 * (`usePlanAutoRecalc`) is **not modified** — this reads its `isPending` and nothing more.
 */
export function useRecalcOutcomeAnnouncer({
  pending,
  activities,
  projectFinish,
  announce,
}: RecalcOutcomeAnnouncerInput): RecalcOutcomeAnnouncer {
  // Latest values, read inside the settle effect and by `noteEdit`. Updated in an effect rather than
  // during render (the `usePlanAutoRecalc` house pattern) and declared FIRST, so the settle effect
  // below — which fires on a `pending` transition, not on a value change — never reads the render
  // that armed it.
  const latest = useRef({ activities, projectFinish, announce });
  useEffect(() => {
    latest.current = { activities, projectFinish, announce };
  });

  const baselineRef = useRef<OutcomeBaseline | null>(null);
  const wasPendingRef = useRef(pending);

  const noteEdit = useCallback((activityId: string): void => {
    const { activities: rows, projectFinish: finish } = latest.current;
    const activity = rows.find((a) => a.id === activityId);
    baselineRef.current = {
      activityId,
      earlyStart: activity?.earlyStart ?? null,
      earlyFinish: activity?.earlyFinish ?? null,
      projectFinish: finish,
    };
  }, []);

  useEffect(() => {
    const settled = wasPendingRef.current && !pending;
    wasPendingRef.current = pending;
    if (!settled) return;
    const baseline = baselineRef.current;
    if (!baseline) return;
    // Consume the note whatever the outcome: a later settle the planner did not cause must not be
    // narrated as though they had.
    baselineRef.current = null;

    const { activities: rows, projectFinish: finish, announce: say } = latest.current;
    const activity = rows.find((a) => a.id === baseline.activityId);
    const sentences: string[] = [];
    if (
      activity &&
      activity.earlyStart !== null &&
      activity.earlyFinish !== null &&
      (activity.earlyStart !== baseline.earlyStart || activity.earlyFinish !== baseline.earlyFinish)
    ) {
      sentences.push(
        `“${activity.name}” now ${formatCalendarDate(activity.earlyStart)} to ${formatCalendarDate(
          activity.earlyFinish,
        )}.`,
      );
    }
    if (finish !== null && finish !== baseline.projectFinish) {
      sentences.push(`Project finish moved to ${formatCalendarDate(finish)}.`);
    }
    if (sentences.length === 0) return;
    say(sentences.join(' '));
  }, [pending]);

  return { noteEdit };
}
