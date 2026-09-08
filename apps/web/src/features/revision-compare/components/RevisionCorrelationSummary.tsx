import type { CrossPlanCorrelation, CrossPlanCorrelationRow } from '@repo/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';

import { correlationSentence, uncodedSentence } from '../model/revision-sentences';

/**
 * **How well two separately-imported plans matched, rendered ABOVE everything derived from it.**
 *
 * Two plans that arrived as two imports share no activity ids, so they are matched on `code` — and
 * every number below this block is worth exactly what this block says it is. A reader who cannot
 * see the coverage cannot judge a delta: "12 activities left the critical path" means one thing at
 * 98 % coverage and something else entirely at 40 %.
 *
 * **Three states, never two.** Matched, unmatched (present on one side only) and **uncoded** are
 * different facts: an uncoded row is neither added nor removed, because the product does not know
 * which it is, and folding it into either count would be the ADR-0073 C1 defect — two facts
 * arriving in one channel as one.
 *
 * Each list is **capped with its true total beside it** and the cap comes from the server, so a
 * client never holds a second copy of it and never computes "showing N of M" itself (ADR-0116 D3;
 * ADR-0125's gate pass found two of four sets shipping uncapped beside two that were capped — the
 * same rule applied to a field and not its sibling).
 *
 * Design-system primitives only: a `<button>` disclosure in the `ScheduleHealthPanel` shape, real
 * text, no one-off styling.
 */
/**
 * Just the correlation. It deliberately takes **no** anchor-plan prop: an earlier draft had one and
 * then had to invent a use for it, which is the "prop scaffolded for a hypothetical caller"
 * `RevisionComparePanel`'s own docblock records being caught once. The per-row "which plan is this
 * in" distinction belongs where it is acted on — the delta's rows, where a control is offered or
 * omitted — not here, where nothing is.
 */
export interface RevisionCorrelationSummaryProps {
  correlation: CrossPlanCorrelation;
}

interface RowListProps {
  label: string;
  rows: readonly CrossPlanCorrelationRow[];
  /** The TRUE count, which may exceed `rows.length`. Never the client's own arithmetic. */
  total: number;
  cap: number;
}

function RowList({ label, rows, total, cap }: RowListProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (total === 0) return null;
  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => {
          setExpanded((v) => !v);
        }}
        className="hover:bg-accent focus-visible:ring-ring -mx-1 flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-muted-foreground shrink-0 tabular-nums">{total}</span>
      </button>
      {expanded ? (
        <ul id={listId} className="text-muted-foreground mt-1 ml-5 space-y-0.5 text-xs">
          {rows.map((row) => (
            <li key={`${row.planId}:${row.code ?? row.name}`} className="truncate">
              {row.code === null ? row.name : `${row.code} — ${row.name}`}
            </li>
          ))}
          {/*
            "Showing N of M" only when there IS more, and never computed here: `total` is the
            server's count and `cap` is the server's cap. A diagram has no way to say this at all,
            which is why the overlay counts instead — a list can, so it does.
          */}
          {total > rows.length ? (
            <li className="italic">
              Showing {rows.length} of {total} (the first {cap}).
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

export function RevisionCorrelationSummary({
  correlation,
}: RevisionCorrelationSummaryProps): React.ReactElement {
  const uncoded = uncodedSentence(correlation);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="border-border space-y-1 rounded-md border p-2">
      <h3 id={headingId} className="text-xs font-medium">
        Match coverage
      </h3>
      <p className="text-muted-foreground text-sm">{correlationSentence(correlation)}</p>
      {uncoded === null ? null : <p className="text-muted-foreground text-xs">{uncoded}</p>}
      <ul className="space-y-0.5 text-sm">
        {/*
          Named by SIDE rather than by "from"/"to", because a reader with two plan names on screen
          has to map the label onto one of them and "from" does not help them do it.
        */}
        <RowList
          label="Only in the earlier plan"
          rows={correlation.fromUnmatchedRows}
          total={correlation.fromUnmatched}
          cap={correlation.cap}
        />
        <RowList
          label="Only in the later plan"
          rows={correlation.toUnmatchedRows}
          total={correlation.toUnmatched}
          cap={correlation.cap}
        />
        <RowList
          label="No activity code"
          rows={correlation.uncodedRows}
          total={correlation.fromUncoded + correlation.toUncoded}
          cap={correlation.cap}
        />
      </ul>
    </section>
  );
}
