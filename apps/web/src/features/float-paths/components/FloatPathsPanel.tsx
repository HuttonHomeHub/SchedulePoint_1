import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { floatPathAnnouncement, type FloatPathRow } from '../model/float-path-rows';
import type { UseFloatPathsPanelResult } from '../model/use-float-paths-panel';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { SheetHeader } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export interface FloatPathsPanelProps {
  panel: UseFloatPathsPanelResult;
  /** The name of the currently-selected activity, for the "Use selected activity" affordance. */
  suggestedTargetName: string | null;
  /**
   * Select an activity in the workspace and bring it into view — the canvas centres it, the Gantt
   * scrolls its row. One prop for both views: the host branches on which is mounted, because
   * `centerOnDate` is null whenever the Gantt is showing and a panel that called it directly would
   * be silently inert in half the product (the ADR-0059 M6 shape).
   */
  onActivateActivity: (activityId: string) => void;
}

/**
 * **Float paths** — the ranked contiguous driving chains into one activity (ADR-0035 §19, audit F4).
 *
 * It is a **docked column**, not a modal `Sheet`. `components/ui/sheet.tsx` calls `showModal()`,
 * which makes the rest of the document inert and paints a scrim: it would black out the very
 * diagram this panel's emphasis is drawn on, and put the toolbar item that closes it out of reach.
 * The notes drawer beside it is the precedent and is likewise a docked column — the spec's phrase
 * "the plan-notes Sheet precedent" described something that does not exist.
 *
 * The disclosure **is** the selection. Expanding a path emphasises it in whichever view is showing;
 * collapsing clears the emphasis. One control per row, doing the thing its arrow implies — rather
 * than a separate "emphasise" affordance whose relationship to the open/closed state a reader would
 * have to work out.
 */
export function FloatPathsPanel({
  panel,
  suggestedTargetName,
  onActivateActivity,
}: FloatPathsPanelProps): React.ReactElement {
  const announce = useAnnounce();
  const headingId = useId();
  const { model, isPending, isError, planNotScheduled, targetMissing } = panel;

  // One announcement site, shared by the pointer and keyboard paths because both go through
  // `selectPath` (the ADR-0064 finding: a pointer path silent while the keyboard path speaks).
  const spokenRef = useRef<string | null>(null);
  useEffect(() => {
    const index = panel.selectedPathIndex;
    if (model === null || index === null) {
      spokenRef.current = null;
      return;
    }
    const row = model.rows.find((candidate) => candidate.index === index);
    if (row === undefined) return;
    const message = floatPathAnnouncement(row, model.rows.length);
    if (spokenRef.current === message) return;
    spokenRef.current = message;
    announce(message);
  }, [panel.selectedPathIndex, model, announce]);

  // The settled result count (WCAG 4.1.3): the panel's whole content is a list whose length is the
  // answer, and a sighted user sees it arrive while an AT user would not.
  const settledRef = useRef<string | null>(null);
  useEffect(() => {
    if (model === null) return;
    const count = model.rows.length;
    const message =
      count === 0
        ? 'No float paths run into this activity.'
        : `${String(count)} float ${count === 1 ? 'path' : 'paths'} found.`;
    if (settledRef.current === message) return;
    settledRef.current = message;
    announce(message);
  }, [model, announce]);

  const useSelected =
    panel.suggestedTargetId === null ? null : (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          panel.setTarget(panel.suggestedTargetId!);
        }}
      >
        Use {suggestedTargetName ?? 'selected activity'}
      </Button>
    );

  return (
    // Escape closes the dock (a non-modal column has no native cancel), scoped and stopped so it
    // does not also reach the workspace/canvas handlers — the notes dock's rule, copied deliberately.
    // The handler only OBSERVES Escape; it does not make the section a widget.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-labelledby={headingId}
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          panel.close();
        }
      }}
    >
      <SheetHeader
        title="Float paths"
        titleClassName="text-sm font-medium"
        onClose={panel.close}
        closeLabel="Close float paths"
      />
      <h2 id={headingId} className="sr-only">
        Float paths
      </h2>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground min-w-0 text-sm">
            {model?.targetName === null || model?.targetName === undefined ? (
              'Paths into the selected activity'
            ) : (
              <>
                Paths into <span className="text-foreground font-medium">{model.targetName}</span>
              </>
            )}
          </p>
          {useSelected}
        </div>

        {/* CQ-3: the figure is real and is rendered on the target's calendar; the mix is disclosed
            rather than the number suppressed. A planner who can see the chains but not the number
            would go back to the tool this one exists to replace. */}
        {model?.mixedCalendars === true ? (
          <NoticeStrip
            tone="info"
            density="comfortable"
            messageFit="grow"
            message="These activities are measured on more than one calendar. Relative float is shown in the target's working days."
          />
        ) : null}

        {isPending ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner className="size-4" aria-hidden="true" />
            Calculating float paths…
          </p>
        ) : null}

        {planNotScheduled ? (
          <NoticeStrip
            tone="neutral"
            emphasis="dashed"
            density="comfortable"
            messageFit="grow"
            message="This plan has not been calculated yet, so there are no float paths to rank. Recalculate the schedule and try again."
          />
        ) : null}

        {targetMissing ? (
          <NoticeStrip
            tone="warning"
            density="comfortable"
            messageFit="grow"
            message="The activity this analysis was run for is no longer in the plan."
          />
        ) : null}

        {/* Error and empty are separate, differently-worded branches. An error rendered as an empty
            list reads as "no paths" — a wrong answer presented as a finding. */}
        {isError && !planNotScheduled && !targetMissing ? (
          <NoticeStrip
            role="alert"
            tone="warning"
            density="comfortable"
            messageFit="grow"
            message="The float-path analysis could not be run."
          >
            <Button variant="secondary" size="sm" onClick={panel.retry}>
              Retry
            </Button>
          </NoticeStrip>
        ) : null}

        {model !== null && model.rows.length === 0 && !isPending ? (
          <NoticeStrip
            tone="neutral"
            emphasis="dashed"
            density="comfortable"
            messageFit="grow"
            message="Nothing runs into this activity — it has no predecessors, so there is no chain to rank."
          />
        ) : null}

        {model !== null && model.rows.length > 0 ? (
          <ul className="space-y-1">
            {model.rows.map((row) => (
              <FloatPathDisclosure
                key={row.index}
                row={row}
                expanded={panel.selectedPathIndex === row.index}
                onToggle={() => {
                  panel.selectPath(panel.selectedPathIndex === row.index ? null : row.index);
                }}
                onActivateActivity={onActivateActivity}
              />
            ))}
          </ul>
        ) : null}

        {/* Honest truncation: say "the first N", never imply the list is every path. Driven by the
            API's own `hasMorePaths`, which the service derives by asking for `maxPaths + 1`. */}
        {model?.hasMorePaths === true ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              Showing the first {String(model.rows.length)} paths — there are more.
            </p>
            {panel.canShowMore ? (
              <Button variant="secondary" size="sm" onClick={panel.showMore}>
                Show more
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FloatPathDisclosure({
  row,
  expanded,
  onToggle,
  onActivateActivity,
}: {
  row: FloatPathRow;
  expanded: boolean;
  onToggle: () => void;
  onActivateActivity: (activityId: string) => void;
}): React.ReactElement {
  const regionId = useId();
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <li className="border-border rounded-md border">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
          'hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
          expanded && 'bg-accent',
        )}
      >
        <Chevron aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        {/* "Driving" for path 0 — never "+0d", which reads as a measurement of nothing rather than
            the name of the chain everything else is measured against. */}
        <span className="font-medium">{row.label}</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate">
          {row.entryName ?? 'Unnamed activity'}
        </span>
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {String(row.activityCount)}
        </span>
      </button>
      <div id={regionId} hidden={!expanded}>
        <ul className="border-border border-t">
          {row.activities.map((activity) => (
            <li key={activity.id}>
              <button
                type="button"
                onClick={() => {
                  // `aria-disabled` + a **click guard**, never the native `disabled` attribute
                  // (the ADR-0060 M6 / ADR-0063 M6 rule) — the row must keep its tab stop so the
                  // chain reads the same to a keyboard as to a mouse. `pointer-events-none` styles
                  // the refusal; it does not enforce it, and a keyboard Enter goes straight past it.
                  // This guard is here because the regression test found the call getting through.
                  if (activity.missing) return;
                  onActivateActivity(activity.id);
                }}
                // A member the client does not hold is kept and marked, never dropped — a silently
                // shorter chain reads as a different analysis. It cannot be activated, because
                // there is nothing to select or scroll to.
                aria-disabled={activity.missing || undefined}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1 text-left text-sm',
                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                  activity.missing ? 'pointer-events-none opacity-60' : 'hover:bg-accent',
                )}
              >
                {activity.code === null ? null : (
                  <span className="text-muted-foreground shrink-0 font-mono text-xs">
                    {activity.code}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {activity.name ?? 'Not in the loaded activities'}
                </span>
                {activity.earlyStart === null ? null : (
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {activity.earlyStart}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
