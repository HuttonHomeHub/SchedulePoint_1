import type { PlanSummary } from '@repo/types';
import { useState } from 'react';

import { useSetPlanScheduleOption } from '../api/use-plans';

import { useAnnounce } from '@/components/ui/announcer';
import { TextField } from '@/components/ui/form';
import {
  DURATION_PARSE_MESSAGE,
  formatDurationText,
  parseDurationText,
  type DurationParseResult,
} from '@/lib/duration-text';

/**
 * The plan's **critical float threshold** — under the `TOTAL_FLOAT` definition an activity is critical
 * when its total float is at or below this, so it is the near-critical band a planner reaches for
 * constantly ("show me everything within five days of critical").
 *
 * It had **no control at all** until now (surface audit F7): the field was writable on the API, on the
 * shared type, and consumed by the engine, while every reference in the web app was a seed value in a
 * test fixture. It was therefore pinned at 0 on every plan in the system, and the only reason that was
 * survivable is the second half of the story — the value was stored in **days** and converted at a flat
 * 1440, so on an eight-hour calendar a 1-day threshold meant three working days of float (F8). Zero
 * times a wrong factor is still zero, which is why nobody was ever bitten and why building this control
 * without the F8 migration would have been the thing that bit them.
 *
 * Storage is now working **minutes**, so the value the engine compares is the value stored. This field
 * is the other half: it reads the ADR-0070 `d`/`h`/`m` grammar so a planner types `5d`, not `2400`.
 *
 * **Which calendar a day means, and why it is disclosed rather than solved.** `parseDurationText` takes
 * `hoursPerDay` as a required parameter by design (ADR-0070 §2 — there is no safe default after
 * ADR-0068), and the threshold is **plan-level** while total float is measured on each activity's
 * **own** calendar (ADR-0037 §4). On a mixed-calendar plan no single factor is right for every
 * activity. The plan calendar is the only defensible choice, so that is what this resolves against and
 * the hint says so out loud. That is a disclosure, not a fix: an activity on a different calendar is
 * still compared against a threshold entered in the plan calendar's days. Saying which day you are
 * typing in beats today, where nobody is told anything.
 *
 * Degrades to a plain minutes number when the plan's calendar hours cannot be resolved — the same rule
 * ADR-0070 §4 sets for the duration field, and the same code path, so the not-yet-loaded state and the
 * no-calendar state cannot rot apart.
 */
export function PlanCriticalFloatThresholdField({
  orgSlug,
  plan,
  hoursPerDay,
  canEdit,
}: {
  orgSlug: string;
  plan: PlanSummary;
  /** The plan calendar's working hours per day; `undefined` when it cannot be resolved. */
  hoursPerDay: number | undefined;
  canEdit: boolean;
}): React.ReactElement {
  const setOption = useSetPlanScheduleOption(orgSlug);
  const announce = useAnnounce();
  const server = plan.criticalFloatThresholdMinutes;
  // `null` = "showing the server's value"; a string = what the planner has typed since. Derived
  // rather than mirrored in an effect, which matters twice over: the React Compiler rejects
  // setState-in-effect, and an effect that re-seeds on `hoursPerDay` is EXACTLY the race that cost
  // ADR-0070 a defect (TECH_DEBT #83) — a keystroke and the calendar list resolving are independent
  // events, so a re-seed keyed on the factor can overwrite what was just typed. Deriving cannot:
  // once there is a draft it wins, and when there is none the display follows the server and the
  // factor for free.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const text = draft ?? displayFor(server, hoursPerDay);

  const commit = (): void => {
    const parsed = parse(text, hoursPerDay);
    if (!parsed.ok) {
      const message = DURATION_PARSE_MESSAGE[parsed.reason];
      setInvalid(message);
      // Commit happens on blur, so focus has already left the control the message is attached to —
      // `aria-describedby` alone would never be read out (WCAG 4.1.3).
      announce(message);
      return;
    }
    setInvalid(null);
    if (parsed.minutes === server) {
      setDraft(null); // Same value, differently spelled (`120m` for `2h`) — snap back to the canonical form.
      return;
    }
    setOption.mutate(
      {
        planId: plan.id,
        version: plan.version,
        patch: { criticalFloatThresholdMinutes: parsed.minutes },
      },
      {
        onSuccess: () => {
          setDraft(null); // Follow the refetched plan rather than the text that produced it.
          announce(`Critical float threshold set to ${displayFor(parsed.minutes, hoursPerDay)}.`);
        },
        // Drop the draft so the field shows what the plan actually has: it is the one place a planner
        // would otherwise be left looking at a number the server rejected.
        onError: (error) => {
          setDraft(null);
          announce(`Critical float threshold not saved. ${error.message}`);
        },
      },
    );
  };

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-1">
        <dt className="text-muted-foreground">Critical float threshold</dt>
        <dd>{displayFor(server, hoursPerDay)}</dd>
      </div>
    );
  }

  const message = invalid ?? (setOption.isError ? setOption.error.message : undefined);
  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <TextField
        label="Critical float threshold"
        value={text}
        disabled={setOption.isPending}
        aria-busy={setOption.isPending}
        hint={hintFor(hoursPerDay, setOption.isPending)}
        {...(message === undefined ? {} : { error: message })}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
    </div>
  );
}

/** Can this field read the `d`/`h`/`m` grammar right now? Mirrors {@link canAuthorSubDay}. */
function resolvable(hoursPerDay: number | undefined): hoursPerDay is number {
  return hoursPerDay !== undefined && hoursPerDay > 0;
}

function displayFor(minutes: number, hoursPerDay: number | undefined): string {
  return resolvable(hoursPerDay) ? formatDurationText(minutes, hoursPerDay) : String(minutes);
}

function parse(text: string, hoursPerDay: number | undefined): DurationParseResult {
  if (resolvable(hoursPerDay)) return parseDurationText(text, hoursPerDay);
  // Degraded: minutes only, because minutes is the one unit that needs no factor.
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const minutes = Number(trimmed);
  if (!Number.isInteger(minutes)) return { ok: false, reason: 'unreadable' };
  if (minutes < 0) return { ok: false, reason: 'negative' };
  return { ok: true, minutes };
}

function hintFor(hoursPerDay: number | undefined, busy: boolean): string {
  if (busy) return 'Saving…';
  if (!resolvable(hoursPerDay)) {
    return 'Working minutes. An activity is critical when its total float is at or below this.';
  }
  const hours = Number.isInteger(hoursPerDay) ? String(hoursPerDay) : hoursPerDay.toFixed(1);
  return (
    `Days, hours or minutes — for example 5d, 4h or 90m. A day is ${hours} working hours on the ` +
    `PLAN calendar; an activity on its own calendar is still compared against this figure. ` +
    `An activity is critical when its total float is at or below it.`
  );
}
