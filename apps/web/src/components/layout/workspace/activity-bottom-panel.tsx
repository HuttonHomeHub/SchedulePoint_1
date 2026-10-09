import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react';

import { CanvasDockOutlet } from './canvas-dock';
import { PlanFactsOutlet } from './plan-facts-host';
import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import {
  ActivitiesTable,
  CreateActivityButton,
  openActivityEditor,
  type ActivityEditorPurpose,
} from '@/features/activities';
import { BaselineVarianceSummary } from '@/features/baselines';

/**
 * What {@link ActivityBottomPanel} reads from the workspace — narrowed, and stable.
 *
 * **Why the panel does not take `PlanWorkspaceModel`** (`docs/TECH_DEBT.md` #334, M2-F1). That model
 * is a fresh object literal on every workspace render (the hook's `return {…}`), and the workspace
 * renders on every canvas selection change — so a panel keyed on `model` re-ran its whole activity
 * table for a selection that changes nothing the table shows. This is the list of what it does
 * read, and {@link useActivityPanelModel} is the one place that builds it, so the memo below
 * compares exactly the inputs the panel uses and cannot drift from them.
 */
export interface ActivityPanelModel extends Pick<
  PlanWorkspaceModel,
  | 'orgSlug'
  | 'planId'
  | 'canEditSchedule'
  | 'canProgress'
  | 'canWriteNotes'
  | 'activityEditorGating'
  | 'setEditorIntent'
  | 'onOpenLogic'
  | 'onResourcesActivity'
  | 'onMakeMilestone'
  | 'recordActivityCreate'
  | 'recordActivityDelete'
  | 'recordActivityDissolve'
  | 'recordReparent'
  | 'recordAssignmentEdit'
  | 'varianceByActivityId'
  | 'noteCountByActivityId'
> {
  /** Fire-and-forget: the panel never awaits a duplicate. */
  onDuplicateActivity: (activity: ActivitySummary) => void;
  varianceSummary: NonNullable<PlanWorkspaceModel['variance']['data']>['summary'] | undefined;
  calendars: CalendarSummary[];
  calendarsLoading: boolean;
  calendarsError: boolean;
  /** The plan's own calendar — what an activity's empty calendar resolves to. */
  planCalendarId: string | undefined;
  planActivities: ActivitySummary[];
  planActivitiesLoading: boolean;
  planActivitiesError: boolean;
}

/** A stable stand-in for "no list yet", so the narrowed model does not change on an absent `data`. */
const NO_CALENDARS: CalendarSummary[] = [];
const NO_ACTIVITIES: ActivitySummary[] = [];

/**
 * Build the panel's narrowed model from the workspace's, **referentially stable** across renders
 * that changed none of its inputs (M2-F1).
 *
 * It reads leaf values (`.data`, `.isPending`) rather than the query-result objects around them, so
 * a fresh container costs nothing. Every callback it forwards is already a `useCallback` in the
 * model **except `onDuplicateActivity`**, a plain closure over the whole duplicate pipeline that is
 * new every render. That one is wrapped in a stable function that calls the **latest** one through a
 * ref written in a layout effect — never a stale closure, and never the reason the panel re-renders.
 * (The React Compiler is not wired into the build, `GanttPanel.tsx`, so this is manual.)
 */
export function useActivityPanelModel(model: PlanWorkspaceModel): ActivityPanelModel {
  const latestDuplicate = useRef(model.onDuplicateActivity);
  useLayoutEffect(() => {
    latestDuplicate.current = model.onDuplicateActivity;
  });
  const onDuplicateActivity = useCallback((activity: ActivitySummary): void => {
    void latestDuplicate.current(activity);
  }, []);

  const {
    orgSlug,
    planId,
    canEditSchedule,
    canProgress,
    canWriteNotes,
    activityEditorGating,
    setEditorIntent,
    onOpenLogic,
    onResourcesActivity,
    onMakeMilestone,
    recordActivityCreate,
    recordActivityDelete,
    recordActivityDissolve,
    recordReparent,
    recordAssignmentEdit,
    varianceByActivityId,
    noteCountByActivityId,
  } = model;
  const varianceSummary = model.variance.data?.summary;
  const calendars = model.calendars.data ?? NO_CALENDARS;
  const calendarsLoading = model.calendars.isPending;
  const calendarsError = model.calendars.isError;
  const planCalendarId = model.plan.data?.calendarId ?? undefined;
  const planActivities = model.activities.data ?? NO_ACTIVITIES;
  const planActivitiesLoading = model.activities.isPending;
  const planActivitiesError = model.activities.isError;

  return useMemo(
    () => ({
      orgSlug,
      planId,
      canEditSchedule,
      canProgress,
      canWriteNotes,
      activityEditorGating,
      setEditorIntent,
      onOpenLogic,
      onResourcesActivity,
      onMakeMilestone,
      recordActivityCreate,
      recordActivityDelete,
      recordActivityDissolve,
      recordReparent,
      recordAssignmentEdit,
      varianceByActivityId,
      noteCountByActivityId,
      onDuplicateActivity,
      varianceSummary,
      calendars,
      calendarsLoading,
      calendarsError,
      planCalendarId,
      planActivities,
      planActivitiesLoading,
      planActivitiesError,
    }),
    [
      orgSlug,
      planId,
      canEditSchedule,
      canProgress,
      canWriteNotes,
      activityEditorGating,
      setEditorIntent,
      onOpenLogic,
      onResourcesActivity,
      onMakeMilestone,
      recordActivityCreate,
      recordActivityDelete,
      recordActivityDissolve,
      recordReparent,
      recordAssignmentEdit,
      varianceByActivityId,
      noteCountByActivityId,
      onDuplicateActivity,
      varianceSummary,
      calendars,
      calendarsLoading,
      calendarsError,
      planCalendarId,
      planActivities,
      planActivitiesLoading,
      planActivitiesError,
    ],
  );
}

/**
 * What the panel header says while the diagram is hidden behind it (short-screen swap, ADR-0180).
 * One string: ux-reviewer signs the copy off, and the journey asserts it by this text.
 */
export const DIAGRAM_HIDDEN_NOTE = 'Diagram hidden. Collapse to return.';
/** The same note when the view the swap hid is the Gantt, so the sentence names what is gone. */
export const GANTT_HIDDEN_NOTE = 'Gantt hidden. Collapse to return.';
/** Appended to {@link DIAGRAM_HIDDEN_NOTE} when the swap put an armed drawing tool away. */
export const TOOL_PUT_AWAY_NOTE = 'Drawing tool put away.';

/**
 * The foot row's Expand / Collapse button. `shrink-0` because a flex item shrinks by default and M0
 * measured Expand at 26 x 40 at 640 and 16 x 40 at 320 (retire-single-pane m0-measurement §0 row 3);
 * `ml-auto` so that when the row wraps the button keeps the trailing edge of its own line.
 */
const FOOT_TOGGLE_CLASS = 'ml-auto shrink-0';

/**
 * The activity list docked at the bottom of the canvas-first {@link PlanWorkspace}
 * (ADR-0030). It fills the height its container gives it and scrolls internally, so the
 * canvas above keeps the rest. The workspace owns the drag-resizer (the shared
 * resizable-panel primitive) and the panel's height; this component is the panel *content*.
 *
 * Reuses the same `ActivitiesTable` (computed columns, variance, progress editor, CRUD) the
 * stacked page used, driven off the shared model so behaviour is identical to the legacy layout.
 *
 * **This claimed "virtualization" until `docs/TECH_DEBT.md` #334, and that was false; the table is
 * now windowed for real** (ADR-0165, #334 M3). `ActivitiesTable` opts into `DataTable`'s
 * `windowed` mode, so only the rows in view (plus overscan) are in the DOM, however many the plan
 * holds. The accepted costs: find-in-page cannot find a row outside the window, and a screen
 * reader's table navigation reaches it only as the window moves (the diagram's listbox lists every
 * activity). The committed conditions and bars are
 * `docs/specs/activities-panel-scale/m0-conditions.md`, and the re-measure is `m3-measurement.md`:
 * at 2,000 rows opening went from ~1,664 ms to 72–80 ms, and every armed limb passes.
 *
 * The pen read-only note is **not** shown here — the workspace shows a single consolidated note
 * above the whole body (ADR-0030 US-4).
 */
export const ActivityBottomPanel = memo(function ActivityBottomPanel({
  model,
  onCollapse,
  focusCollapseOnMount = false,
  diagramHidden = false,
  hiddenView = 'diagram',
  toolDisarmed = false,
  collapseRef: collapseRefProp,
}: {
  /** Built by {@link useActivityPanelModel}; a stable object, which is what lets the memo hit. */
  model: ActivityPanelModel;
  /** Collapse the panel to its handle. Required: the below-`md` single pane, which had no collapsed
   * state and so left the control out, is gone (ADR-0181). */
  onCollapse: () => void;
  /** After a user *expand*, the panel remounts — move focus onto the collapse control so a
   * keyboard/AT user isn't dropped to `<body>` (mirrors the rail's toggle focus). */
  focusCollapseOnMount?: boolean;
  /**
   * The workspace has hidden the diagram and given this panel the whole body (short-screen swap).
   * Shows {@link DIAGRAM_HIDDEN_NOTE} beside the heading. The panel is re-styled by its host, never
   * re-mounted, so the plan's slot outlets mount once.
   */
  diagramHidden?: boolean;
  /** Which projection the swap hid, so the note names it. Read only while `diagramHidden`. */
  hiddenView?: 'diagram' | 'gantt';
  /** The swap put an armed drawing tool away; adds {@link TOOL_PUT_AWAY_NOTE} to the note. */
  toolDisarmed?: boolean;
  /**
   * The host's handle on the Collapse button, so it can move focus there when the swap hides the
   * control focus was on (a live resize: `focusCollapseOnMount` only runs on mount).
   */
  collapseRef?: RefObject<HTMLButtonElement | null>;
}): React.ReactElement {
  const ownCollapseRef = useRef<HTMLButtonElement>(null);
  const collapseRef = collapseRefProp ?? ownCollapseRef;
  const hiddenNoteId = useId();
  useEffect(() => {
    if (focusCollapseOnMount) collapseRef.current?.focus();
  }, [focusCollapseOnMount, collapseRef]);
  // Stable, so the table's `columns` (memoised over these) do not change on a workspace render.
  const { setEditorIntent, onDuplicateActivity } = model;
  const onOpenEditor = useCallback(
    (activity: ActivitySummary, purpose: ActivityEditorPurpose): void =>
      setEditorIntent(openActivityEditor(activity, purpose)),
    [setEditorIntent],
  );

  return (
    <section
      // "Activities panel", not "Activities": the inner DataTable's scroll region is already named
      // "Activities", so a bare match would announce two identical landmarks (axe landmark-unique,
      // TECH_DEBT #30h). The visible <h2> stays "Activities".
      aria-label="Activities panel"
      // `overflow-y-auto` is the floor's fallback (ADR-0179): the header and the foot row hold
      // their content height and the table body gives way, so in a short window with a selection
      // (a wrapped object bar is ~156 px) their sum can exceed the panel's clamped height. Without
      // a scroller that overflow was painted below the window, outside the shell's `overflow-hidden`,
      // where no pointer or scroll could reach the object actions. It never scrolls when the
      // content fits, so the designed sizes are unchanged.
      className="border-border flex h-full min-h-0 flex-col overflow-y-auto border-t"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium">Activities</h2>
          {model.varianceSummary ? (
            <BaselineVarianceSummary summary={model.varianceSummary} />
          ) : null}
        </div>
        {diagramHidden ? (
          // Plain text, never truncated: it wraps so a narrow panel reflows rather than clips, and
          // is not a live region because focus is already moving to Collapse, which describes itself
          // by this note, so the text is read once, with the control it explains.
          <p id={hiddenNoteId} className="text-muted-foreground min-w-0 text-sm whitespace-normal">
            {hiddenView === 'gantt' ? GANTT_HIDDEN_NOTE : DIAGRAM_HIDDEN_NOTE}
            {toolDisarmed ? ` ${TOOL_PUT_AWAY_NOTE}` : ''}
          </p>
        ) : null}
        {/* **The dock is NOT here any more** (foot-row epic M4). It lived in this header until
            2026-08-26, which is precisely what made the foot juggle: expanding the panel moved
            every transient strip — and the object-action bar with them — from the bottom of the
            screen up to here, and the plan's facts the other way. Both now live in
            `PlanActivitiesFootRow` below the table, in the same place in both states.

            What stays here is what belongs to the PANEL rather than to the plan: its heading, its
            baseline variance, its create button and its collapse control. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {model.canEditSchedule ? (
            <CreateActivityButton
              orgSlug={model.orgSlug}
              planId={model.planId}
              calendars={model.calendars}
              calendarsLoading={model.calendarsLoading}
              calendarsError={model.calendarsError}
              {...(model.planCalendarId === undefined
                ? {}
                : { planCalendarId: model.planCalendarId })}
              planActivities={model.planActivities}
              planActivitiesLoading={model.planActivitiesLoading}
              planActivitiesError={model.planActivitiesError}
              onCreated={model.recordActivityCreate}
            />
          ) : null}
        </div>
      </div>
      {/* No `overflow-y-auto` here any more (activities-panel-scale M1) — `ActivitiesTable`'s own
          region is now the panel's ONE scroller (`scroll="contained"`, `data-table.tsx`), so this
          div only needs to pass its height through as a flex column. A second scroller here would
          have reproduced the exact defect the milestone exists to remove: two nested overflow
          containers where only the outer one actually scrolled vertically.

          `data-testid` rather than a class-string or copy locator (the standing rule after
          `docs/TECH_DEBT.md` #124/#133's journeys broke on exactly that): SC-5's own journey needs
          to assert THIS div's `scrollHeight === clientHeight` and it has no accessible name of its
          own to query by.

          `overflow-y-auto` IS here, but only as a fallback: while the table's region fits, it
          fills this div exactly and this div never scrolls (SC-5 holds). When a selection's
          bulk-assign bar plus the region's `min-h-32` floor exceed a short panel, this div scrolls
          so the rows stay reachable, rather than the region collapsing to its header. */}
      <div
        data-testid="activities-panel-body"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4"
      >
        <ActivitiesTable
          orgSlug={model.orgSlug}
          planId={model.planId}
          canEditSchedule={model.canEditSchedule}
          canReportProgress={model.canProgress}
          canWriteNotes={model.canWriteNotes}
          editorGating={model.activityEditorGating}
          /*
           * **One editor for the plan** (Graphite M6-T4). The table used to mount its own beside
           * the workspace's; after M6-T2 that also meant Edit opened a drawer from the canvas and a
           * modal from here, for the same activity. It routes to the workspace's intent now, so the
           * chrome is decided in one place.
           */
          onOpenEditor={onOpenEditor}
          onOpenLogic={model.onOpenLogic}
          onOpenResources={model.onResourcesActivity}
          onDuplicate={onDuplicateActivity}
          // Make milestone… (ADR-0162 decision 4). No focus call here: the row menu's `Menu`
          // restores focus to this row's trigger on close, before the dialog opens.
          onMakeMilestone={model.onMakeMilestone}
          /*
           * **The same act must be undoable from both surfaces** (`docs/TECH_DEBT.md` #230). The
           * canvas has recorded its deletes through `ActivityCrudDialogs` since ADR-0048 M2; this
           * table recorded nothing, so deleting a phase from the panel silently had no undo. Both
           * seams come from the ONE history the workspace owns — the table never learns it exists.
           */
          onDeleted={model.recordActivityDelete}
          onDissolved={model.recordActivityDissolve}
          onReparented={model.recordReparent}
          onAssignmentEdited={model.recordAssignmentEdit}
          calendars={model.calendars}
          calendarsLoading={model.calendarsLoading}
          {...(model.planCalendarId === undefined ? {} : { planCalendarId: model.planCalendarId })}
          {...(model.varianceByActivityId
            ? { varianceByActivityId: model.varianceByActivityId }
            : {})}
          {...(model.noteCountByActivityId
            ? { noteCountByActivityId: model.noteCountByActivityId }
            : {})}
        />
      </div>
      {/* **The foot row, last band, identical to the collapsed state** (foot-row epic M4). The
          panel expands ABOVE it, so the plan's facts and every docked strip stay exactly where they
          were — which is the whole subject of this milestone. The collapse control rides here
          rather than in the header for the same reason: it is the row's own affordance in both
          states, and a planner should not have to look in two places for it. */}
      <PlanActivitiesFootRow
        toggle={
          <Button
            ref={collapseRef}
            variant="ghost"
            size="icon"
            aria-label="Collapse activities panel"
            className={FOOT_TOGGLE_CLASS}
            {...(diagramHidden ? { 'aria-describedby': hiddenNoteId } : {})}
            onClick={onCollapse}
          >
            <PanelBottomClose aria-hidden="true" className="size-4" />
          </Button>
        }
      />
    </section>
  );
});

/**
 * **The plan's foot row — one component, rendered in BOTH panel states** (foot-row epic M4).
 *
 * The product owner's complaint was that the foot "juggles": collapsed, the facts sat left and the
 * object actions right on one shared row; expanded, the actions moved into the panel's header and
 * the facts dropped to a full-width strip at the very bottom of the screen. The two swapped sides
 * every time the panel opened. They no longer can, because there is one row and it is always the
 * last band.
 *
 * **The ACTIONS lead as of the foot-row-and-deck epic, and the reason this docblock used to give
 * for the opposite was false.**
 *
 * It said: *"The first draft of the spec put the dock first and the facts after it, which would
 * have made the facts slide sideways every time a selection appeared — the same juggle one axis
 * over. An always-present region goes before a transient one."* That is a claim about flex sizing
 * and it does not hold against the code it describes. Measured
 * (`docs/specs/workspace-foot-and-deck/m0-measurement.md` §2): the dock is
 * `flex min-w-0 flex-1 flex-wrap` — `flex-grow: 1`, `flex-basis: 0%` — so **its width does not
 * depend on its contents**; it claims all the free space whether it holds ten controls or none. The
 * facts are `shrink-0` with `basis: auto`, so their width is constant. At either end, neither
 * region moves when a selection appears. ADR-0076 Class 3, in a document three days old.
 *
 * So the order was a free choice, and it is now made on the ground that survives: the object bar
 * gets a **fixed leading edge**. The facts block's width varies by over 100 px between states (a
 * critical count appearing, a schedule state changing), and with the facts leading, every button in
 * the bar shifted by that difference. Nothing about the flex model prevented that — it is what
 * `basis: auto` on the leading item means — and it is the juggle the sentence above was reaching
 * for, one region over from where it looked.
 *
 * `min-h-9` rather than `h-9`: a strip taller than the row grows it instead of being clipped, which
 * is what a fixed height would do silently. Since the selection bar started wrapping (M1) that is
 * no longer theoretical — it is how a row of eleven object actions stays reachable at 1646.
 *
 * **The row wraps, and that is what keeps Expand on screen at any width** (retire-single-pane M1).
 * The facts are a `shrink-0` block whose one-line width is about 580 px, so in a body narrower than
 * that the row used to push its trailing item out of the body, where `overflow-hidden` clipped it
 * (M0: Expand 16 px wide at x = 606 in a 320 px body). With `flex-wrap` the facts take a line of
 * their own and wrap inside it (`PlanFacts` is `max-w-full`), and the toggle — `shrink-0`, so it is
 * never squeezed, and `ml-auto`, so it keeps the trailing edge of whichever line it lands on — is
 * always reachable. The row stays `shrink-0` with `min-h-9` as a floor only, so the body gives up
 * the height for a second line rather than clipping it.
 *
 * **Both slot outlets are unconditional.** The prop that withheld them for the below-`md`
 * single-pane layout (`hostsPlanSlots`) is gone with that layout: there is no longer a pane that is
 * `display: none` by default for an outlet to register inside.
 */
export function PlanActivitiesFootRow({
  toggle,
}: {
  /** The panel's own expand/collapse control, rendered at the trailing edge. */
  toggle?: React.ReactNode;
}): React.ReactElement {
  return (
    <Surface
      tone="chrome"
      // A test hook in this codebase's established shape (`data-toolbar-item`, `data-plan-identity`).
      // This row IS the `CanvasDockOutlet`'s host (ADR-0092), so the dock journey has to find it —
      // and it was finding it by the word "Activities", which the status bar's activity-count fact
      // started matching too (Graphite M7). Locating chrome by its copy is what the standing rule
      // after ADR-0091 forbids, and this is the third time it has bitten.
      data-activities-bar
      /*
       * **The foot row joins the chrome scope** (foot-row-and-deck M2).
       *
       * The product owner asked whether "the bottom toolbar should be the same colour etc as the
       * others to tie them in". Measured, the answer is stronger than a colour difference: this row
       * had **no surface scope at all**. It resolved `(page)` — a transparent background and one
       * 1 px grey `--border` — while the header and command deck are a `<Surface tone="chrome">`
       * card, navy, 10 px radius, with a 3 px amber bottom edge. They were not two shades of one
       * treatment; one was a card and the other a hairline.
       *
       * **It costs no height, and that is why it is a scope rather than a card.** `Surface` adds
       * `bg-background text-foreground` and the `data-surface` attribute and nothing else — no
       * padding, no border, no radius — so every token inside this row rebinds to the chrome family
       * while the box model is untouched. The row's floor is the 40 px collapse button and stays
       * there. Giving it the band's radius and amber edge as well was rejected for exactly that
       * reason: those are geometry, and this row's whole value is that it does not take any.
       *
       * **The seam is the band's amber rule now, mirrored** (workspace visual polish, 2026-08-28).
       * The row's top edge was a 1 px chrome-family hairline; the product owner asked for "an
       * orange accent on the top of the bottom toolbar so it ties in with the top toolbar", and the
       * mirror is exact: `ChromeBandRow` closes with `border-b-[3px] border-b-primary` (the old
       * Flask app's own device), this row opens with the same rule the other way up, and the two
       * chrome bands bracket the diagram. Decorative rule — 1.4.11-exempt — and the token, never a
       * literal (the colour-literal lint rule stands).
       *
       * `px-2 py-1` COPIES the deck's own content inset (`plan-workspace-toolbar.tsx`, the
       * `<div className="px-2 py-1">` around the Deck) rather than judging one: the product
       * owner's item was that this row sits tighter to its dark ground than the deck does to the
       * band's (measured 16 px left / ≈1 px top against the deck's 9 px,
       * `docs/specs/workspace-visual-polish/README.md` M0). Copying the classes rather than the
       * measured pixel keeps the two in step if the deck's inset ever moves — and keeps arbitrary
       * values out of the sizing ratchet's sight. The vertical cost is the ask, not a side effect;
       * `dock.spec.ts`'s guarantees are deltas (a docked strip costs the canvas nothing), which a
       * constant applied to both states cannot move.
       */
      className="border-t-primary flex min-h-9 shrink-0 flex-wrap items-center gap-x-2 gap-y-0 border-t-[3px] px-2 py-1"
    >
      {/* **The facts, now TRAILING** (foot-row-and-deck M3 — see the docblock above for why the
          order moved, and why the reason originally given for facts-leading did not hold). This row said "Activities" and the status bar said
          "Activities 5" — the same subject rendered twice, one of them a duplicate that had already
          broken a test three times by being matched instead of this row. The count fact names the
          panel AND gives its size, so one control does both jobs and the word appears once **in the
          collapsed state**. Expanded it appears twice — the panel's own `<h2>` above the table, and
          this fact below it — which the first version of this comment claimed it did not. That is
          not a landmark collision (the `<section>` is labelled "Activities panel"), and the two are
          different subjects at opposite ends of the panel; but the justification as written was
          false in the state M4 introduced, and is corrected rather than quietly kept. */}
      <CanvasDockOutlet />
      <PlanFactsOutlet />
      {toggle}
    </Surface>
  );
}

/**
 * The collapsed state: the foot row alone, with an Expand control.
 *
 * Kept as a named component rather than inlined at the call site so the two states are obviously
 * the same row — and so the focus-on-mount behaviour, which exists because collapsing unmounts the
 * button the planner just pressed, lives beside the control it moves focus to.
 */
export function ActivityPanelCollapsedBar({
  onExpand,
  focusExpandOnMount = false,
}: {
  onExpand: () => void;
  focusExpandOnMount?: boolean;
}): React.ReactElement {
  const expandRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusExpandOnMount) expandRef.current?.focus();
  }, [focusExpandOnMount]);

  return (
    <PlanActivitiesFootRow
      toggle={
        <Button
          ref={expandRef}
          variant="ghost"
          size="icon"
          aria-label="Expand activities panel"
          className={FOOT_TOGGLE_CLASS}
          onClick={onExpand}
        >
          <PanelBottomOpen aria-hidden="true" className="size-4" />
        </Button>
      }
    />
  );
}
