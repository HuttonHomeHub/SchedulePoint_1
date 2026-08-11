import {
  Check,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Crosshair,
  ListChecks,
  Route,
  SquarePen,
  Trash2,
  Ungroup,
  Users,
  Waypoints,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { LogicPathMode } from '../render/logic-path';

import { Menu, MenuItem, MenuSection, useMenuTrigger } from '@/components/ui/menu';
import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import {
  defineToolbar,
  type ToolbarItem,
  type ToolbarItemRenderApi,
} from '@/components/ui/toolbar/toolbar-registry';
import { toolbarControlVariants } from '@/components/ui/toolbar/toolbar-styles';
import {
  ACTIVITY_COPY_PASTE_ENABLED,
  CANVAS_NAV_ENABLED,
  CANVAS_SEARCH_NAV_ENABLED,
  ACTIVITY_STEPS_ENABLED,
  EARNED_VALUE_ENABLED,
  ENTRY_ROUTES_ENABLED,
  RESOURCES_ENABLED,
  WBS_IMPROVEMENTS_ENABLED,
} from '@/config/env';
import { cn } from '@/lib/utils';

/**
 * The context for the **floating selection-actions** bar (ADR-0031, Fork-2 default): the commands
 * that act on the currently-selected activity. The read action (open logic) is always available;
 * the mutating actions (edit / delete) are pen-gated as a set via `canEditSchedule`.
 */
export interface SelectionActionContext {
  /** The selected activity's display name — for the bar's accessible name + action labels. */
  targetName: string;
  /** Whether schedule edits are allowed now (role + pen); gates the mutating actions. */
  canEditSchedule: boolean;
  /**
   * Why a mutating action is shut, given a phrase naming what it does — `null` when it is open.
   * The same seam the main toolbar takes (`docs/TECH_DEBT.md` #114.1/#115): `canEditSchedule` has
   * already fused role and pen, so a sentence built from it alone is false for one of the two
   * readers it addresses.
   */
  scheduleRefusal: (action: string) => string | null;
  /** Whether the viewer may report progress (Contributor upward, role only — NOT pen-gated); gates the
   * `progress` item exactly like the toolbar's Update-progress command (`canProgress`). */
  canReportProgress: boolean;
  /** Whether the selected activity can carry weighted steps — false for a duration-derived type
   * (milestone / LOE / WBS summary), matching the activities-table Steps row action. Gates the `steps`
   * item's visibility (with `canEditSchedule`), mirroring the table's `!isDurationDerivedType`. */
  stepsEligible: boolean;
  /**
   * The selection is a `WBS_SUMMARY` — the only kind of activity that can be dissolved. A context
   * fact rather than a check inside the handler, so a non-summary selection cannot reach an action
   * the server would 422.
   */
  isSummary: boolean;
  onOpenLogic: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Dissolve the selected summary — remove the grouping, keep the work (`VITE_WBS_IMPROVEMENTS`). */
  onDissolve: () => void;
  /**
   * Duplicate the selected activity (`docs/specs/activity-copy-paste/` M1). Wired regardless of the
   * flag; the `duplicate` item that calls it is only registered when the flag is on.
   */
  onDuplicate: () => void;
  /**
   * Duplicate the selected **summary and its whole subtree** (M2, US-2) — a confirmed action,
   * because it creates as many activities as the band holds.
   *
   * A separate callback rather than a branch inside `onDuplicate`, for the reason Dissolve is
   * separate from Delete: the two operations differ in what they create, what they confirm and what
   * they announce, and one entry point is how they end up sharing one sentence.
   */
  onDuplicateBand: () => void;
  /** Open the per-activity resource-assignment editor (entry-route win 2, `VITE_ENTRY_ROUTES`). Wired
   * regardless of the flag; the `resources` item that calls it is only registered when the flag is on. */
  onResources: () => void;
  /** Open the progress editor (`ActivityProgressDialog`) for the selected activity. Wired regardless of
   * the flag; the `progress` item that calls it is only registered when `VITE_ENTRY_ROUTES` is on. */
  onProgress: () => void;
  /** Open the weighted-steps editor (`ActivityStepsDialog`) for the selected activity. Wired regardless
   * of the flag; the `steps` item is only registered when the flag + `VITE_EARNED_VALUE` +
   * `VITE_ACTIVITY_STEPS` are all on. */
  onSteps: () => void;
}

/**
 * The **canvas half** of the selection bar's context (ADR-0090 M2-T1): the three commands that act
 * on the selected activity *through the canvas* — zoom to it, isolate its logic, analyse its float
 * paths. They lived on Row 1 until M2 and were the single largest contribution to its pinned floor.
 *
 * **Deliberately a separate interface from {@link SelectionActionContext}, intersected rather than
 * merged.** The object actions are about the activity; these are about the view of it. Fusing them
 * into one interface would make "which half is missing?" unanswerable at the seam — the ADR-0062
 * lesson, where a gate object that had already fused role and pen could not say which one shut the
 * door. Here it is load-bearing for a different reason: the canvas half is **optional at the host**
 * (`TsldPanel`'s `selectionCanvas` prop), so its absence must be expressible.
 *
 * **State and callbacks only — no predicates, and that is the finding rather than a simplification.**
 * On Row 1 each of these three carried two or three shade reasons: `CANVAS_ONLY_REASON` (the Gantt
 * mounts no canvas), "Add an activity first", "Select an activity first". Every one is unreachable
 * here, because this bar renders **only from the canvas** and **only for a selection** — so
 * `canvasActive`, `hasDiagram`, `activityCount > 0` and `selectedActivity != null` all hold by
 * construction. The commands are simply enabled. That is ADR-0082's discriminating rule landing
 * where it belongs: *omit* when the action does not apply to the object, and with no selection there
 * is no object.
 *
 * The accepted cost is stated in `docs/specs/workspace-layout/implementation-plan.md`: a planner with
 * nothing selected no longer sees these commands shaded with the precondition that would teach them.
 */
export interface SelectionCanvasContext {
  /** Isolation is running — the main button's `aria-pressed`. */
  isolateActive: boolean;
  /** Which logic path is isolated; names the pressed button and ticks the menu. */
  isolateMode: LogicPathMode;
  /** Start isolation in the current/last mode, or exit it if running. */
  toggleIsolate: () => void;
  /** Pick a mode (and start isolating in it). */
  setIsolateMode: (mode: LogicPathMode) => void;
  /** Frame the viewport on the selected activity. */
  zoomToSelection: () => void;
}

/**
 * **`float-paths` is deliberately NOT here, and the plan said it should be.**
 *
 * `implementation-plan.md` M2-T1 lists it with the other two on the grounds that _"`isEnabled`
 * requires a selection"_. That is true and it is the wrong test: it conflates **needs a selection**
 * with **is a canvas command**. Float paths is an *analysis* and runs in the **Gantt** as well as
 * the diagram — its `isEnabled` reads `activityCount`, deliberately not `canvasActive` or even
 * `hasDiagram` — so moving it into a bar that only the canvas renders would delete it from the
 * Gantt outright.
 *
 * That is not an inference. `tsld-toolbar-items.tsx` states it at the registration (_"Live in the
 * Gantt as well as the Diagram… the ADR-0059 M6 lesson inverted: shade what only the canvas can do,
 * never what both can"_), and `float-paths-view-agnostic.structural.test.ts` exists **specifically**
 * to make that fail loudly, because — in its own words — a canvas coupling "would only show up as a
 * broken Gantt in someone's browser".
 *
 * So M2-T1 moves **two** commands, not three. Float paths keeps its Row-1 seat until a destination
 * exists that both views share; the pinned-floor saving is correspondingly smaller.
 */

/**
 * What the bar's items are actually typed over: the object actions, plus a **nullable** canvas half.
 *
 * Nested and nullable rather than a flat intersection, because the canvas half genuinely can be
 * absent — the Gantt renders no selection bar today, but `TsldPanel` is not the only conceivable
 * host, and the alternative (inert no-op defaults plus a separate "are these real?" boolean) is the
 * fused shape ADR-0062 warns about: two facts in one object where neither can be checked.
 * `canvas === null` is the whole statement, and the three items' `isVisible` reads exactly it.
 */
export type SelectionBarContext = SelectionActionContext & {
  /** The canvas commands, or `null` when the host has none to offer — see {@link SelectionCanvasContext}. */
  canvas: SelectionCanvasContext | null;
};

/** The phrase these five actions complete: "…to change this activity". The FRAME is chosen by
 * `ctx.scheduleRefusal` from the live role/pen state — see {@link SelectionActionContext}. */
const PEN_ACTION = 'change this activity';
const PROGRESS_REASON = 'You don’t have permission to report progress';

const ISOLATE_MODE_LABELS: Record<LogicPathMode, string> = {
  full: 'Full path',
  driving: 'Driving path',
};

const ISOLATE_OPTIONS_LABEL = 'Isolate logic path options';

/**
 * The **Isolate logic path** control (canvas nav, `docs/specs/canvas-nav/`, flag-on) — a **split
 * button** (mirroring {@link AddActivityControl}'s arm-vs-pick model): the **main** button starts /
 * exits isolation directly, and a separate **chevron** opens the mode menu (Full logic path / Driving
 * path only / Stop isolating). This is a deliberate TOGGLE-with-mode control — the main button carries
 * `aria-pressed` (unlike {@link ColourByControl}, which omits it, a11y-rec-3), so clicking the pressed
 * button EXITS isolate (`toggleIsolate`) rather than re-opening the menu (U1); when off it activates
 * isolate in the current/last mode. Keep this split + `aria-pressed`; don't "align" it to the plain
 * menu-buttons. The main button is the single roving stop (spreads `itemProps`); the chevron is a
 * pointer affordance (`tabIndex -1`) with a keyboard equivalent (ArrowDown/Up on the main button opens
 * the menu, the standard split-button keystroke). View-only (never pen-gated); shaded with a reason
 * when nothing is selected / no diagram. The dim + its a11y listbox marking + the live-region
 * announcement carry the state for SR users (WCAG 1.4.1 — never colour/dim alone).
 */
function IsolateControl({
  canvas: ctx,
  api,
}: {
  canvas: SelectionCanvasContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const mainButtonRef = useRef<HTMLButtonElement>(null);
  const disabled = api.disabled;
  const modeLabel = ISOLATE_MODE_LABELS[ctx.isolateMode];
  return (
    <>
      <span className="inline-flex items-center">
        <button
          {...api.itemProps}
          ref={mainButtonRef}
          type="button"
          aria-pressed={ctx.isolateActive}
          aria-disabled={disabled || undefined}
          aria-label={ctx.isolateActive ? `Isolate logic path: ${modeLabel}` : 'Isolate logic path'}
          title={disabled ? (api.disabledReason ?? 'Isolate logic path') : 'Isolate logic path'}
          onClick={() => {
            // Primary affordance TOGGLES isolate (off → start in the current/last mode; on → exit),
            // so a pressed button exits rather than re-opening the menu (U1).
            if (!disabled) ctx.toggleIsolate();
          }}
          onKeyDown={(event) => {
            // Split-button keyboard equivalent: ArrowDown/Up (from the main button) opens the mode menu,
            // so keyboard users reach Full / Driving / Stop without a pointer on the chevron.
            if (!disabled && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              toggle();
            }
          }}
          className={cn(
            toolbarControlVariants({ active: ctx.isolateActive, disabled }),
            'rounded-r-none pr-1',
          )}
        >
          <Route aria-hidden="true" className="size-4" />
          <span className="truncate">
            {ctx.isolateActive ? `Isolating · ${modeLabel}` : 'Isolate'}
          </span>
        </button>
        <button
          ref={triggerRef}
          type="button"
          tabIndex={-1}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-disabled={disabled || undefined}
          aria-label={ISOLATE_OPTIONS_LABEL}
          title={ISOLATE_OPTIONS_LABEL}
          onClick={() => {
            if (!disabled) toggle();
          }}
          className={cn(toolbarControlVariants({ active: open, disabled }), 'rounded-l-none px-1')}
        >
          <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
        </button>
      </span>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Isolate logic path"
        restoreFocusRef={mainButtonRef}
      >
        <MenuSection label="Show the logic path" />
        <MenuItem
          selected={ctx.isolateActive && ctx.isolateMode === 'full'}
          onSelect={() => ctx.setIsolateMode('full')}
        >
          <Check
            aria-hidden="true"
            className={cn(
              'size-4',
              ctx.isolateActive && ctx.isolateMode === 'full' ? 'opacity-100' : 'opacity-0',
            )}
          />
          Full logic path
        </MenuItem>
        <MenuItem
          selected={ctx.isolateActive && ctx.isolateMode === 'driving'}
          onSelect={() => ctx.setIsolateMode('driving')}
        >
          <Check
            aria-hidden="true"
            className={cn(
              'size-4',
              ctx.isolateActive && ctx.isolateMode === 'driving' ? 'opacity-100' : 'opacity-0',
            )}
          />
          Driving path only
        </MenuItem>
        {ctx.isolateActive ? (
          <MenuItem onSelect={() => ctx.toggleIsolate()}>
            <span aria-hidden="true" className="size-4" />
            Stop isolating
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}

/**
 * The **Next-conflict status chip** (canvas nav, U2) — a compact, VISIBLE `role="status"` read-out
 * pinned beside the Next-conflict button that names the conflict being reviewed ("Conflict 2 of 5 ·
 * constraint conflict"), so a sighted planner gets the reason on screen (4 of the 5 flag types have no
 * on-canvas badge), not only in the polite announcement. Presentational (spreads `itemProps`, never a
 * roving-tabindex stop, mirrors the Project-finish chip); it renders nothing — and the registry item
 * hides — unless a conflict is being cycled (`ctx.currentConflict != null`, i.e. not while isolating /
 * before the first press / with no conflicts / flag-off). The reason truncates at narrow widths; the
 * full reason list is in the `title`. `goToNextConflict` keeps speaking the full polite announcement,
 * so this doubles as its visible half rather than replacing it.
 */
/**
 * The **find read-out** (`VITE_CANVAS_SEARCH_NAV`) — how many activities the live search matches, and
 * which one the planner is standing on.
 *
 * Modelled on {@link CurrentConflictStatus} down to the `aria-hidden`, and for the same reason: the
 * spoken channel is the shared polite announcer `goToMatch` already writes to, so a second live region
 * here would say "Match 3 of 12" twice to a screen-reader user and once to nobody else. This is the
 * visible half only.
 *
 * Two states, and the difference matters: **"12 matches"** before the first Enter (the planner has
 * typed and wants to know whether it was worth pressing), **"3 of 12"** after (they are walking them).
 * Collapsing the two into one would make the read-out say a position the planner has not reached.
 */

/**
 * The selection object-actions, expressed as toolbar items over {@link SelectionActionContext}. Order:
 * Logic → (Progress) → (Resources) → (Steps) → Edit → Delete. Labels use the activities-table's
 * vocabulary — **Logic / Edit / Delete** (wording convergence) — so the same operation reads the same
 * on the canvas and in the table. The **Progress**, **Resources** and **Steps** items are entry-route
 * additions (`VITE_ENTRY_ROUTES`): each is spread into the array conditionally so flag-off is
 * byte-for-byte the prior three-item bar. Progress is role-gated (Contributor+, `canReportProgress`);
 * Resources additionally rides `VITE_RESOURCES` (matching the table's row action) and is otherwise
 * ungated (view-ish; the dialog gates writes); Steps additionally rides `VITE_EARNED_VALUE` +
 * `VITE_ACTIVITY_STEPS` and hides for a duration-derived selection — matching the table's Steps row
 * action. None of the three is pen-gated (only Edit/Delete are).
 *
 * Every item pins `showLabel: 'always'` — this is a compact floating bar of five actions where the
 * name **is** the affordance, so a label is not something to trade away for width. Every item is also
 * `tier: 1`, but that is now a separate statement (TECH_DEBT #61): it says "demote these last", not
 * "label these". The two used to be the same property, and this file's own comment used to gloss
 * `tier: 1` as "(visible labels)" — which is precisely the conflation the split removed.
 *
 * The tier trade-off stands: under extreme narrow width the primitive demotes trailing items
 * (Edit/Delete) to overflow before the newer ones — accepted, since this floating bar rarely
 * overflows and surfacing the new actions is the goal.
 */
export const selectionActionItems: ToolbarItem<SelectionBarContext>[] =
  defineToolbar<SelectionBarContext>([
    {
      id: 'open-logic',
      group: 'object',
      tier: 1,
      showLabel: 'always',
      order: 0,
      label: 'Logic',
      icon: <Waypoints className="size-4" />,
      onActivate: (ctx) => ctx.onOpenLogic(),
    },
    ...(ENTRY_ROUTES_ENABLED
      ? [
          {
            id: 'progress',
            group: 'object',
            tier: 1,
            showLabel: 'always',
            order: 1,
            label: 'Report progress',
            icon: <ClipboardCheck className="size-4" />,
            // Role-gated, NOT pen-gated — progress is a Contributor action (the notes/progress
            // precedent), mirroring the toolbar's Update-progress command's `canProgress` gate.
            isEnabled: (ctx: SelectionActionContext) => ctx.canReportProgress,
            disabledReason: (ctx: SelectionActionContext) =>
              ctx.canReportProgress ? undefined : PROGRESS_REASON,
            onActivate: (ctx: SelectionActionContext) => ctx.onProgress(),
          } satisfies ToolbarItem<SelectionActionContext>,
        ]
      : []),
    // Resources rides BOTH the entry-route flag AND `VITE_RESOURCES` (the resource surface), matching the
    // activities-table row action's gate + the Steps item's multi-flag precedent.
    ...(ENTRY_ROUTES_ENABLED && RESOURCES_ENABLED
      ? [
          {
            id: 'resources',
            group: 'object',
            tier: 1,
            showLabel: 'always',
            order: 2,
            label: 'Resources',
            icon: <Users className="size-4" />,
            onActivate: (ctx: SelectionActionContext) => ctx.onResources(),
          } satisfies ToolbarItem<SelectionActionContext>,
        ]
      : []),
    ...(ENTRY_ROUTES_ENABLED && EARNED_VALUE_ENABLED && ACTIVITY_STEPS_ENABLED
      ? [
          {
            id: 'steps',
            group: 'object',
            tier: 1,
            showLabel: 'always',
            order: 3,
            label: 'Steps',
            icon: <ListChecks className="size-4" />,
            // Writer authoring surface, hidden for a duration-derived selection — matching the table's
            // `canWrite && !isDurationDerivedType(...)` row-action gate (present-or-absent, not shaded).
            isVisible: (ctx: SelectionActionContext) => ctx.canEditSchedule && ctx.stepsEligible,
            onActivate: (ctx: SelectionActionContext) => ctx.onSteps(),
          } satisfies ToolbarItem<SelectionActionContext>,
        ]
      : []),
    {
      id: 'edit',
      group: 'object',
      tier: 1,
      showLabel: 'always',
      order: 4,
      label: 'Edit',
      icon: <SquarePen className="size-4" />,
      penGated: true,
      disabledReason: (ctx) => ctx.scheduleRefusal(PEN_ACTION) ?? undefined,
      onActivate: (ctx) => ctx.onEdit(),
    },
    // Duplicate — after Edit, and present for EVERY selection including a summary.
    //
    // It read `isVisible: (ctx) => !ctx.isSummary` until the M5 enablement pass, with a comment
    // saying "copying a band with its subtree is M2" — M2 whose model, tests and measurement had
    // all shipped, and whose only missing piece was this line. Three independent reviews found the
    // capability unreachable and its unit tests validating dead code. A summary now gets the action
    // under its own name, which is what US-1's acceptance criterion always said.
    //
    // TWO items on inverse `isSummary` predicates, which is this bar's established shape (Dissolve
    // and Delete already do exactly that) rather than one item that branches. `ToolbarItem.label` is
    // a plain string — only `icon` takes a context function, and deliberately so — so a single item
    // could not rename itself without widening a shared primitive for one caller.
    ...(ACTIVITY_COPY_PASTE_ENABLED
      ? [
          {
            id: 'duplicate',
            group: 'object',
            tier: 1,
            showLabel: 'always',
            order: 4.5,
            label: 'Duplicate',
            icon: <Copy className="size-4" />,
            penGated: true,
            disabledReason: (ctx) => ctx.scheduleRefusal(PEN_ACTION) ?? undefined,
            isVisible: (ctx: SelectionActionContext) => !ctx.isSummary,
            onActivate: (ctx: SelectionActionContext) => {
              ctx.onDuplicate();
            },
          } satisfies ToolbarItem<SelectionActionContext>,
          {
            id: 'duplicate-band',
            group: 'object',
            tier: 1,
            showLabel: 'always',
            order: 4.5,
            label: 'Duplicate band',
            description: 'Copies the summary and every activity in it',
            icon: <Copy className="size-4" />,
            penGated: true,
            disabledReason: (ctx) => ctx.scheduleRefusal(PEN_ACTION) ?? undefined,
            isVisible: (ctx: SelectionActionContext) => ctx.isSummary,
            onActivate: (ctx: SelectionActionContext) => {
              ctx.onDuplicateBand();
            },
          } satisfies ToolbarItem<SelectionActionContext>,
        ]
      : []),
    // Dissolve — only for a summary selection, and only behind `VITE_WBS_IMPROVEMENTS`. Registered
    // BEFORE Delete for the same reason the table's row menu orders them that way: the two are
    // neighbours in intent ("get rid of this grouping") and opposites in effect, so the
    // non-destructive one must be visible at the moment the destructive one is being chosen.
    ...(WBS_IMPROVEMENTS_ENABLED
      ? [
          {
            id: 'dissolve',
            group: 'object',
            tier: 1,
            showLabel: 'always',
            order: 5,
            label: 'Dissolve',
            icon: <Ungroup className="size-4" />,
            penGated: true,
            disabledReason: (ctx) => ctx.scheduleRefusal(PEN_ACTION) ?? undefined,
            // Registered for every selection but only VISIBLE on a summary: `isSummary` is a
            // context fact, so a non-summary selection cannot reach an action that would 422.
            isVisible: (ctx: SelectionActionContext) => ctx.isSummary,
            onActivate: (ctx: SelectionActionContext) => ctx.onDissolve(),
          } satisfies ToolbarItem<SelectionActionContext>,
        ]
      : []),
    {
      id: 'delete',
      group: 'object',
      tier: 1,
      showLabel: 'always',
      order: 6,
      label: 'Delete',
      icon: <Trash2 className="size-4" />,
      penGated: true,
      disabledReason: (ctx) => ctx.scheduleRefusal(PEN_ACTION) ?? undefined,
      onActivate: (ctx) => ctx.onDelete(),
    },
    // ---------------------------------------------------------------- canvas commands (M2-T1)
    //
    // A separate `find` group, so the primitive draws its rule between "what to do with this
    // activity" and "how to look at it". None is pen-gated: looking is not editing, and none of the
    // three writes anything.
    //
    // `showLabel: 'always'` matches the object actions above rather than the Row-1 registrations
    // these replace, and the reason is the surface: this is a compact bar of a handful of commands
    // where the name IS the affordance, not a 25-item row rationing width (`selectionActionItems`'
    // own docblock). It is also why they are `tier: 1` — demote last.
    // ---------------------------------------------------------------- canvas commands (M2-T1)
    //
    // A separate `find` group, so the primitive draws its rule between "what to do with this
    // activity" and "how to look at it". Neither is pen-gated: looking is not editing.
    //
    // `showLabel: 'always'` matches the object actions above rather than the Row-1 registrations
    // these replace, and the reason is the surface: this is a compact bar of a handful of commands
    // where the name IS the affordance, not a 25-item row rationing width. Same for `tier: 1`.
    //
    // Both stay behind the flags their Row-1 originals carried, so flag-off is byte-for-byte the
    // pre-M2 surface on BOTH surfaces. Their Row-1 "Coming soon" placeholders are deliberately NOT
    // reproduced: a placeholder earns its place on a persistent row a planner scans, and this is a
    // transient contextual bar of live actions where an inert row is noise.
    ...(CANVAS_SEARCH_NAV_ENABLED
      ? [
          {
            id: 'zoom-to-selection',
            group: 'find',
            tier: 1,
            showLabel: 'always',
            order: 7,
            label: 'Zoom to',
            icon: <Crosshair className="size-4" />,
            isVisible: (ctx: SelectionBarContext) => ctx.canvas !== null,
            onActivate: (ctx: SelectionBarContext) => ctx.canvas?.zoomToSelection(),
          } satisfies ToolbarItem<SelectionBarContext>,
        ]
      : []),
    ...(CANVAS_NAV_ENABLED
      ? [
          {
            id: 'isolate-logic',
            group: 'find',
            tier: 1,
            showLabel: 'always',
            order: 8,
            label: 'Isolate logic path',
            icon: <Route className="size-4" />,
            isVisible: (ctx: SelectionBarContext) => ctx.canvas !== null,
            isActive: (ctx: SelectionBarContext) => ctx.canvas?.isolateActive ?? false,
            // `isVisible` above is the narrowing: an item that is not visible is not rendered, so
            // `canvas` cannot be null here. The fallback is unreachable rather than defensive, and
            // it is an empty fragment rather than a non-null assertion so a future change to
            // `isVisible` degrades to nothing instead of throwing on a live surface.
            render: (ctx: SelectionBarContext, api: ToolbarItemRenderApi) =>
              ctx.canvas ? <IsolateControl canvas={ctx.canvas} api={api} /> : <></>,
          } satisfies ToolbarItem<SelectionBarContext>,
        ]
      : []),
  ]);

/** Where to float the bar — the selection's viewport geometry (top edge + horizontal centre). */
export interface SelectionAnchor {
  /** The selected bar's top edge (viewport px) — the bar floats just above it. */
  top: number;
  /** The selected bar's horizontal centre (viewport px). */
  centerX: number;
}

/** Bar height reserve used to place it above the selection (falls below if there's no room above). */
const BAR_OFFSET = 44;
/** Below this much viewport headroom above the selection, the bar flips to sit below it instead. */
const TOP_CLEARANCE_PX = 8;
/** Keep the bar this far inside the left/right viewport edges. */
const EDGE_MARGIN_PX = 8;

/**
 * The **floating selection-actions toolbar** (ADR-0031, Fork-2 default). When an activity is
 * selected it appears just above the selected bar with its object actions, so they're where the
 * user's attention already is and the main toolbar stays stable. It is a normal `role="toolbar"`
 * (roving tabindex, pen-gated set); it does **not** auto-focus, so the canvas's parallel listbox
 * keeps its `aria-activedescendant` — the user Tabs to it when they want it. It is rendered inline
 * (not portaled) so it stays **DOM-adjacent to the listbox** for a sane Tab order; `position: fixed`
 * still lifts it out of the canvas's `overflow-hidden` (no transformed ancestor to trap it).
 *
 * Position tracks the canvas imperatively: the canvas writes the selection's live viewport geometry
 * to `anchorRef` every frame (ADR-0026 D3 — no per-frame React state), and this bar reads it on its
 * own rAF to move + clamp itself, so it follows pan/zoom without re-rendering the toolbar. Its own
 * loop may trail the canvas write by up to one frame — an accepted trade-off for keeping the toolbar
 * content stable (don't "fix" it into a shared loop). When the anchor is `null` (nothing drawn there,
 * or the canvas is off-screen) the bar hides itself; if it held focus at that moment (or when it
 * unmounts on deselect), it hands focus back via `restoreFocusRef` so keyboard focus is never
 * stranded on `<body>`. Pass `context = null` (nothing selected) to render nothing at all.
 *
 * **Known trade-off:** floating just above the selection overlays the region directly above it — on a
 * dense diagram that can cover the activity in the lane above for as long as the selection is active.
 * Accepted for now as a contextual, transient overlay (TECH_DEBT #31; a future lane-aware / side
 * placement is the fast-follow).
 */
export function SelectionActionsBar({
  anchorRef,
  context,
  restoreFocus,
}: {
  anchorRef: React.RefObject<SelectionAnchor | null>;
  context: SelectionBarContext | null;
  /** Called when the bar hides / unmounts **while it holds focus**, to hand focus back (e.g. to the
   * canvas listbox) so keyboard focus is never stranded on `<body>`. Should be referentially stable. */
  restoreFocus?: () => void;
}): React.ReactElement | null {
  const barRef = useRef<HTMLDivElement>(null);

  // Follow the canvas by reading the anchor ref each frame and moving + clamping the node — never
  // re-rendering the toolbar (its content only changes when the selection does). Runs only while
  // something is selected (keyed on `context`), and stops on deselect/unmount. On the hide/unmount
  // transition, if the bar holds focus, hand it back so keyboard focus isn't dropped to <body>.
  useEffect(() => {
    if (!context) return;
    let raf = 0;
    // Last applied state, so identical frames write no DOM (the anchor only moves on pan/zoom/resize
    // /selection-change — most frames of a held selection are idle). Positioning uses `transform`
    // (compositor-only), never `top`/`left`, so a move never triggers layout.
    let lastX = NaN;
    let lastY = NaN;
    let hidden = true;
    const restoreIfFocused = (): void => {
      const el = barRef.current;
      if (el && el.contains(document.activeElement)) restoreFocus?.();
    };
    const place = (): void => {
      raf = requestAnimationFrame(place);
      const el = barRef.current;
      if (!el) return;
      const anchor = anchorRef.current;
      if (!anchor) {
        if (!hidden) {
          hidden = true;
          restoreIfFocused(); // hide would blur us onto <body> — redirect first
          el.style.visibility = 'hidden';
        }
        return;
      }
      // Vertical: prefer above the selection; if it would clip the top, drop below the bar.
      const above = anchor.top - BAR_OFFSET;
      const top = above < TOP_CLEARANCE_PX ? anchor.top + 28 : above;
      // Horizontal: centre on the selection, but keep the whole bar on-screen.
      const half = el.offsetWidth / 2;
      const min = EDGE_MARGIN_PX + half;
      const max = globalThis.innerWidth - EDGE_MARGIN_PX - half;
      const centerX =
        max >= min ? Math.min(Math.max(anchor.centerX, min), max) : globalThis.innerWidth / 2;
      if (hidden) {
        el.style.visibility = 'visible';
        hidden = false;
      }
      if (centerX !== lastX || top !== lastY) {
        lastX = centerX;
        lastY = top;
        // `-50%` centres the bar on centerX; the px pair does the actual placement — all compositor.
        el.style.transform = `translate(${centerX}px, ${top}px) translateX(-50%)`;
      }
    };
    place();
    return () => {
      cancelAnimationFrame(raf);
      restoreIfFocused(); // unmounting (deselect / last activity deleted) — don't strand focus
    };
  }, [context, anchorRef, restoreFocus]);

  if (!context) return null;

  return (
    <div
      ref={barRef}
      // Start hidden so it never flashes at (0,0) before the first `place()` positions it.
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        transform: 'translateX(-50%)',
        visibility: 'hidden',
      }}
      className="border-border bg-popover z-40 rounded-md border p-1 shadow-md"
    >
      <Toolbar
        items={selectionActionItems}
        context={context}
        label={`Actions for ${context.targetName}`}
        groupLabels={{ object: 'Activity actions' }}
        authoringEnabled={context.canEditSchedule}
      />
    </div>
  );
}
