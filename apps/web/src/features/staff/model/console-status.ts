import type { CspReportRow } from '@/features/staff/api/staff-csp-reports';
import type { StaffHealth } from '@/features/staff/api/staff-health';
import type { StaffAccounts, StaffInstallation } from '@/features/staff/api/staff-panels';
import { formatRelative } from '@/lib/relative-time';

/**
 * The console's one-line answer to "is anything wrong right now?", derived rather than reported.
 *
 * **It is pure, React-free and fetch-free, and it takes query results as ARGUMENTS.** That is not
 * tidiness: reading a staff panel is an audited act on the server, so a summary that called
 * `useStaffAccounts()` for itself would issue a second request and write a second
 * `staff.panel_read` row on every page load. (The accounts query is one infinite query, so the
 * panel's paging would not have split it — but the summary would still be a second observer to keep
 * in step.) The component that renders this must not call hooks either; the page root passes what it
 * already has.
 *
 * **The vocabulary is derived from `features/schedule-health/model/health-rows.ts`, not invented**
 * (ADR-0116, spec §8.10). That module is this one's design, shipped three weeks earlier and gated:
 * a pure view-model with a verdict expressed as a WORD (never colour alone — WCAG 1.4.1), a
 * four-valued tone, and a reason sentence for the state that cannot be assessed. Inventing a
 * parallel vocabulary here would remove four competing severity vocabularies from one page and add
 * a fifth across the product.
 */

/**
 * Every check the console can make.
 *
 * A **`const` tuple**, so `CheckId` is a closed union and `Record<CheckId, …>` is total: adding a
 * check without giving it a state is a typecheck failure rather than a silently missing row. The
 * ADR-0125 `?? 'HEALTHY'` lie — coalescing an unknown into "fine" — is the defect this shape exists
 * to make unwritable.
 */
export const CHECK_IDS = ['mail', 'retention', 'security', 'accounts', 'alerting'] as const;

export type CheckId = (typeof CHECK_IDS)[number];

/**
 * What a check can say.
 *
 * Four values and **no fifth meaning "probably fine"**. `PENDING` and `UNREADABLE` are the two that
 * a careless summary collapses into `HEALTHY`, and they are the two that matter most: a console
 * that says "everything is fine" while a request is in flight, or while one failed, is worse than
 * one that says nothing, because it answers the question the reader came with — wrongly.
 */
export type CheckState = 'ATTENTION' | 'UNREADABLE' | 'PENDING' | 'HEALTHY';

export interface CheckView {
  id: CheckId;
  /** The check's subject, as a reader would name it. */
  label: string;
  state: CheckState;
  /**
   * The verdict as a WORD, never a colour alone (WCAG 1.4.1) — `health-rows.ts:20`'s rule, and its
   * phrasing, so the two surfaces do not describe the same four states in different words.
   */
  verdictLabel: string;
  /** A tone token name the component maps to a colour; the `health-rows.ts:23` vocabulary. */
  tone: 'pass' | 'fail' | 'muted' | 'info';
  /**
   * The fact behind the verdict, in plain words — "Not set up: emails aren't being sent", "None
   * received". Every state has one, healthy included, so a row never answers "how bad?" with a bare
   * "OK" (staff console redesign, spec D-4, US-2).
   */
  value: string;
  /** The `id` of the section that answers this check, for the summary's link. */
  sectionId: string;
}

/** The verdict word and tone for each state — one table, so the two channels cannot disagree. */
const VERDICT: Record<CheckState, { verdictLabel: string; tone: CheckView['tone'] }> = {
  ATTENTION: { verdictLabel: 'Needs attention', tone: 'fail' },
  UNREADABLE: { verdictLabel: 'Could not be read', tone: 'muted' },
  PENDING: { verdictLabel: 'Checking', tone: 'muted' },
  HEALTHY: { verdictLabel: 'OK', tone: 'pass' },
};

/**
 * The section each check links to — **the box that ANSWERS it**, and no two checks share one.
 *
 * Until the staff console redesign (ADR-0178) three checks pointed at one box because mail, retention
 * and the alert switches were drawn from one response and so lived in one card. The card existed
 * because of a query, not a subject: two observers of one key are one request and one audited read,
 * so each check now has a box of its own. `check-answers-its-link.test.tsx` pins both halves — that
 * each destination is about its check, and that none is shared (SC-3).
 *
 * `alerting` points at the Alerts and monitoring box, which reads the **installation** response, the
 * same one this check reads, so the row and the box it opens cannot disagree (spec §0.12).
 */
export const CHECK_SECTION_ID: Record<CheckId, string> = {
  mail: 'staff-section-mail',
  retention: 'staff-section-retention',
  security: 'staff-section-security',
  accounts: 'staff-section-accounts',
  alerting: 'staff-section-alerting',
};

const LABEL: Record<CheckId, string> = {
  mail: 'Mail delivery',
  retention: 'Clearing old records',
  security: 'Browser security reports',
  accounts: 'Unconfirmed accounts',
  alerting: 'Alerts',
};

/**
 * One query's contribution, in the only three shapes a caller can be in.
 *
 * Deliberately NOT `UseQueryResult`: this module must not import React Query, or it stops being
 * testable without one and starts being able to grow a hook.
 */
export interface QueryFacts<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

export interface ConsoleStatusInput {
  health: QueryFacts<StaffHealth>;
  security: QueryFacts<CspReportRow[]>;
  accounts: QueryFacts<StaffAccounts>;
  installation: QueryFacts<StaffInstallation>;
}

export interface ConsoleStatus {
  /**
   * Every check, in the page's own order (the order of the boxes below the summary). Always all of
   * them — a check is never omitted. **Not sorted by severity**: a row that moves between visits
   * cannot be found by position, and the headline and each row's value now carry the severity
   * (ADR-0178, amending ADR-0143 D1).
   */
  checks: CheckView[];
  /** The checks that are not healthy, in the same order. */
  problems: CheckView[];
  /** How many checks could not be read — two or more earns the summary's Try again for all. */
  unreadableCount: number;
  /** True only when every check is `HEALTHY` — never when one is pending or unreadable. */
  allHealthy: boolean;
  /** The headline: what needs attention, in a grammatical sentence ("2 things need attention."). */
  sentence: string;
}

/** Resolve one query into a state, with `isPending`/`isError` taking precedence over any data. */
function stateOf<T>(query: QueryFacts<T>, verdict: (data: T) => boolean): CheckState {
  if (query.isPending) return 'PENDING';
  if (query.isError || query.data === undefined) return 'UNREADABLE';
  return verdict(query.data) ? 'ATTENTION' : 'HEALTHY';
}

/** "1 kind", "3 kinds" — a count with its noun, for the values below. */
function counted(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** What a check says while it has no answer. Both are stated, never left blank. */
const WAITING: Record<'PENDING' | 'UNREADABLE', string> = {
  PENDING: 'Checking…',
  UNREADABLE: "Couldn't load. See the box below",
};

/**
 * Derive the console's status from what the page has already fetched.
 *
 * Every value names the number the claim rests on. "Some accounts cannot sign in" sends a reader to
 * count them; "68 people can't sign in yet" is the fact itself.
 *
 * `now` is a parameter so the relative time in the retention value is testable and so one render
 * does not read the clock twice.
 */
export function deriveConsoleStatus(
  input: ConsoleStatusInput,
  now: Date = new Date(),
): ConsoleStatus {
  const values: Partial<Record<CheckId, string>> = {};

  const states: Record<CheckId, CheckState> = {
    mail: stateOf(input.health, (data) => {
      if (!data.transportConfigured) {
        values.mail = "Not set up: emails aren't being sent";
        return true;
      }
      if (data.failuresLast24h > 0) {
        values.mail = `${String(data.failuresLast24h)} failed in the last 24 hours`;
        return true;
      }
      values.mail = 'Working: none failed in the last 24 hours';
      return false;
    }),
    retention: stateOf(input.health, (data) => {
      const retention = data.retention;
      if (!retention.enabled) {
        values.retention = 'Switched off: old records are piling up';
        return true;
      }
      if (retention.consecutiveFailures > 0) {
        values.retention = `Last ${String(retention.consecutiveFailures)} ${retention.consecutiveFailures === 1 ? 'run' : 'runs'} failed`;
        return true;
      }
      const overdue = retention.tables.filter((table) => table.overdue).length;
      if (overdue > 0) {
        values.retention = `${counted(overdue, 'kind', 'kinds')} of record overdue`;
        return true;
      }
      values.retention =
        retention.lastRunAt === null
          ? 'Has not run yet'
          : `Ran ${formatRelative(retention.lastRunAt, now)}`;
      return false;
    }),
    security: stateOf(input.security, (rows) => {
      if (rows.length === 0) {
        values.security = 'None received';
        return false;
      }
      const blocked = rows.reduce((total, row) => total + row.count, 0);
      values.security = `${counted(rows.length, 'kind', 'kinds')} blocked, ${counted(blocked, 'time', 'times')}`;
      return true;
    }),
    accounts: stateOf(input.accounts, (data) => {
      if (data.unverifiedTotal === 0) {
        values.accounts = 'None';
        return false;
      }
      values.accounts = `${counted(data.unverifiedTotal, 'person', 'people')} can't sign in yet`;
      return true;
    }),
    /**
     * Whether anybody would LEARN of a failure — deliberately its own check rather than a clause on
     * mail's. It is the one condition on this page that is invisible by construction: with neither
     * webhook set, every other check can go wrong and the first anybody hears of it is a person
     * opening this console. `docs/TECH_DEBT.md` #100 records it as open on the operator half.
     */
    alerting: stateOf(input.installation, (data) => {
      const mailOff = !data.mailAlertingConfigured;
      const uptimeOff = !data.heartbeatConfigured;
      if (mailOff && uptimeOff) {
        values.alerting = 'Off: nobody is told when something fails';
        return true;
      }
      if (mailOff || uptimeOff) {
        values.alerting = `Partly on: ${mailOff ? 'mail alerts' : 'uptime check'} off`;
        return true;
      }
      values.alerting = 'On';
      return false;
    }),
  };

  const checks: CheckView[] = CHECK_IDS.map((id) => ({
    id,
    label: LABEL[id],
    state: states[id],
    verdictLabel: VERDICT[states[id]].verdictLabel,
    tone: VERDICT[states[id]].tone,
    value:
      states[id] === 'PENDING' || states[id] === 'UNREADABLE'
        ? WAITING[states[id]]
        : (values[id] ?? ''),
    sectionId: CHECK_SECTION_ID[id],
  }));

  const problems = checks.filter((check) => check.state !== 'HEALTHY');
  const allHealthy = problems.length === 0;
  const unreadableCount = checks.filter((check) => check.state === 'UNREADABLE').length;

  return { checks, problems, allHealthy, unreadableCount, sentence: sentenceFor(checks) };
}

/**
 * The console's headline, which must distinguish the same four states the badges do.
 *
 * **It once did not, and the M6 UX review found it**: everything that was not `HEALTHY` was folded
 * into "need attention", so the first paint of every ordinary load read "5 of 5 checks need
 * attention" before any query had settled — an alarming false claim on the screen whose whole job is
 * answering _is anything wrong right now?_. Each state has its own clause, and a clause is emitted
 * only when something is in that state.
 *
 * It is counted and grammatical ("1 thing needs attention.", "2 things need attention; 1 could not
 * be checked."). The earlier "2 of 5 checks needs attention: …" fragment is gone: the values on the
 * rows below now say which, so the headline need not list them.
 */
function sentenceFor(checks: CheckView[]): string {
  const count = (state: CheckState): number =>
    checks.filter((check) => check.state === state).length;
  const attention = count('ATTENTION');
  const unreadable = count('UNREADABLE');
  const pending = count('PENDING');

  const clauses = [
    attention === 0
      ? null
      : attention === 1
        ? '1 thing needs attention'
        : `${String(attention)} things need attention`,
    unreadable === 0 ? null : `${String(unreadable)} could not be checked`,
    pending === 0 || (attention === 0 && unreadable === 0)
      ? null
      : `${String(pending)} still being checked`,
  ].filter((clause): clause is string => clause !== null);

  if (clauses.length > 0) return `${clauses.join('; ')}.`;
  return pending > 0 ? 'Checking…' : 'Nothing needs attention.';
}
