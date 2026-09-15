import type { CspReportRow } from '@/features/staff/api/staff-csp-reports';
import type { StaffHealth } from '@/features/staff/api/staff-health';
import type { StaffAccounts, StaffInstallation } from '@/features/staff/api/staff-panels';

/**
 * The console's one-line answer to "is anything wrong right now?", derived rather than reported.
 *
 * **It is pure, React-free and fetch-free, and it takes query results as ARGUMENTS.** That is not
 * tidiness: reading a staff panel is an audited act on the server, so a summary that called
 * `useStaffAccounts()` for itself would issue a second request and write a second
 * `staff.panel_read` row on every page load — and `useStaffAccounts(cursor)` is keyed by its cursor
 * (`staff-panels.ts:63`), so a summary calling it with no cursor while the panel holds one after
 * *Show older* would be a genuinely different query rather than a deduped one. The component that
 * renders this must not call hooks either; the page root passes what it already has.
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
  /** What is wrong, in one sentence. Null when the check is healthy — there is nothing to say. */
  sentence: string | null;
  /** The `id` of the section that answers this check, for the summary's link. */
  sectionId: string;
}

/** Severity order. `ATTENTION` first because it is the only state with something to do about it. */
const SEVERITY: Record<CheckState, number> = {
  ATTENTION: 0,
  UNREADABLE: 1,
  PENDING: 2,
  HEALTHY: 3,
};

/** The verdict word and tone for each state — one table, so the two channels cannot disagree. */
const VERDICT: Record<CheckState, { verdictLabel: string; tone: CheckView['tone'] }> = {
  ATTENTION: { verdictLabel: 'Needs attention', tone: 'fail' },
  UNREADABLE: { verdictLabel: 'Could not be read', tone: 'muted' },
  PENDING: { verdictLabel: 'Checking', tone: 'muted' },
  HEALTHY: { verdictLabel: 'OK', tone: 'pass' },
};

/**
 * The section each check links to — **the section that ANSWERS it**, not the one whose name sounds
 * closest.
 *
 * `alerting` pointed at `staff-section-installation` until the M6 gate pass, and two reviewers found
 * it independently. Installation renders the API version, the environment, the mail host and the
 * staff count; it says nothing about alerting or heartbeats in its body or its status sentence.
 * Everything a reader needs — the two badges and the two remedy sentences naming `MAIL_ALERT_URL`
 * and `HEARTBEAT_URL` — is in `MailSection`, inside the merged health card. So a reader who saw
 * "Failure alerting — Needs attention" and activated the row was moved to, and focused on, a section
 * containing nothing about what they had just been told.
 *
 * That is the shape this epic exists to remove, arriving inside its own headline feature: the
 * mechanism was built correctly — a whole-row link, a focusable destination, announced focus — and
 * pointed at the wrong place. `check-answers-its-link.test.tsx` is the gate, because every
 * assertion that existed checked the href's SHAPE and never that the destination says anything
 * about the check.
 *
 * `retention` shares `mail`'s id deliberately and not by oversight: the spec asked the summary to
 * link to the **subsection**, and only the outer `SectionCard` carries `tabIndex={-1}`, so an
 * anchor to the inner `<h3>` would move the viewport and leave focus where it was — silently
 * dropping the guarantee the link exists for. The card's heading names both subjects.
 */
export const CHECK_SECTION_ID: Record<CheckId, string> = {
  mail: 'staff-section-health',
  retention: 'staff-section-health',
  security: 'staff-section-security',
  accounts: 'staff-section-accounts',
  alerting: 'staff-section-health',
};

const LABEL: Record<CheckId, string> = {
  mail: 'Mail delivery',
  retention: 'Retention sweeping',
  security: 'Content-Security-Policy',
  accounts: 'Account verification',
  alerting: 'Failure alerting',
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
  /** Every check, severity-ordered. Always all of them — a check is never omitted. */
  checks: CheckView[];
  /** The checks that are not healthy, in the same order. The summary's rows. */
  problems: CheckView[];
  /** True only when every check is `HEALTHY` — never when one is pending or unreadable. */
  allHealthy: boolean;
  /**
   * The sentence the summary announces, enumerating **what was checked**.
   *
   * It names the subjects rather than counting them, so "everything is fine" cannot quietly come to
   * cover less than it claims: removing a check from `CHECK_IDS` changes this string, and there is
   * a test that says so.
   */
  sentence: string;
}

/** Resolve one query into a state, with `isPending`/`isError` taking precedence over any data. */
function stateOf<T>(query: QueryFacts<T>, verdict: (data: T) => boolean): CheckState {
  if (query.isPending) return 'PENDING';
  if (query.isError || query.data === undefined) return 'UNREADABLE';
  return verdict(query.data) ? 'ATTENTION' : 'HEALTHY';
}

/**
 * Derive the console's status from what the page has already fetched.
 *
 * Every sentence names the number the claim rests on. "Some accounts cannot sign in" sends a reader
 * to count them; "68 accounts cannot complete verification-gated sign-in" is the fact itself.
 */
export function deriveConsoleStatus(input: ConsoleStatusInput): ConsoleStatus {
  const sentences: Partial<Record<CheckId, string>> = {};

  const states: Record<CheckId, CheckState> = {
    mail: stateOf(input.health, (data) => {
      if (!data.transportConfigured) {
        sentences.mail = 'No mail transport is configured, so nothing is being delivered.';
        return true;
      }
      if (data.failuresLast24h > 0) {
        sentences.mail = `${String(data.failuresLast24h)} mail failures in the last 24 hours.`;
        return true;
      }
      return false;
    }),
    retention: stateOf(input.health, (data) => {
      const retention = data.retention;
      if (!retention.enabled) {
        sentences.retention = 'Retention sweeping is disabled, so nothing is being deleted.';
        return true;
      }
      if (retention.consecutiveFailures > 0) {
        sentences.retention = `The last ${String(retention.consecutiveFailures)} sweeps failed.`;
        return true;
      }
      const overdue = retention.tables.filter((table) => table.overdue).length;
      if (overdue > 0) {
        sentences.retention = `${String(overdue)} ${overdue === 1 ? 'table is' : 'tables are'} past the period they are kept for.`;
        return true;
      }
      return false;
    }),
    security: stateOf(input.security, (rows) => {
      if (rows.length === 0) return false;
      const blocked = rows.reduce((total, row) => total + row.count, 0);
      sentences.security = `${String(rows.length)} ${rows.length === 1 ? 'directive has' : 'directives have'} been violated, ${String(blocked)} times in total.`;
      return true;
    }),
    accounts: stateOf(input.accounts, (data) => {
      if (data.unverifiedTotal === 0) return false;
      sentences.accounts = `${String(data.unverifiedTotal)} ${data.unverifiedTotal === 1 ? 'account' : 'accounts'} cannot complete verification-gated sign-in.`;
      return true;
    }),
    /**
     * Whether anybody would LEARN of a failure — deliberately its own check rather than a clause on
     * mail's. It is the one condition on this page that is invisible by construction: with neither
     * webhook set, every other check can go wrong and the first anybody hears of it is a person
     * opening this console. `docs/TECH_DEBT.md` #100 records it as open on the operator half.
     */
    alerting: stateOf(input.installation, (data) => {
      const missing = [
        data.mailAlertingConfigured ? null : 'mail failures',
        data.heartbeatConfigured ? null : 'the API going down',
      ].filter((item): item is string => item !== null);
      if (missing.length === 0) return false;
      sentences.alerting = `Nothing will report ${missing.join(' or ')} — only this screen will.`;
      return true;
    }),
  };

  const checks: CheckView[] = CHECK_IDS.map((id) => ({
    id,
    label: LABEL[id],
    state: states[id],
    verdictLabel: VERDICT[states[id]].verdictLabel,
    tone: VERDICT[states[id]].tone,
    sentence: sentences[id] ?? null,
    sectionId: CHECK_SECTION_ID[id],
  })).sort(
    (a, b) =>
      SEVERITY[a.state] - SEVERITY[b.state] || CHECK_IDS.indexOf(a.id) - CHECK_IDS.indexOf(b.id),
  );

  const problems = checks.filter((check) => check.state !== 'HEALTHY');
  const allHealthy = problems.length === 0;

  return { checks, problems, allHealthy, sentence: sentenceFor(checks) };
}

/** The checks in a given state, lower-cased and joined, for a clause. */
function named(checks: CheckView[], state: CheckState): string {
  return checks
    .filter((check) => check.state === state)
    .map((check) => check.label.toLowerCase())
    .join(', ');
}

/**
 * The console's headline, which must distinguish the same four states the badges do.
 *
 * **It did not, and the M6 UX review found it.** The sentence folded everything that is not
 * `HEALTHY` into the words "need attention" — so on every ordinary page load, before any of the four
 * queries had settled, the console's first paint read
 * **"5 of 5 checks need attention: mail delivery, retention sweeping, …"**. An alarming, false claim,
 * on the one screen whose entire job is answering _is anything wrong right now?_, and a direct
 * contradiction of this module's own docblock four screens up — which says in as many words that a
 * console answering the reader's question wrongly while a request is in flight is worse than one
 * that says nothing.
 *
 * The badges were right throughout (`VERDICT` has four entries), which is why nothing looked wrong
 * in either file: the per-check channel and the aggregate channel disagreed, and only the aggregate
 * was false. Untested, too — every sentence assertion was for the all-healthy case or for a
 * per-check sentence, and the spec's own edge-case table named both of these states explicitly.
 *
 * Clauses are ordered by severity and only non-empty ones are emitted, so a mixed page says all
 * three things in one sentence rather than picking the loudest and hiding the rest.
 */
function sentenceFor(checks: CheckView[]): string {
  const attention = named(checks, 'ATTENTION');
  const unreadable = named(checks, 'UNREADABLE');
  const pending = named(checks, 'PENDING');

  const clauses = [
    attention === '' ? null : `needs attention: ${attention}`,
    unreadable === '' ? null : `could not be read: ${unreadable}`,
    pending === '' ? null : `still checking: ${pending}`,
  ].filter((clause): clause is string => clause !== null);

  if (clauses.length === 0) {
    return `Nothing needs attention. Checked ${CHECK_IDS.map((id) => LABEL[id].toLowerCase()).join(', ')}.`;
  }

  // The count is of what NEEDS ATTENTION, and it is omitted entirely when nothing does — "0 of 5
  // checks" beside "still checking: …" reads as a verdict on a page that has not got one yet.
  const attentionCount = checks.filter((check) => check.state === 'ATTENTION').length;
  const head =
    attentionCount === 0 ? '' : `${String(attentionCount)} of ${String(CHECK_IDS.length)} checks `;
  return `${head}${clauses.join('; ')}.`;
}
