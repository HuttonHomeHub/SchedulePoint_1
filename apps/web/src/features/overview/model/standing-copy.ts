import type { BaselineMovement, PlanStanding } from '@repo/types';

/**
 * The sentences "Where the work stands" is allowed to say.
 *
 * **Every absent fact is a sentence, never a dash.** ADR-0061's `ContextStrip` finding is the whole
 * reason this module exists: a row of em dashes reads as breakage, and a reader cannot tell "we
 * have not computed this" from "the screen is broken". So each of the five `NOT_ASSESSABLE` reasons
 * gets its own sentence, and each sentence names **the thing to do about it** rather than the thing
 * that failed — which is also why the reason ladder is ordered as it is on the server.
 *
 * **Direction is carried by the WORD, never by colour** (WCAG 1.4.1). "14 working days later" says
 * which way it moved to a reader who cannot distinguish the tones, to one reading a printout, and
 * to one listening; the tone is a second channel on top, not the channel.
 *
 * It is a pure module rather than JSX so the sentences can be unit-tested as strings, and so that
 * the forbidden-phrase gate (`freshness-copy.structural.test.ts`) scans one file rather than
 * chasing template literals through a component tree.
 */

/** What a reader should do next, per reason. Five reasons, five different actions. */
const NOT_ASSESSABLE_COPY: Record<
  Extract<BaselineMovement, { kind: 'NOT_ASSESSABLE' }>['reason'],
  string
> = {
  // Not "no baseline" alone: the sentence says what a baseline is FOR, because a planner who has
  // never captured one does not know what the row is offering them.
  NO_BASELINE: 'No baseline to measure against — capture one to start tracking movement',
  BASELINE_HAS_NO_FINISH: 'Its baseline recorded no finish date — capture a new one',
  PLAN_NOT_SCHEDULED: 'Not yet calculated, so it has no finish date yet',
  PLAN_EMPTY: 'No activities yet',
  // Deliberately names the calendar rather than the plan: the plan is fine and the calendar is the
  // thing to go and fix, and a reader told "this plan is broken" would look in the wrong place.
  CALENDAR_UNUSABLE: 'Its calendar has no working time, so movement cannot be measured',
};

/**
 * One sentence for a plan's movement.
 *
 * The moved case names the baseline. Not because a plan has several at once — `uq_baselines_plan_active`
 * guarantees exactly one is active — but because which one that is CHANGES: a programme re-baselined
 * after a variation is measured against the new commitment from that moment on, and "14 working days
 * later" with no name is a number whose meaning silently moved under the reader.
 */
export function movementSentence(movement: BaselineMovement): string {
  if (movement.kind === 'NOT_ASSESSABLE') return NOT_ASSESSABLE_COPY[movement.reason];
  if (movement.kind === 'UNCHANGED') {
    return `Finishing as planned in “${movement.baselineName}”`;
  }
  const days = Math.abs(movement.workingDays);
  const unit = days === 1 ? 'working day' : 'working days';
  // "later"/"earlier" rather than a sign or an arrow. A `+12` needs a convention the reader has to
  // have been told; "12 working days later" does not.
  const direction = movement.workingDays > 0 ? 'later' : 'earlier';
  return `${String(days)} ${unit} ${direction} than “${movement.baselineName}”`;
}

/**
 * The tone a movement should be drawn in — **a second channel, never the only one.**
 *
 * `neutral` for everything that is not a slip, including a plan pulling in: finishing early is not
 * a success in construction (it usually means somebody's logic is wrong), so painting it green
 * would be the screen holding an opinion the data does not support.
 */
export function movementTone(movement: BaselineMovement): 'warning' | 'neutral' {
  return movement.kind === 'MOVED' && movement.workingDays > 0 ? 'warning' : 'neutral';
}

/** The human label for each engine flag. Unknown keys fall back to the key, never to silence. */
const FLAG_COPY: Record<string, (count: number) => string> = {
  constraintViolated: (n) => `${String(n)} constraint${n === 1 ? '' : 's'} broken by logic`,
  loeNoSpan: (n) => `${String(n)} level-of-effort activit${n === 1 ? 'y' : 'ies'} with no span`,
  resourceDriverMissing: (n) =>
    `${String(n)} resource-driven activit${n === 1 ? 'y' : 'ies'} with no driver`,
  visualConflict: (n) => `${String(n)} hand-placed activit${n === 1 ? 'y' : 'ies'} in conflict`,
};

/**
 * One sentence per non-zero flag.
 *
 * **An unrecognised key is rendered, not dropped.** The engine may grow a flag before this screen
 * learns its name, and a row that silently omits it would tell the reader everything is fine — the
 * exact failure this whole epic is about. A raw key is ugly and honest.
 */
export function flagSentences(flags: PlanStanding['flags']): string[] {
  return Object.entries(flags)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => FLAG_COPY[key]?.(count) ?? `${key}: ${String(count)}`);
}
