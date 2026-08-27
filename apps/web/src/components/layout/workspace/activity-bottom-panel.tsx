import { PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { CanvasDockOutlet } from './canvas-dock';
import { PlanFactsOutlet } from './plan-facts-host';
import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { ActivitiesTable, CreateActivityButton, openActivityEditor } from '@/features/activities';
import { BaselineVarianceSummary } from '@/features/baselines';

/**
 * The activity list docked at the bottom of the canvas-first {@link PlanWorkspace}
 * (ADR-0030). It fills the height its container gives it and scrolls internally, so the
 * canvas above keeps the rest. The workspace owns the drag-resizer (the shared
 * resizable-panel primitive) and the panel's height; this component is the panel *content*.
 *
 * Reuses the same `ActivitiesTable` (computed columns, variance, progress editor, CRUD,
 * virtualization) the stacked page used, driven off the shared model so behaviour is
 * identical to the legacy layout. The pen read-only note is **not** shown here — the
 * workspace shows a single consolidated note above the whole body (ADR-0030 US-4).
 */
export function ActivityBottomPanel({
  model,
  onCollapse,
  focusCollapseOnMount = false,
  hostsPlanSlots = true,
}: {
  model: PlanWorkspaceModel;
  /**
   * Whether this panel provides the plan's slot outlets — the **facts** and the **canvas dock**
   * (workspace-chrome M3; widened from `hostsDock` in the foot-row epic's M7).
   *
   * **`false` on the narrow single-pane layout, and that is a correctness fix rather than a
   * preference.** Below `md` the workspace mounts BOTH panes and hides the inactive one with
   * `display: none`; the default pane is the diagram, so an outlet rendered here would register
   * while invisible, and `CanvasDock` would portal the armed-tool statement, both selection bars
   * and the edit-conflict banner into a node that is in no accessibility tree at all — a WCAG 4.1.3
   * failure that looks like nothing on screen, because the strips are simply absent. Withholding
   * the outlet lets `CanvasDock` fall back to rendering in place, which is exactly where those
   * strips were before this epic and is the right answer on a screen with no spare row to dock into.
   * Found by the accessibility gate; no test in the repository exercised the narrow path, and jsdom
   * could not have seen it (it has no layout to make `display: none` mean anything).
   *
   * **It covers the facts because the narrower version of it did not, and that broke the same way
   * one milestone later.** M4 put `PlanFactsOutlet` in the foot row and left it ungated — so on the
   * narrow layout the plan's facts, its schedule state, its only `Recalculate` button and the pen's
   * live region all portalled into the hidden pane and disappeared, while three docblocks and the
   * spec's own edge-case table said they rendered in the shell status bar. One correct rule applied
   * to a control and not its neighbour, which is the failure this register keeps recording — here
   * inside the docblock that describes it.
   */
  hostsPlanSlots?: boolean;
  /** Collapse the panel to its handle. Omitted on the mobile single-pane view (the view toggle
   * switches away from Activities instead), where no collapse control is shown. */
  onCollapse?: () => void;
  /** After a user *expand*, the panel remounts — move focus onto the collapse control so a
   * keyboard/AT user isn't dropped to `<body>` (mirrors the rail's toggle focus). */
  focusCollapseOnMount?: boolean;
}): React.ReactElement {
  const collapseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusCollapseOnMount) collapseRef.current?.focus();
  }, [focusCollapseOnMount]);

  return (
    <section
      // "Activities panel", not "Activities": the inner DataTable's scroll region is already named
      // "Activities", so a bare match would announce two identical landmarks (axe landmark-unique,
      // TECH_DEBT #30h). The visible <h2> stays "Activities".
      aria-label="Activities panel"
      className="border-border flex h-full min-h-0 flex-col border-t"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium">Activities</h2>
          {model.variance.data ? (
            <BaselineVarianceSummary summary={model.variance.data.summary} />
          ) : null}
        </div>
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
              calendars={model.calendars.data ?? []}
              calendarsLoading={model.calendars.isPending}
              calendarsError={model.calendars.isError}
              {...(model.plan.data?.calendarId == null
                ? {}
                : { planCalendarId: model.plan.data.calendarId })}
              planActivities={model.activities.data ?? []}
              planActivitiesLoading={model.activities.isPending}
              planActivitiesError={model.activities.isError}
            />
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
          onOpenEditor={(activity, purpose) =>
            model.setEditorIntent(openActivityEditor(activity, purpose))
          }
          onOpenLogic={model.onOpenLogic}
          onOpenResources={model.onResourcesActivity}
          onDuplicate={(a) => void model.onDuplicateActivity(a)}
          calendars={model.calendars.data ?? []}
          calendarsLoading={model.calendars.isPending}
          {...(model.plan.data?.calendarId == null
            ? {}
            : { planCalendarId: model.plan.data.calendarId })}
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
        hostsPlanSlots={hostsPlanSlots}
        {...(onCollapse
          ? {
              toggle: (
                <Button
                  ref={collapseRef}
                  variant="ghost"
                  size="icon"
                  aria-label="Collapse activities panel"
                  onClick={onCollapse}
                >
                  <PanelBottomClose aria-hidden="true" className="size-4" />
                </Button>
              ),
            }
          : {})}
      />
    </section>
  );
}

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
 */
export function PlanActivitiesFootRow({
  toggle,
  hostsPlanSlots = true,
}: {
  /** The panel's own expand/collapse control, rendered at the trailing edge. */
  toggle?: React.ReactNode;
  /**
   * Whether this row hosts the **plan's slot outlets** — the facts and the canvas dock. False in
   * the narrow single-pane layout, where the pane is `display: none` while the planner is on the
   * diagram, so an outlet inside it would swallow every strip AND the plan's facts. Both fall back
   * to rendering where they did before this epic.
   */
  hostsPlanSlots?: boolean;
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
       * `border-t` is kept and now resolves the chrome family's `--border` rather than the page's,
       * so the seam is drawn in the vocabulary of the surface it belongs to.
       */
      className="border-border flex min-h-9 shrink-0 items-center gap-2 border-t px-4"
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
          false in the state M4 introduced, and is corrected rather than quietly kept.

          **Both outlets take the same gate, and the prop is named for the pair rather than for the
          dock — because naming it for one outlet is how the other one got missed.** It shipped as
          `hostsDock`, guarding the dock while `PlanFactsOutlet` registered unconditionally forty
          lines below its own docblock explaining why that is fatal. Below `md` the whole panel sits
          in a `display: none` pane by default, so the facts outlet registered, `PlanStatusBar`
          portalled the facts, the schedule state, the only `Recalculate` control and the pen's
          `role="status"` region into a hidden node, and the shell's status row — `empty:hidden` —
          collapsed. The plan's facts vanished entirely on the narrowest screens, and a live region
          sat somewhere it could never announce. Found by the architecture gate. */}
      {hostsPlanSlots ? <CanvasDockOutlet /> : null}
      {hostsPlanSlots ? <PlanFactsOutlet /> : null}
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
  hostsPlanSlots = true,
}: {
  onExpand: () => void;
  focusExpandOnMount?: boolean;
  hostsPlanSlots?: boolean;
}): React.ReactElement {
  const expandRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusExpandOnMount) expandRef.current?.focus();
  }, [focusExpandOnMount]);

  return (
    <PlanActivitiesFootRow
      hostsPlanSlots={hostsPlanSlots}
      toggle={
        <Button
          ref={expandRef}
          variant="ghost"
          size="icon"
          aria-label="Expand activities panel"
          onClick={onExpand}
        >
          <PanelBottomOpen aria-hidden="true" className="size-4" />
        </Button>
      }
    />
  );
}
