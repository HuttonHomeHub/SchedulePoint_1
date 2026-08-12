import { useScheduleSummary } from '../api/use-schedule';

import { formatCalendarDate } from '@/lib/format-date';

/**
 * The **Project-finish read-out** — the number planners glance at most.
 *
 * Lived inline on the TSLD's Row 1 as a `presentational` toolbar item until ADR-0090 M2-T3, where it
 * moved to the **plan header** beside the status pill. Two reasons, and the second is the one that
 * generalises: it cost **150 px of pinned Row-1 width** (a `render` item can never demote, so that
 * width was paid at every viewport); and a read-out is not a command, so it had no business inside a
 * `role="toolbar"` at all — it was a non-operable stop in a list of operable ones, kept honest only
 * by a `presentational` escape hatch that existed to describe it.
 *
 * Moved as a component rather than reimplemented in the header, so the states below cannot drift
 * from what shipped: a **loading placeholder** (the slot must not flicker in and out), and
 * **nothing at all** when the plan has not been calculated or the load failed — the full states
 * live in `Summary ▾`, which reuses the same `ScheduleSummaryStrip`, so this stays a glance and
 * never becomes a second error surface.
 *
 * It now lives beside `ScheduleSummaryStrip` rather than inside `use-tsld-toolbar-context.tsx`,
 * where it was a private function in a hook module — a component the plan header would otherwise
 * have had to import out of the TSLD toolbar's context builder to render its own chrome.
 */
export function ProjectFinishChip({
  orgSlug,
  planId,
}: {
  orgSlug: string;
  planId: string;
}): React.ReactElement | null {
  const summary = useScheduleSummary(orgSlug, planId);
  if (summary.isPending) {
    return (
      <span className="text-muted-foreground" aria-hidden="true">
        Finish …
      </span>
    );
  }
  const finish = summary.data?.projectFinish ?? null;
  if (finish === null) return null;
  return (
    <>
      <span className="text-muted-foreground mr-1">Finish</span>
      <span className="text-foreground font-medium">{formatCalendarDate(finish)}</span>
    </>
  );
}
