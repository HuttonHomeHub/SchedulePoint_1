import type { BaselineSummary, RevisionCompare, RevisionMovedActivity } from '@repo/types';
import { ArrowDownToLine, ArrowUpFromLine, CirclePlus, CircleMinus } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { LIVE_REVISION } from '../api/use-revision-compare';
import {
  carrierChangedSentence,
  completionSentence,
  comparisonAnnouncement,
  criticalPathUnavailable,
  membershipSentence,
  HONESTY_FOOTER,
  LEVELLING_CAVEAT,
  settingsCaveat,
  sideTitle,
  truncationNote,
} from '../model/revision-sentences';
import { printRevisionCompare } from '../print/RevisionComparePrintDocument';

import { RevisionChangesView } from './RevisionChangesView';

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
   * Open the Baselines surface, when the caller may capture one. Absent for a Viewer, whose empty
   * state then explains the situation without offering an action their role would refuse
   * (ADR-0082: the reason, not a dead button).
   *
   * The spec names this as the SOLE accepted mitigation for "the feature is useless to anyone who
   * never captured a baseline", and it shipped as plain text with no exit at all until the M4 ux
   * review found it — on the state a planner meets FIRST.
   */
  onOpenBaselines?: (() => void) | undefined;
  /**
   * Select an activity in the workspace and bring it into view (M3-T1). ONE prop for both views —
   * the host lifts the selection and each view reveals it its own way: the canvas pans the selected
   * bar in through the selection seam, and the Gantt through the host's reveal channel, because
   * selection alone scrolls nothing there (the health epic's reviewer finding, reused rather than
   * re-derived).
   *
   * **Required**, matching both sibling panels (`ScheduleHealthPanel`, `FloatPathsPanel`). It was
   * briefly optional for a "standalone host" that does not exist and was not asked for, under a
   * docblock claiming those rows would be shaded with a reason — which the code never did; it
   * rendered plain text, which is the correct treatment when there is no action to explain the
   * absence of. A prop scaffolded for a hypothetical caller, described wrongly, and diverging from
   * two siblings built to the same contract: the M4 component review caught all three.
   */
  onActivateActivity: (activityId: string) => void;
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
  onOpenBaselines,
}: RevisionComparePanelProps): React.ReactElement {
  const announce = useAnnounce();
  /**
   * Which reading of the comparison is showing. Resets to the delta whenever a new comparison
   * settles is DELIBERATELY not done: a planner who switched to Changes and then changed one side
   * of the pair is still reading changes, and yanking them back would be the surface deciding it
   * knows better than the person driving it.
   */
  const [view, setView] = useState<'delta' | 'changes'>('delta');
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
    announce(comparisonAnnouncement(compare, levelResources));
  }, [compare, announce, levelResources]);

  /**
   * Activation, spoken FROM HERE — inside the focus frame, because focus stays on the row button
   * and the canvas is `aria-hidden` (ADR-0026), so nothing else tells a screen-reader user the
   * press did anything.
   *
   * This is the `ScheduleHealthPanel` line this feature's own docblocks say it "reused rather than
   * re-derived", and it was the one line not copied — the correct pattern applied to a control and
   * not its neighbour, which is this register's most-repeated shape, found by the M4 accessibility
   * review one file away from the precedent it cites.
   */
  const announceActivation = useCallback(
    /**
     * `name` is supplied by the caller when it has one, and looked up otherwise.
     *
     * The lookup searches the DELTA's rows only, which was complete while the delta was the only
     * thing with rows. The change list's rows are not in those arrays, so every activation from it
     * would have announced a bare "Activity selected in the plan" — the name withheld from the one
     * user who has no other way to learn which row they just pressed. Caught by asking what this
     * function does for a caller it did not have when it was written, rather than by a test
     * failing: an announcement that says something plausible does not fail anything.
     */
    (activityId: string, name?: string) => {
      onActivateActivity(activityId);
      const row = [
        ...(compare?.criticalPath.entered ?? []),
        ...(compare?.criticalPath.left ?? []),
      ].find((r) => r.activityId === activityId);
      announce(`${name ?? row?.name ?? 'Activity'} selected in the plan.`);
    },
    [onActivateActivity, announce, compare],
  );

  /**
   * Which activities the change list may offer to reveal.
   *
   * Derived from the delta's OWN `existsLive` flags rather than fetched separately: the server
   * already answered this question for the criticality rows, and a second source would eventually
   * disagree with the first on the same screen. Rows the delta never mentions are absent from the
   * set, so their controls shade with a reason rather than navigating nowhere (ADR-0082) — the
   * conservative direction, and the one that cannot mislead.
   */
  const liveActivityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of compare?.criticalPath.entered ?? []) if (r.existsLive) ids.add(r.activityId);
    for (const r of compare?.criticalPath.left ?? []) if (r.existsLive) ids.add(r.activityId);
    for (const r of compare?.criticalPath.added ?? []) if (r.existsLive) ids.add(r.activityId);
    for (const r of compare?.criticalPath.removed ?? []) if (r.existsLive) ids.add(r.activityId);
    return ids;
  }, [compare]);

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
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              This plan has no saved revisions yet. Capture a baseline to compare against.
            </p>
            {onOpenBaselines === undefined ? (
              <p className="text-muted-foreground text-xs">
                Capturing a baseline needs a Planner or Org Admin.
              </p>
            ) : (
              <Button variant="secondary" size="sm" onClick={onOpenBaselines}>
                Capture a baseline…
              </Button>
            )}
          </div>
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
                {/* The other side's current choice is NOT offered here. Comparing a revision with
                    itself is not a state to recover from, it is a state to make unreachable — and
                    it used to be reachable in one click with a single baseline captured. The
                    server's 422 remains the backstop if it is reached another way. */}
                {baselines
                  .filter((baseline) => baseline.id !== to)
                  .map((baseline) => (
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
                {baselines
                  .filter((baseline) => baseline.id !== from)
                  .map((baseline) => (
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
          <section
            id={resultsId}
            // **A NAMED REGION, not a bare div** — the M4 accessibility review's finding, and my
            // claim was wrong rather than my wiring: the description was correctly linked to an
            // element no landmark command can reach, so "a landmark-navigating reader lands inside
            // this region" was true of a region that did not exist. The precedent this cited
            // (`audit-self-security`) links its description to a `role="region"` with a name; only
            // the wiring had been copied. The unit test could not catch it either — it asserted
            // that SOME element carried `aria-describedby`, never that the element was a landmark.
            aria-label="Comparison result"
            aria-describedby={footerId}
            className="space-y-3"
          >
            {/* BOTH sides' instants. The screen used to state only the earlier one while the
                printout stated both — so a planner comparing two baselines on screen could not see
                they were six weeks apart, and the page they handed somebody else could. That
                asymmetry is the health epic's D9 finding recurring, caught by the M4 ux review. */}
            <p className="text-muted-foreground text-xs">
              {sideTitle(compare.from)}
              {compare.from.computedAt === null
                ? null
                : ` (captured ${compare.from.computedAt.slice(0, 10)})`}{' '}
              → {sideTitle(compare.to)}
              {compare.to.computedAt === null
                ? compare.to.kind === 'LIVE'
                  ? ' (never calculated)'
                  : null
                : compare.to.kind === 'LIVE'
                  ? ` (calculated ${compare.to.computedAt.slice(0, 10)})`
                  : ` (captured ${compare.to.computedAt.slice(0, 10)})`}
            </p>

            {/* The headline, given the weight of one: this sentence IS the answer to the question
                the feature exists for, and it read as one more line of body copy below two heavier
                section headings (the M4 ux review's hierarchy finding). */}
            <p className="text-sm font-medium">{completionSentence(compare.completion)}</p>
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

            {/* **A view of ONE comparison, not a second dock.** `RIGHT_DOCKS` holds one column at
                a time, and a planner reading a revision wants the critical-path delta and the
                change list to be two readings of the same pair — not two panels competing for the
                same edge. Local state rather than a URL param: the dock's own open/closed state is
                already the host's, and a sub-view of a panel is not a destination.

                Two buttons with `aria-pressed` rather than a tablist: a tablist promises arrow-key
                navigation between tabs and a `tabpanel` relationship, and implementing half of that
                pattern is how this repository has shipped a control that announces one contract and
                honours another. */}
            {compare.changes ? (
              <div role="group" aria-label="Comparison view" className="flex gap-1">
                <Button
                  variant={view === 'delta' ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={view === 'delta'}
                  onClick={() => {
                    setView('delta');
                  }}
                >
                  Critical path
                </Button>
                <Button
                  variant={view === 'changes' ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={view === 'changes'}
                  onClick={() => {
                    setView('changes');
                  }}
                >
                  Changes
                </Button>
              </div>
            ) : null}

            {view === 'changes' && compare.changes ? (
              <RevisionChangesView
                report={compare.changes}
                onActivateActivity={announceActivation}
                liveActivityIds={liveActivityIds}
              />
            ) : (
              <>
                {criticalPathUnavailable(compare.criticalPath.notAssessableReason) !== null ? (
                  <p className="text-muted-foreground text-sm">
                    {criticalPathUnavailable(compare.criticalPath.notAssessableReason)}
                  </p>
                ) : compare.criticalPath.noCriticalPath ? (
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
                      onActivate={announceActivation}
                    />
                    <MovedSection
                      heading="Left the critical path"
                      icon={ArrowUpFromLine}
                      rows={compare.criticalPath.left}
                      total={compare.criticalPath.leftTotal}
                      cap={compare.criticalPath.cap}
                      emptyMessage="Nothing left the critical path."
                      onActivate={announceActivation}
                    />
                    {/* The denominator. Without it "7 entered the critical path" could be 7 of 10 — a
                    real story — or 7 of 400, which is probably noise. Computed and transmitted from
                    the first commit and rendered by nothing until the M4 ux review asked. */}
                    <p className="text-muted-foreground text-xs">
                      {membershipSentence(
                        compare.criticalPath.remainedCriticalCount,
                        compare.criticalPath.remainedNonCriticalCount,
                      )}
                    </p>
                  </>
                )}

                {compare.criticalPath.addedTotal > 0 || compare.criticalPath.removedTotal > 0 ? (
                  // The TRUE totals, not the returned arrays' lengths: those are capped like their
                  // `entered`/`left` siblings, so a plan with more than the cap in either set would
                  // otherwise be under-reported by a number the client computed itself.
                  <p className="text-muted-foreground text-xs">
                    <CirclePlus className="mr-1 inline size-3" aria-hidden="true" />
                    {compare.criticalPath.addedTotal} added ·{' '}
                    <CircleMinus className="mr-1 inline size-3" aria-hidden="true" />
                    {compare.criticalPath.removedTotal} removed. An activity present in only one
                    revision is listed as added or removed — it did not enter or leave a path it was
                    never on.
                  </p>
                ) : null}
              </>
            )}

            <p id={footerId} className="text-muted-foreground border-border border-t pt-2 text-sm">
              {HONESTY_FOOTER}
            </p>
          </section>
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
  onActivate: (activityId: string) => void;
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
 * `aria-disabled:opacity-50` was `opacity-50` in the shared `ToolbarButton` CVA for the identical
 * semantic state; aligned to that value rather than left as a second answer to one question.
 */
function MovedRow({
  row,
  onActivate,
}: {
  row: RevisionMovedActivity;
  onActivate: (activityId: string) => void;
}): React.ReactElement {
  const detail = (
    <>
      <span>{row.name}</span>
      {row.code === null ? null : <span className="text-muted-foreground"> · {row.code}</span>}
      {/* BOTH sides' float and the resulting dates — which the PRINTOUT stated in six columns
          while the screen showed only the derived phrase, so the person who was not in the room
          got more than the planner looking at the diagram (the M4 ux review's D9 recurrence). */}
      <span className="text-muted-foreground block text-xs">
        {floatPhrase(row)}
        {' · '}
        {floatCell(row.fromTotalFloatDays)} → {floatCell(row.toTotalFloatDays)}
        {row.toEarlyStart === null && row.toEarlyFinish === null
          ? null
          : ` · now ${row.toEarlyStart ?? '—'} to ${row.toEarlyFinish ?? '—'}`}
        {row.existsLive ? null : ' · not in the live plan'}
      </span>
    </>
  );

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
        className="hover:bg-accent focus-visible:ring-ring w-full rounded px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:outline-none aria-disabled:opacity-50"
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
/** An unknown float reads as "unknown", never as a dash that could be mistaken for zero. */
function floatCell(days: number | null): string {
  return days === null ? 'unknown' : `${days} d`;
}

function floatPhrase(row: RevisionMovedActivity): string {
  if (row.floatMovementDays === null) return 'Float movement unknown';
  const magnitude = Math.abs(row.floatMovementDays);
  const unit = magnitude === 1 ? 'day' : 'days';
  if (row.floatMovementDays === 0) return 'Float unchanged';
  return row.floatMovementDays > 0
    ? `Float up ${magnitude} ${unit}`
    : `Float down ${magnitude} ${unit}`;
}
