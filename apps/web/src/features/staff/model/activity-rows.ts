import type { StaffActivityRow } from '@/features/staff/api/staff-panels';

/**
 * The audit action a console page load produces, once per panel.
 *
 * Reading a staff panel is an audited act (ADR-0086 D5), which is the point — it is what makes the
 * console a security improvement over a database shell rather than a new hole. The cost is that the
 * log's most frequent entry by far is the log being looked at.
 */
const PANEL_READ = 'staff.panel_read';

/** How many consecutive reads it takes before a run is worth collapsing. */
const MIN_RUN = 2;

export interface ActivityGroup {
  /** The newest member's id — stable across renders and unique, so it keys the row. */
  id: string;
  /** The newest member's timestamp. The run is a burst, so this is when it happened. */
  occurredAt: string;
  actorLabel: string | null;
  /** A single recorded event, or a run of consecutive panel reads by one actor. */
  kind: 'event' | 'panel-reads';
  /** For `event`: the raw action. Empty for a run. */
  action: string;
  /** For `event`: what it was about. Null for a run. */
  subjectLabel: string | null;
  /** For `panel-reads`: the distinct panels, in the order they appear. Empty for an event. */
  panels: string[];
  /** How many rows this stands for. Always 1 for an event, and never hidden. */
  count: number;
}

/**
 * Collapse consecutive panel reads by one actor into a single row.
 *
 * **The signal was buried by the console's own reads.** Opening `/staff` writes one
 * `staff.panel_read` per panel — six or seven rows, same actor, same second — so a page of fifty
 * entries is seven page loads and almost nothing else, and the rows that matter (a probe recorded,
 * a sign-in, a diagnostic run) sit between them where a reader has to hunt. Photographed
 * (`#165(e)`): the whole tail of the page was `panel read · <name>` repeating.
 *
 * **Nothing is hidden and the row says so.** The count is the number of entries the group stands
 * for, printed, and every panel is named — so a reader can still answer "was the accounts panel
 * read?" without expanding anything. This is a presentation of the rows the API returned, not a
 * filter: the API is untouched, the audit table is untouched, and a group of one is left alone
 * because a single read presented as a group would be a summary of nothing.
 *
 * **Consecutive, not merely adjacent-in-action.** A run ends at any other action — a `session
 * started`, a probe recorded — so two page loads either side of something else stay two groups, and
 * the log keeps its chronology. Grouping every panel read on the page into one row would lose the
 * fact that the console was opened seven separate times, which is itself the answer to a question
 * somebody may be asking.
 */
export function groupActivity(rows: readonly StaffActivityRow[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  let index = 0;

  while (index < rows.length) {
    const head = rows[index];
    if (head === undefined) break;

    if (head.action !== PANEL_READ) {
      groups.push({
        id: head.id,
        occurredAt: head.occurredAt,
        actorLabel: head.actorLabel,
        kind: 'event',
        action: head.action,
        subjectLabel: head.subjectLabel,
        panels: [],
        count: 1,
      });
      index += 1;
      continue;
    }

    let end = index;
    while (
      end < rows.length &&
      rows[end]?.action === PANEL_READ &&
      rows[end]?.actorLabel === head.actorLabel
    ) {
      end += 1;
    }

    const run = rows.slice(index, end);
    if (run.length < MIN_RUN) {
      groups.push({
        id: head.id,
        occurredAt: head.occurredAt,
        actorLabel: head.actorLabel,
        kind: 'event',
        action: head.action,
        subjectLabel: head.subjectLabel,
        panels: [],
        count: 1,
      });
      index += 1;
      continue;
    }

    // Distinct, in the order they appear. A repeat within one run is possible and is not smoothed
    // over: the printed count is the number of ROWS, so a group naming five panels over six rows
    // says both figures and a reader can see they differ.
    const panels: string[] = [];
    for (const item of run) {
      const label = item.subjectLabel ?? 'unnamed';
      if (!panels.includes(label)) panels.push(label);
    }

    groups.push({
      id: head.id,
      occurredAt: head.occurredAt,
      actorLabel: head.actorLabel,
      kind: 'panel-reads',
      action: '',
      subjectLabel: null,
      panels,
      count: run.length,
    });
    index = end;
  }

  return groups;
}

/** What a group's `What` cell says. One function, so the table and any test read the same words. */
export function describeActivity(group: ActivityGroup): string {
  if (group.kind === 'panel-reads') {
    return `${String(group.count)} panel reads · ${group.panels.join(', ')}`;
  }
  const action = group.action.replace('staff.', '').replace(/_/g, ' ');
  return group.subjectLabel === null ? action : `${action} · ${group.subjectLabel}`;
}
