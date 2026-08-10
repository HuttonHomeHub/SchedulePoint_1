import { describe, expect, it } from 'vitest';

import {
  agoLabel,
  lastRunSentence,
  oldestSentence,
  overdueSentence,
  scheduleSentence,
  statusSentence,
  tableLabel,
} from './retention-copy';

import type { RetentionTable } from '@/features/staff/api/staff-health';

/**
 * The distinctions, tested as copy (ADR-0087 M3, spec §4.9).
 *
 * Each pair below is two states a careless sentence collapses, and each collapse has the same
 * consequence: the console reports a broken installation as a working one. That is the single
 * failure this milestone exists to prevent, so it is asserted at the level where the decision is
 * made rather than through a rendered DOM.
 */
const NOW = new Date('2026-08-10T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function row(over: Partial<RetentionTable> = {}): RetentionTable {
  return {
    table: 'csp_reports',
    retentionDays: 30,
    oldestAt: ago(5 * 24 * 60 * 60 * 1000),
    oldestAgeDays: 5,
    overdue: false,
    lastDeleted: 0,
    cappedOut: false,
    failed: false,
    ...over,
  };
}

describe('agoLabel', () => {
  it('reaches days, because "72 hours ago" buries the alarming part', () => {
    // The plan lock's version of this helper caps at hours. Here the sentence it feeds is
    // "started x ago and has not swept", where days are exactly the fact worth seeing.
    expect(agoLabel(ago(3 * 24 * 60 * 60 * 1000), NOW)).toBe('3 days ago');
  });

  it('singularises', () => {
    expect(agoLabel(ago(60 * 60 * 1000), NOW)).toBe('1 hour ago');
    expect(agoLabel(ago(60 * 1000), NOW)).toBe('1 minute ago');
  });

  it('says "just now" rather than "0 minutes ago"', () => {
    expect(agoLabel(ago(1000), NOW)).toBe('just now');
  });

  it('never counts backwards when the clocks disagree', () => {
    expect(agoLabel(new Date(NOW + 60_000).toISOString(), NOW)).toBe('just now');
  });
});

describe('scheduleSentence', () => {
  it('says NOTHING when the sweep is disabled, so no last-run time can leak out', () => {
    // A timestamp beside "disabled" reads as health: the sweep looks like it ran recently and the
    // reader has to work out for themselves that it will never run again. Null rather than a
    // sentence, because disabled is a state with an action attached and that belongs in the
    // panel's alert — saying it in both places is the duplication ADR-0077 M8 removed.
    expect(
      scheduleSentence(
        {
          enabled: false,
          intervalMinutes: 60,
          lastRunAt: ago(5 * 60 * 1000),
          processStartedAt: ago(60 * 60 * 1000),
        },
        NOW,
      ),
    ).toBeNull();
  });

  it('reads a null last-run against the process start', () => {
    // "Has not swept" means something different two minutes after a deploy than three days after
    // one, and the store is in memory — so the two facts have to travel together or neither is
    // interpretable.
    const schedule = scheduleSentence(
      {
        enabled: true,
        intervalMinutes: 60,
        lastRunAt: null,
        processStartedAt: ago(3 * 24 * 60 * 60 * 1000),
      },
      NOW,
    );

    expect(schedule?.text).toContain('has not swept yet');
    expect(schedule?.text).toContain('3 days ago');
  });

  it('does NOT escalate a process that has only just started', () => {
    // The boot sweep is unawaited, so a moment between boot and the first result is routine.
    expect(
      scheduleSentence(
        {
          enabled: true,
          intervalMinutes: 60,
          lastRunAt: null,
          processStartedAt: ago(2 * 60 * 1000),
        },
        NOW,
      )?.overdue,
    ).toBe(false);
  });

  it('escalates "has not swept yet" once a whole interval has passed', () => {
    // The panel's single most alarming state, and the first version drew it in the same muted body
    // text as the healthy one — a real problem rendered identically to no problem, which is the
    // lit-but-inert shape ADR-0059 M6 and ADR-0062 M6 both record. The accessibility and UX reviews
    // found it independently.
    expect(
      scheduleSentence(
        {
          enabled: true,
          intervalMinutes: 60,
          lastRunAt: null,
          processStartedAt: ago(3 * 24 * 60 * 60 * 1000),
        },
        NOW,
      )?.overdue,
    ).toBe(true);
  });

  it('states when it last swept, and how often', () => {
    const schedule = scheduleSentence(
      {
        enabled: true,
        intervalMinutes: 60,
        lastRunAt: ago(10 * 60 * 1000),
        processStartedAt: ago(3 * 60 * 60 * 1000),
      },
      NOW,
    );

    expect(schedule?.text).toContain('10 minutes ago');
    expect(schedule?.text).toContain('60 minutes');
    expect(schedule?.overdue).toBe(false);
  });
});

describe('statusSentence', () => {
  const table = (over: Partial<RetentionTable> = {}) => row(over);

  it('NEVER says every table is inside its period while the sweep is failing', () => {
    // **The defect this function exists to fix.** The first version branched
    // disabled → overdue-count → healthy and never consulted `consecutiveFailures`, so a sweep that
    // had failed three runs in a row — but whose tables had not yet crossed their thresholds —
    // announced "every table is inside its period" on the one polite channel that exists to state
    // the settled result, while the visible alert said the opposite two elements away. Found by the
    // accessibility review, which also named the cause: nothing tested a failing sweep together
    // with a zero overdue count.
    const sentence = statusSentence({
      enabled: true,
      consecutiveFailures: 3,
      tables: [table({ overdue: false })],
    });

    expect(sentence).not.toContain('inside its period');
    expect(sentence).toContain('3 sweeps failed');
  });

  it('says a failing sweep ALSO has tables past their period, when it does', () => {
    // The compound fact is more urgent than either half, and reading the table rows to discover it
    // is the work this line exists to save.
    expect(
      statusSentence({
        enabled: true,
        consecutiveFailures: 2,
        tables: [table({ overdue: true }), table({ overdue: false })],
      }),
    ).toContain('1 already past its period');
  });

  it('composes disabled with overdue rather than dropping one', () => {
    expect(
      statusSentence({
        enabled: false,
        consecutiveFailures: 0,
        tables: [table({ overdue: true }), table({ overdue: true })],
      }),
    ).toBe('Retention: sweeping is disabled. 2 already past its period.');
  });

  it('says the healthy thing only when it is true', () => {
    expect(statusSentence({ enabled: true, consecutiveFailures: 0, tables: [table()] })).toBe(
      'Retention: every table is inside its period.',
    );
  });

  it('counts overdue tables when nothing has failed', () => {
    expect(
      statusSentence({
        enabled: true,
        consecutiveFailures: 0,
        tables: [table({ overdue: true }), table({ overdue: false })],
      }),
    ).toBe('Retention: 1 table is overdue.');
  });
});

describe('oldestSentence', () => {
  it('says "no rows" for an empty table, never "0 days"', () => {
    // Zero is a measurement of something present. An empty table has nothing to measure, and
    // printing a number for it states a fact the response does not carry.
    expect(oldestSentence({ oldestAgeDays: null })).toBe('no rows');
  });

  it('distinguishes a table whose oldest row is new', () => {
    expect(oldestSentence({ oldestAgeDays: 0 })).toBe('less than a day');
  });

  it('singularises a day', () => {
    expect(oldestSentence({ oldestAgeDays: 1 })).toBe('1 day');
  });
});

describe('overdueSentence', () => {
  it('carries the number the claim rests on', () => {
    // Without it an operator has to open a shell to check what "overdue" is based on, which is the
    // thing this console exists to avoid.
    expect(overdueSentence(row({ overdue: true, oldestAgeDays: 400 }))).toContain('400 days old');
    expect(overdueSentence(row({ overdue: true, oldestAgeDays: 400 }))).toContain('30-day period');
    // And NOT the word itself: the badge beside it already says "Overdue", and repeating it makes
    // a screen reader say it twice in a row. Both the accessibility and component reviews raised it.
    expect(overdueSentence(row({ overdue: true, oldestAgeDays: 400 }))).not.toContain('Overdue');
  });

  it('says nothing when the table is inside its period', () => {
    expect(overdueSentence(row())).toBeNull();
  });
});

describe('lastRunSentence', () => {
  it('separates "not swept yet" from "deleted nothing"', () => {
    // Collapsing these makes a dead sweep indistinguishable from an idle one — the single failure
    // this milestone exists to prevent.
    expect(lastRunSentence(row({ lastDeleted: null }))).toBe('Not swept yet');
    expect(lastRunSentence(row({ lastDeleted: 0 }))).toBe('0 deleted');
  });

  it('says a backlog remains when the run hit its cap', () => {
    expect(lastRunSentence(row({ lastDeleted: 50000, cappedOut: true }))).toContain('cap');
  });

  it('leads with the failure', () => {
    expect(lastRunSentence(row({ failed: true, lastDeleted: 0 }))).toBe('Last run failed');
  });
});

describe('tableLabel', () => {
  it('names the tables as an operator would say them', () => {
    expect(tableLabel('mail_events')).toBe('Mail events');
  });

  it('falls back to the raw name rather than to a blank', () => {
    // A table added without a label should read as unpolished, never as nameless.
    expect(tableLabel('something_new')).toBe('something_new');
  });
});
