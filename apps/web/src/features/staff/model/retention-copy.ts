import type { RetentionTable } from '@/features/staff/api/staff-health';

/**
 * The words the Retention section uses (ADR-0087 M3).
 *
 * **Pure, and separate from the panel, because the distinctions are the feature.** Every state in
 * spec §4.9 exists to keep two things apart that a careless sentence collapses: an empty table from
 * one whose oldest row is new, a sweep that has not run from one that deleted nothing, a disabled
 * sweep from an idle one. Those are decisions about copy, so they are tested as copy rather than
 * asserted through a rendered DOM.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The tables, named as an operator would say them rather than as Postgres holds them. */
const TABLE_LABELS: Record<string, string> = {
  csp_reports: 'Policy violation reports',
  mail_events: 'Mail events',
};

export function tableLabel(table: string): string {
  // Falls back to the raw name rather than to a blank: a table added without a label here should
  // read as unpolished, never as nameless.
  return TABLE_LABELS[table] ?? table;
}

/**
 * How long ago, in the largest unit that is still honest.
 *
 * Days matter here in a way they do not for the plan lock's version of this, which caps at hours:
 * the sentence this feeds is "started _x_ ago and has not swept", and "72 hr ago" buries exactly
 * the fact that makes it alarming.
 */
export function agoLabel(iso: string, now: number = Date.now()): string {
  const delta = Math.max(0, now - new Date(iso).getTime());
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) {
    const mins = Math.floor(delta / MINUTE);
    return `${String(mins)} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (delta < DAY) {
    const hours = Math.floor(delta / HOUR);
    return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(delta / DAY);
  return `${String(days)} day${days === 1 ? '' : 's'} ago`;
}

/**
 * What the section says about the schedule itself.
 *
 * **Disabled returns null, and the panel says nothing here.** A timestamp beside "disabled" reads as
 * health — the sweep looks like it ran recently, and the reader has to work out that it will not run
 * again — so the two facts are mutually exclusive rather than merely ordered. And a *sentence* here
 * would be the wrong place for it besides: disabled is a state with an action attached (set the
 * variable), which belongs in the panel's alert, and saying it twice is the duplication ADR-0077 M8
 * spent a milestone removing. An interval is not a fact worth stating about a schedule that will
 * never fire again.
 *
 * **A null last-run is read against the process start**, because it means something different two
 * minutes after a deploy than three days after one. That is the whole reason `processStartedAt` is
 * on the response: the store is in memory and resets on restart, so "has not swept" is a statement
 * about this process and is only interpretable beside when this process began.
 */
export function scheduleSentence(
  retention: {
    enabled: boolean;
    intervalMinutes: number;
    lastRunAt: string | null;
    processStartedAt: string;
  },
  now: number = Date.now(),
): string | null {
  if (!retention.enabled) return null;
  if (retention.lastRunAt === null) {
    return `This process has not swept yet. It started ${agoLabel(retention.processStartedAt, now)} and sweeps every ${String(retention.intervalMinutes)} minutes.`;
  }
  return `Last swept ${agoLabel(retention.lastRunAt, now)}, every ${String(retention.intervalMinutes)} minutes.`;
}

/** What a table's age column says. */
export function oldestSentence(row: Pick<RetentionTable, 'oldestAgeDays'>): string {
  // "no rows" and not "0 days". Zero is a measurement of something present; this table has nothing
  // to measure, and printing a number for it states a fact the response does not carry.
  if (row.oldestAgeDays === null) return 'no rows';
  const days = row.oldestAgeDays;
  return days === 0 ? 'less than a day' : `${String(days)} day${days === 1 ? '' : 's'}`;
}

/**
 * Why a table is overdue, in words.
 *
 * **The word "overdue" carries the meaning; the badge only repeats it** (WCAG 1.4.1). And the
 * number that makes it true travels with it — an operator who cannot see what the claim is based on
 * has to go to a shell to check, which is the thing this console exists to avoid.
 */
export function overdueSentence(row: RetentionTable): string | null {
  if (!row.overdue || row.oldestAgeDays === null) return null;
  return `Overdue — the oldest row is ${String(row.oldestAgeDays)} days old against a ${String(row.retentionDays)}-day period.`;
}

/** What this process last did to a table, or the honest absence of it. */
export function lastRunSentence(row: RetentionTable): string {
  if (row.failed) return 'Last run failed';
  // Null is "has not swept"; zero is "swept and found nothing". Collapsing them would make a dead
  // sweep indistinguishable from an idle one, which is the single failure this milestone prevents.
  if (row.lastDeleted === null) return 'Not swept yet';
  if (row.cappedOut) return `${String(row.lastDeleted)} deleted (hit the per-run cap)`;
  return `${String(row.lastDeleted)} deleted`;
}
