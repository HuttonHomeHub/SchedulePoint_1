import type { StaffHealth } from '@/features/staff/api/staff-health';

/**
 * Every resting sentence on the staff console, in one place (staff console redesign M3, spec §4.9).
 *
 * **Plain language, for a reader who is not a developer.** One sentence per box at rest, a second
 * only when something is wrong, numbers stated rather than implied, and **no ADR number, SQL verb
 * or environment variable** outside a "How to fix" body. `copy.structural.test.ts` is the gate for
 * that last rule (SC-9): it scans the staff surface's string literals, with `howToFix` bodies
 * excluded, so the technical step lives where a reader chooses to open it and nowhere else.
 *
 * The sentences that depend on data are functions here, so they are unit-tested without rendering
 * a screen. The ones owned elsewhere stay there: the diagnostics questions are `diagnostics-report`'s
 * (ADR-0140), and the retention tables' own cells are `retention-copy`'s.
 */

export interface GroupCopy {
  id: string;
  title: string;
  description: string;
}

/** The four groups under the summary, in page order. `id` is the anchor the nav links to. */
export const GROUPS = {
  conditions: {
    id: 'staff-group-conditions',
    title: 'Conditions',
    description: 'Things that are happening now and may need action.',
  },
  installation: {
    id: 'staff-group-installation',
    title: 'This installation',
    description: 'How this copy of SchedulePoint is set up.',
  },
  tools: {
    id: 'staff-group-tools',
    title: 'Tools',
    description: 'Checks you can run when you need them.',
  },
  record: {
    id: 'staff-group-record',
    title: 'Record',
    description: 'What staff have done here.',
  },
} as const satisfies Record<string, GroupCopy>;

export const HEADER = {
  description: (email: string): string =>
    `Signed in as ${email}. Staff can see how this installation is running, but not anyone's plans.`,
  dualHat:
    'This account is also a member of an organisation. Nothing you do here is done as that member.',
  refreshNote: 'Each refresh is recorded in Staff activity.',
} as const;

export const MAIL = {
  intro: 'Emails the app sends: sign-in confirmations, invitations and password resets.',
  notSetUp: {
    verdict: 'Not set up',
    sentence:
      'Emails are written to the server log instead of being sent, so nobody receives them.',
  },
  failures: (n: number): { verdict: string; sentence: string } => ({
    verdict: 'Some emails failed',
    sentence: `${String(n)} ${n === 1 ? 'email' : 'emails'} failed in the last 24 hours. The list below says which and why.`,
  }),
  healthy: 'Working. No emails have failed in the last 24 hours.',
  caption: 'Recent failed emails',
  empty: 'No emails have failed.',
  status: (health: StaffHealth): string =>
    !health.transportConfigured
      ? 'Mail: not set up.'
      : `Mail: ${String(health.failuresLast24h)} failed in the last 24 hours.`,
} as const;

export const RETENTION = {
  intro: 'Some records are deleted automatically once they reach a set age.',
  off: {
    verdict: 'Switched off',
    sentence: 'Old records are not being deleted, so they keep building up.',
  },
  failing: (
    failures: number,
    intervalMinutes: number,
    told: boolean,
  ): { verdict: string; sentence: string } => ({
    verdict: 'Not working',
    sentence: `The last ${String(failures)} ${failures === 1 ? 'run' : 'runs'} failed. It tries again ${intervalMinutes === 60 ? 'every hour' : `every ${String(intervalMinutes)} minutes`}. ${told ? 'An alert was sent.' : 'Nobody has been told, because alerts are off.'}`,
  }),
  stuck: {
    verdict: 'Not running',
    sentence: "It should have run by now and hasn't. Restarting SchedulePoint usually clears this.",
  },
  caption: 'What is cleared, and when',
  /** The footnote is always shown and is the table's description target. */
  footnote:
    "The audit log is never cleared. It is kept permanently on purpose, so the record of who did what can't be removed.",
} as const;

export const SECURITY = {
  intro:
    'When a browser blocks something on this site for security reasons, it can report it here.',
  /** Always shown, and the table's description target: it changes how an empty list reads. */
  caveat:
    "This list may be incomplete. Browsers don't always send these reports, so an empty list doesn't prove nothing was blocked.",
  caption: 'Blocked or reported by browsers, most recent first',
  empty: 'No reports received.',
} as const;

export const ACCOUNTS = {
  none: 'Everyone has confirmed their email address.',
  some: (n: number): string =>
    `${String(n)} ${n === 1 ? 'person has' : 'people have'} signed up but not confirmed their email, so they can't sign in yet.`,
  caption: 'Unconfirmed accounts, oldest first',
  showing: (shown: number, total: number): string =>
    `Showing ${String(shown)} of ${String(total)}.`,
  allShown: (total: number): string => `All ${String(total)} are shown.`,
  loadingMore: 'Loading more accounts…',
  announceShown: (shown: number, total: number): string =>
    `Showing ${String(shown)} of ${String(total)} unconfirmed accounts.`,
} as const;

export const INSTALLATION = {
  confirmationOff: 'No: people can sign in without confirming their email',
  lockOff: 'Off: two people can change the same plan at once',
} as const;

export const ALERTING = {
  intro: 'Whether anyone outside this page hears about a problem.',
  mailOff: 'Off: nobody is told when emails fail',
  uptimeOff: 'Off: nothing notices if SchedulePoint goes down',
} as const;

export const DIAGNOSTICS = {
  intro:
    'Counts records that may need attention across all organisations. It only ever returns numbers, never names, plans or customers.',
  copyUnavailable: 'Run diagnostics first.',
  copyWaiting: 'Wait for this run to finish.',
  error:
    "Diagnostics didn't finish. Try again. If it keeps failing, the server log has the reason.",
  found: (n: number): string => `${String(n)} ${n === 1 ? 'check' : 'checks'} found something`,
  nothing: (n: number): string => `${String(n)} ${n === 1 ? 'check' : 'checks'} found nothing`,
  showAll: (total: number): string => `Show all ${String(total)}`,
} as const;

export const PERFORMANCE = {
  intro:
    'Measurements are taken on this computer, not the server, so results depend on the machine you use.',
} as const;

export const ACTIVITY = {
  intro:
    'Everything staff have done here, newest first. Opening or refreshing this page is recorded too.',
  caption: 'Staff actions, most recent first',
  empty: 'Nothing recorded yet.',
} as const;

/** The one sentence the page speaks when every read has settled. */
export function loadedAnnouncement(headline: string): string {
  return `Staff console loaded. ${headline}`;
}

/** What Refresh says when it finishes. `reset` is true when a longer accounts list went back to page 1. */
export function refreshedAnnouncement(headline: string, firstPageSize: number | null): string {
  const tail =
    firstPageSize === null
      ? ''
      : ` Showing the first ${String(firstPageSize)} unconfirmed accounts.`;
  return `Refreshed. ${headline}${tail}`;
}
