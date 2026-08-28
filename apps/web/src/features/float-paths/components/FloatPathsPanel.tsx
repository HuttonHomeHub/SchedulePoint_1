import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import {
  floatPathAnnouncement,
  type FloatPathRow,
  type FloatPathsViewModel,
} from '../model/float-path-rows';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { SheetHeader } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
// Deep import, deliberately: the shared 422 sentence is a pure constant, and the schedule barrel
// pulls the whole data layer with it — which several workspace suites replace wholesale.
import { NO_START_HINT } from '@/features/schedule/api/use-schedule';
// The SHARED role sentence, not a second wording: the health dock explains the same shut route
// with the same words (M5 ux finding — fixing only one dock would have created a fresh drift).
import { REMEDY_ROLE_SENTENCES } from '@/features/schedule-health/model/health-rows';
import { cn } from '@/lib/utils';

export interface FloatPathsPanelProps {
  /** The analysis, or `null` until a response arrives. */
  model: FloatPathsViewModel | null;
  selectedPathIndex: number | null;
  isPending: boolean;
  isError: boolean;
  /** The plan has never been scheduled (422) — a state to explain, not an error to report. */
  planNotScheduled: boolean;
  /** The sticky target is no longer in the plan (404). */
  targetMissing: boolean;
  canShowMore: boolean;
  /** The workspace selection, when it is not already the target — the "Use …" affordance. */
  suggestedTargetId: string | null;
  /** That activity's name, for the affordance's label. */
  suggestedTargetName: string | null;
  onSelectPath: (index: number | null) => void;
  onSetTarget: (activityId: string) => void;
  onShowMore: () => void;
  onRetry: () => void;
  /**
   * Close the panel **and put focus somewhere** — the host restores it to the toolbar item.
   * `close` alone would unmount the focused Close button and strand focus on `<body>` (WCAG 2.4.3);
   * the notes dock's `closeNotes` is the precedent this deliberately copies.
   */
  onClose: () => void;
  /**
   * Recalculate the plan, when the caller may. Absent for a Viewer, who cannot — the panel then
   * explains the state without offering an action it would refuse.
   */
  onRecalculate?: (() => void) | undefined;
  /**
   * Select an activity in the workspace and bring it into view. One prop for both views: the host
   * lifts the selection and each view reveals it its own way, because the canvas handle is null
   * whenever the Gantt is showing (the ADR-0059 M6 shape).
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
  model,
  selectedPathIndex,
  isPending,
  isError,
  planNotScheduled,
  targetMissing,
  canShowMore,
  suggestedTargetId,
  suggestedTargetName,
  onSelectPath,
  onSetTarget,
  onShowMore,
  onRetry,
  onClose,
  onRecalculate,
  onActivateActivity,
}: FloatPathsPanelProps): React.ReactElement {
  const announce = useAnnounce();
  const headingId = useId();

  /**
   * **One announcement site, one message per settling.**
   *
   * The app has a single live region with one slot and no queue, so two writes in the same commit
   * lose the first (the a11y gate's finding). The two things worth saying — how many paths were
   * found, and which one is now showing — are therefore chosen between rather than both spoken:
   * a selected path's sentence already carries `of n`, so it says everything the count would.
   */
  const spokenRef = useRef<string | null>(null);
  useEffect(() => {
    const message = panelAnnouncement({
      model,
      selectedPathIndex,
      isPending,
      planNotScheduled,
      targetMissing,
      isError,
    });
    if (message === null || spokenRef.current === message) return;
    spokenRef.current = message;
    announce(message);
  }, [model, selectedPathIndex, isPending, planNotScheduled, targetMissing, isError, announce]);

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
          onClose();
        }
      }}
    >
      <SheetHeader
        title="Float paths"
        titleClassName="text-sm font-medium"
        onClose={onClose}
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
          {suggestedTargetId === null ? null : (
            <Button
              variant="secondary"
              size="sm"
              // `max-w` + `truncate`: a real construction activity name ("Excavate and backfill
              // retaining wall footings, north perimeter") would otherwise push the button past the
              // 300 px the dock can shrink to, and `Button` is `whitespace-nowrap`.
              className="max-w-[60%]"
              title={suggestedTargetName === null ? undefined : `Use ${suggestedTargetName}`}
              onClick={() => {
                onSetTarget(suggestedTargetId);
              }}
            >
              <span className="truncate">Use {suggestedTargetName ?? 'selected activity'}</span>
            </Button>
          )}
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

        {/* `role="status"`, not `alert`: these two explain the plan, they do not report a failure.
            Without a role they were silent transitions — the panel's whole content changed and a
            screen-reader user heard nothing (WCAG 4.1.3). */}
        {planNotScheduled ? (
          <NoticeStrip
            role="status"
            tone="neutral"
            emphasis="dashed"
            density="comfortable"
            messageFit="grow"
            // The SHARED sentence, not a second one invented here: the same 422 already has copy,
            // and two wordings for one state is how a product stops sounding like itself.
            message={`There are no float paths to rank yet. ${NO_START_HINT}`}
          >
            {/* A reader without the capability gets the route in words, never silence — the state
                is shut by ROLE, so ADR-0082 says explain it rather than omit it. */}
            {onRecalculate === undefined ? (
              <p className="text-muted-foreground text-xs">{REMEDY_ROLE_SENTENCES.RECALCULATE}</p>
            ) : (
              <Button variant="secondary" size="sm" onClick={onRecalculate}>
                Recalculate
              </Button>
            )}
          </NoticeStrip>
        ) : null}

        {targetMissing ? (
          <NoticeStrip
            role="status"
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
            <Button variant="secondary" size="sm" onClick={onRetry}>
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
                expanded={selectedPathIndex === row.index}
                onToggle={() => {
                  onSelectPath(selectedPathIndex === row.index ? null : row.index);
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
            {canShowMore ? (
              <Button variant="secondary" size="sm" onClick={onShowMore}>
                Show more
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The one sentence worth speaking for the panel's current state, or `null` for nothing new.
 *
 * Exported for its own test rather than left inline: every branch here is a state a planner reaches
 * and an assistive-technology user would otherwise meet in silence — the loading state above all,
 * because this request runs a full CPM computation and can take visible time.
 */
export function panelAnnouncement({
  model,
  selectedPathIndex,
  isPending,
  planNotScheduled,
  targetMissing,
  isError,
}: {
  model: FloatPathsViewModel | null;
  selectedPathIndex: number | null;
  isPending: boolean;
  planNotScheduled: boolean;
  targetMissing: boolean;
  isError: boolean;
}): string | null {
  if (isPending) return 'Calculating float paths…';
  if (planNotScheduled) return `There are no float paths to rank yet. ${NO_START_HINT}`;
  if (targetMissing) return 'The activity this analysis was run for is no longer in the plan.';
  if (isError) return 'The float-path analysis could not be run.';
  if (model === null) return null;

  if (selectedPathIndex !== null) {
    const row = model.rows.find((candidate) => candidate.index === selectedPathIndex);
    // The selected-path sentence carries "of n", so it already says what the count would — and the
    // live region holds one message, not two.
    if (row !== undefined) return floatPathAnnouncement(row, model.rows.length);
  }
  const count = model.rows.length;
  if (count === 0) return 'No float paths run into this activity.';
  return `${String(count)} float ${count === 1 ? 'path' : 'paths'} found.`;
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
        {/* A NEGATIVE relative float is a real signal — this chain is more critical than the target
            — and shown bare it reads as breakage. The words are part of the button's name, so the
            qualifier is announced with the number rather than sitting silently beside it. */}
        {row.moreCriticalNote === null ? null : (
          <span className="text-warning-text shrink-0 text-xs">({row.moreCriticalNote})</span>
        )}
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
