import type { BaselineSummary, RevisionCompare, RevisionMovedActivity } from '@repo/types';
import { ArrowDownToLine, ArrowUpFromLine, CirclePlus, CircleMinus } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { LIVE_REVISION } from '../api/use-revision-compare';
import {
  carrierChangedSentence,
  completionSentence,
  comparisonAnnouncement,
  HONESTY_FOOTER,
  LEVELLING_CAVEAT,
  settingsCaveat,
  sideTitle,
  truncationNote,
} from '../model/revision-sentences';
import { printRevisionCompare } from '../print/RevisionComparePrintDocument';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { Select } from '@/components/ui/select';
import { SheetHeader } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';

export interface RevisionComparePanelProps {
  /** Every baseline the plan holds, newest first, or `null` until they arrive. */
  baselines: BaselineSummary[] | null;
  baselinesPending: boolean;
  /** The comparison, or `null` before a pair is chosen or while one is in flight. */
  compare: RevisionCompare | null;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  from: string | null;
  to: string;
  onFromChange: (id: string) => void;
  onToChange: (id: string) => void;
  /**
   * Close the panel **and put focus somewhere** — the host restores it to the toolbar trigger.
   * `close` alone unmounts the focused Close button and strands focus on `<body>` (WCAG 2.4.3);
   * the health and Float-paths docks' rule, copied deliberately rather than re-derived.
   */
  onClose: () => void;
  /** True when the plan levels resources — the caveat is a sentence, never silence (spec D6). */
  levelResources?: boolean;
  /**
   * Select an activity in the workspace and bring it into view (M3-T1). ONE prop for both views —
   * the host lifts the selection and each view reveals it its own way: the canvas pans the selected
   * bar in through the selection seam, and the Gantt through the host's reveal channel, because
   * selection alone scrolls nothing there (the health epic's reviewer finding, reused rather than
   * re-derived).
   *
   * Absent in a standalone host, in which case the rows are shaded WITH A REASON rather than
   * silently inert.
   */
  onActivateActivity?: ((activityId: string) => void) | undefined;
}

/**
 * **The revision comparison dock** (ADR-0125, revision M2) — what entered and left the critical
 * path between two computed schedules of this plan, and how far the completion moved.
 *
 * A docked column rather than a modal, for the health dock's reason verbatim: the comparison is
 * read BESIDE the plan, and `showModal()` would make the diagram inert while a planner is trying
 * to look at the bars it names.
 *
 * **It reports what moved and never what caused it.** No row is a cause and none is labelled one;
 * the payload carries no field that would let it, and the footer says so in a planner's words
 * rather than leaving the omission to be read as an oversight.
 *
 * Two states this panel is careful to keep apart, because the register records them being
 * collapsed: **"this plan has no baselines"** and **"nothing entered or left the critical path"**
 * are different facts, distinct in the visible copy AND in the live region (ADR-0073 C1). One is
 * "there is nothing to compare"; the other is a real, useful answer.
 */
export function RevisionComparePanel({
  baselines,
  baselinesPending,
  compare,
  isPending,
  isError,
  onRetry,
  from,
  to,
  onFromChange,
  onToChange,
  onClose,
  levelResources = false,
  onActivateActivity,
}: RevisionComparePanelProps): React.ReactElement {
  const announce = useAnnounce();
  const headingId = useId();
  const fromId = useId();
  const toId = useId();
  const resultsId = useId();
  const footerId = useId();

  // One announcement, once, when a comparison settles — never per render (the ADR-0079
  // stale-debounce lesson: a re-render must not re-arm the message).
  const spokenRef = useRef<RevisionCompare | null>(null);
  useEffect(() => {
    if (compare === null || spokenRef.current === compare) return;
    spokenRef.current = compare;
    announce(comparisonAnnouncement(compare));
  }, [compare, announce]);

  const hasBaselines = baselines !== null && baselines.length > 0;
  const caveat = compare === null ? null : settingsCaveat(compare.settingsVerdict);

  return (
    // Escape closes the dock (a non-modal column has no native cancel), scoped and stopped so it
    // does not also reach the workspace/canvas handlers — the notes dock's rule.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-labelledby={headingId}
      // A structural hook for the journey, for the reason `[data-toolbar-item]` and
      // `[data-activities-bar]` exist: an axe `.include()` and an `elementFromPoint` sweep both need
      // a real CSS selector, and locating this panel by its COPY is what every layout epic here has
      // broken. Playwright's `:text-is()` is a selector-engine extension and is not valid CSS —
      // axe-core throws on it rather than scanning nothing, which is the right way round and is how
      // this attribute came to exist.
      data-revision-compare-panel=""
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <SheetHeader
        title="Compare revisions"
        titleClassName="text-sm font-medium"
        onClose={onClose}
        closeLabel="Close revision comparison"
        actions={
          compare === null ? null : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => printRevisionCompare(compare)}
              // `h-7` overrides `size="sm"` for the panel's density; the coarse-pointer override is
              // ADR-0118 M4's rule, applied here rather than left for a sweep to find — the health
              // panel's twin shipped without it and the architecture gate caught it.
              className="h-7 px-2 text-xs pointer-coarse:h-(--control-h)"
            >
              Print comparison
            </Button>
          )
        }
      />
      <h2 id={headingId} className="sr-only">
        Compare revisions
      </h2>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {baselinesPending ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner className="size-4" aria-hidden="true" />
            Loading revisions…
          </p>
        ) : null}

        {/* "No baselines" is its own state and its own sentence. It is NOT "no changes": one says
            there is nothing to compare against, the other is a real answer to a real question. */}
        {!baselinesPending && !hasBaselines ? (
          <p className="text-muted-foreground text-sm">
            This plan has no saved revisions yet. Capture a baseline to compare against.
          </p>
        ) : null}

        {hasBaselines ? (
          <div className="grid gap-3 @sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={fromId}>Earlier revision</Label>
              <Select
                id={fromId}
                className="w-full"
                value={from ?? ''}
                onChange={(event) => onFromChange(event.target.value)}
              >
                <option value="">Choose a revision…</option>
                {baselines.map((baseline) => (
                  <option key={baseline.id} value={baseline.id}>
                    {baseline.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={toId}>Compared with</Label>
              <Select
                id={toId}
                className="w-full"
                value={to}
                onChange={(event) => onToChange(event.target.value)}
              >
                {/* The live side is LABELLED as live and is the default, because it is the
                    question a planner actually asks. A blank option meaning "now" would make the
                    commonest choice the one with no name. */}
                <option value={LIVE_REVISION}>Live (the plan as it stands now)</option>
                {baselines.map((baseline) => (
                  <option key={baseline.id} value={baseline.id}>
                    {baseline.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}

        {hasBaselines && from === null ? (
          <p className="text-muted-foreground text-sm">
            Choose an earlier revision to compare against.
          </p>
        ) : null}

        {isPending && from !== null ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner className="size-4" aria-hidden="true" />
            Comparing…
          </p>
        ) : null}

        {isError ? (
          <NoticeStrip
            role="alert"
            tone="warning"
            density="comfortable"
            messageFit="grow"
            message="The comparison could not be read."
          >
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </NoticeStrip>
        ) : null}

        {compare !== null && !isError ? (
          <div
            id={resultsId}
            // The footer is LINKED to the results rather than only sitting below them: a
            // landmark-navigating reader lands INSIDE this region and would otherwise reach the
            // caveat only by reading serially to the end (the ADR-0073 C2.5 finding).
            aria-describedby={footerId}
            className="space-y-3"
          >
            <p className="text-muted-foreground text-xs">
              {sideTitle(compare.from)} → {sideTitle(compare.to)}
              {compare.from.computedAt === null
                ? null
                : ` · captured ${compare.from.computedAt.slice(0, 10)}`}
            </p>

            <p className="text-sm">{completionSentence(compare.completion)}</p>
            {carrierChangedSentence(compare.completion) === null ? null : (
              <p className="text-muted-foreground text-sm">
                {carrierChangedSentence(compare.completion)}
              </p>
            )}

            {caveat === null ? null : (
              <NoticeStrip tone="warning" density="compact" messageFit="grow" message={caveat} />
            )}

            {levelResources ? (
              <p className="text-muted-foreground text-xs">{LEVELLING_CAVEAT}</p>
            ) : null}

            {compare.criticalPath.noCriticalPath ? (
              <p className="text-muted-foreground text-sm">
                Neither revision has a critical path, so nothing can have entered or left it.
              </p>
            ) : (
              <>
                <MovedSection
                  heading="Entered the critical path"
                  icon={ArrowDownToLine}
                  rows={compare.criticalPath.entered}
                  total={compare.criticalPath.enteredTotal}
                  cap={compare.criticalPath.cap}
                  emptyMessage="Nothing entered the critical path."
                  onActivate={onActivateActivity}
                />
                <MovedSection
                  heading="Left the critical path"
                  icon={ArrowUpFromLine}
                  rows={compare.criticalPath.left}
                  total={compare.criticalPath.leftTotal}
                  cap={compare.criticalPath.cap}
                  emptyMessage="Nothing left the critical path."
                  onActivate={onActivateActivity}
                />
              </>
            )}

            {compare.criticalPath.added.length > 0 || compare.criticalPath.removed.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                <CirclePlus className="mr-1 inline size-3" aria-hidden="true" />
                {compare.criticalPath.added.length} added ·{' '}
                <CircleMinus className="mr-1 inline size-3" aria-hidden="true" />
                {compare.criticalPath.removed.length} removed. An activity present in only one
                revision is listed as added or removed — it did not enter or leave a path it was
                never on.
              </p>
            ) : null}

            <p id={footerId} className="text-muted-foreground border-border border-t pt-2 text-xs">
              {HONESTY_FOOTER}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * One movement section. The heading carries an **icon and a word**, so direction is never encoded
 * in colour alone (WCAG 1.4.1) — and the icons differ in shape as well as direction, because two
 * arrows distinguished only by rotation are one channel wearing two hats.
 *
 * The empty message is the section's OWN sentence, not a shared "nothing to show": "nothing
 * entered" and "nothing left" are different facts about a plan and a reader acts on them
 * differently.
 */
function MovedSection({
  heading,
  icon: Icon,
  rows,
  total,
  cap,
  emptyMessage,
  onActivate,
}: {
  heading: string;
  icon: typeof ArrowDownToLine;
  rows: readonly RevisionMovedActivity[];
  total: number;
  cap: number;
  emptyMessage: string;
  onActivate?: ((activityId: string) => void) | undefined;
}): React.ReactElement {
  const headingId = useId();
  const note = truncationNote(rows.length, total, cap);
  return (
    <section aria-labelledby={headingId} className="space-y-1">
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4" aria-hidden="true" />
        {heading}
        <span className="text-muted-foreground">({total})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.activityId} className="text-sm">
              <MovedRow row={row} onActivate={onActivate} />
            </li>
          ))}
        </ul>
      )}
      {note === null ? null : <p className="text-muted-foreground text-xs">{note}</p>}
    </section>
  );
}

/**
 * One row, activatable when the host offers activation AND the activity is on the live plan.
 *
 * **A row that cannot be activated is shaded WITH A REASON, never silently inert and never hidden**
 * (ADR-0082). A comparison of two baselines can name an activity that has since been deleted, and a
 * control that navigates nowhere is worse than one that says why. `aria-disabled` plus a guard
 * rather than the native attribute, because a native `disabled` on a control whose gate flips
 * blurs to `<body>` — a defect this register records shipping at least four times — and because a
 * disabled button is removed from the tab order along with its explanation, which is the ADR-0082
 * finding one layer down.
 *
 * Where the host offers no activation at all, the row is plain text rather than a shaded button:
 * there is no action to explain the absence of, and a shaded control on every row of a standalone
 * host would be noise claiming a capability the host never had.
 */
function MovedRow({
  row,
  onActivate,
}: {
  row: RevisionMovedActivity;
  onActivate?: ((activityId: string) => void) | undefined;
}): React.ReactElement {
  const detail = (
    <>
      <span>{row.name}</span>
      {row.code === null ? null : <span className="text-muted-foreground"> · {row.code}</span>}
      <span className="text-muted-foreground block text-xs">
        {floatPhrase(row)}
        {row.existsLive ? null : ' · not in the live plan'}
      </span>
    </>
  );

  if (onActivate === undefined) return <>{detail}</>;

  const reasonId = `revision-row-reason-${row.activityId}`;
  const shaded = !row.existsLive;
  return (
    <>
      <button
        type="button"
        aria-disabled={shaded || undefined}
        aria-describedby={shaded ? reasonId : undefined}
        onClick={() => {
          if (shaded) return;
          onActivate(row.activityId);
        }}
        className="hover:bg-accent focus-visible:ring-ring w-full rounded px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:outline-none aria-disabled:opacity-60"
      >
        {detail}
      </button>
      {shaded ? (
        // An `sr-only` SIBLING linked by `aria-describedby`, never folded into the name: the
        // `ToolbarButton` pattern, so a reader hears the activity and then why it cannot be opened,
        // rather than one run-on label (ADR-0117's `purpose` distinction, one control along).
        <span id={reasonId} className="sr-only">
          This activity is not in the live plan, so it cannot be shown on the diagram.
        </span>
      ) : null}
    </>
  );
}

/**
 * The row's float movement in words. **A null movement is stated as unknown, never as zero** —
 * absence and zero are different facts, and this is the last place they could be collapsed after
 * the API and the pure delta both kept them apart.
 */
function floatPhrase(row: RevisionMovedActivity): string {
  if (row.floatMovementDays === null) return 'Float movement unknown';
  const magnitude = Math.abs(row.floatMovementDays);
  const unit = magnitude === 1 ? 'day' : 'days';
  if (row.floatMovementDays === 0) return 'Float unchanged';
  return row.floatMovementDays > 0
    ? `Float up ${magnitude} ${unit}`
    : `Float down ${magnitude} ${unit}`;
}
