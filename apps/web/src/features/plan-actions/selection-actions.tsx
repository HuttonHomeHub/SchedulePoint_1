import {
  Check,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Crosshair,
  Eraser,
  Route,
  SquarePen,
  StickyNote,
  Trash2,
  TriangleAlert,
  Ungroup,
  Users,
  Waypoints,
} from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';

import { CONFLICT_REMEDIES } from './conflict-remedy';

import { Menu, MenuItem, MenuSection, useMenuTrigger } from '@/components/ui/menu';
import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import {
  defineToolbar,
  type ToolbarItem,
  type ToolbarItemRenderApi,
} from '@/components/ui/toolbar/toolbar-registry';
import {
  TOOLBAR_CARET_TARGET,
  toolbarCardVariants,
  toolbarControlVariants,
} from '@/components/ui/toolbar/toolbar-styles';
import {
  ACTIVITY_COPY_PASTE_ENABLED,
  CANVAS_NAV_ENABLED,
  CANVAS_SEARCH_NAV_ENABLED,
  ENTRY_ROUTES_ENABLED,
  NOTES_ENABLED,
  RESOURCES_ENABLED,
  SCHEDULING_MODES_ENABLED,
  TOOLBAR_QUICK_WINS_ENABLED,
  WBS_IMPROVEMENTS_ENABLED,
} from '@/config/env';
import type { BulkActionGate } from '@/features/tsld/components/BulkSelectionBar';
import type { ConflictKey } from '@/features/tsld/render/conflicts';
import type { LogicPathMode } from '@/features/tsld/render/logic-path';
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
  /**
   * Whether the viewer may write notes (Contributor upward) — gates the `notes` item.
   *
   * Deliberately a **separate** right from {@link canEditSchedule}: ADR-0046 does not pen-gate
   * notes, so a Contributor annotates a plan somebody else is editing.
   */
  canWriteNotes: boolean;
  /**
   * The selection is a `WBS_SUMMARY` — the only kind of activity that can be dissolved. A context
   * fact rather than a check inside the handler, so a non-summary selection cannot reach an action
   * the server would 422.
   */
  isSummary: boolean;
  /**
   * The conflict the selected activity leads with, or `null` when it is not flagged (ADR-0094 M4).
   *
   * Derived by the host from `CONFLICT_FLAGS` against the activity itself — the same single source
   * the count and the filter run — rather than read off the Next-conflict cursor. So the remedy is
   * offered whether a planner arrived by cycling or simply clicked the bar, which is what a remedy
   * attached to the OBJECT means (ADR-0093's discriminator).
   */
  conflictKey: ConflictKey | null;
  /** Whether clearing a hand-placed placement is actionable now, and why not — from the shared
   * `clearVisualPlacementGate`, so this and the command surface cannot drift. The SAME
   * `BulkActionGate` type the plural bar uses, imported rather than re-typed: a third structurally
   * identical gate object is how two of them end up disagreeing about what `reason: null` means. */
  clearPlacement: BulkActionGate;
  /**
   * Whether `Clear visual start` **exists for this plan** — `clearVisualPlacementApplies`, computed
   * once by the host from the same input as `clearPlacement` above, never re-derived here.
   *
   * ADR-0082's omit-vs-shade line: in Early mode there is no hand-placed start to clear, so the
   * control is omitted rather than shaded. Measured, that is also 154 px of a row whose wrap costs
   * the diagram 36 px at 1646 — see `docs/specs/workspace-foot-and-deck/m0-measurement.md`.
   */
  clearPlacementApplies: boolean;
  /** Withdraw the selected activity's hand-placed `visualStart`. */
  onClearVisualPlacement: () => void;
  /** Open the activity editor where a conflict actually lives. Opaque on purpose: `features/tsld`
   * must not import `ActivityEditorPurpose` from `features/activities` (§5/§12), so the composition
   * root maps this the way it already maps the bar's other editor callbacks. */
  onOpenEditorAt: (at: 'constraint' | 'resources') => void;
  onOpenLogic: () => void;
  /** Open the selected activity's **Notes** tab (ADR-0062 gave notes a tab of their own). */
  onNotes: () => void;
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
// The same sentence `add-note` used on the command surface, kept verbatim so a planner who learnt
// the refusal there meets the identical wording here (`docs/specs/object-bar-defects/` M2).
const NOTES_REASON = 'You don’t have permission to add notes';

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
          // `TOOLBAR_CARET_TARGET` — the 24 px floor §2.5.8 requires. This caret is the **third**
          // copy of the split-button affordance (`docs/TECH_DEBT.md` #76 asked for an extraction and
          // got two consumers, not three), and at `px-1` around a `size-3.5` chevron it measured
          // 22 px. **The fit gate DOES see it now** — this comment claimed the selection bar was
          // out of that gate's scope by decision (#124) while the same commit widened the sweep to
          // cover this bar (`e2e-workspace-fit/command-surface.spec.ts`, "every object action a
          // pointer can see, it can also reach"). Corrected rather than deleted, because the
          // constant is still what holds the floor and the gate is what proves it.
          className={cn(
            toolbarControlVariants({ active: open, disabled }),
            'rounded-l-none px-1',
            TOOLBAR_CARET_TARGET,
          )}
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
 * The conflict remedy, rendered from {@link CONFLICT_REMEDIES} (ADR-0094 M4).
 *
 * A `render` item rather than a plain button because its **label is data**: the map decides both the
 * copy and what activating it does, and `ToolbarItem.label` is a static string. That is the same
 * constraint that kept the conflict COUNT off the Next-conflict button — but the answer differs, and
 * for a reason worth stating. There, a variable-width label on a demotable button would have
 * re-run the width ladder on every click. Here the bar is a short, transient, non-demoting strip, so
 * a `render` item costs it nothing.
 *
 * **It renders only the `openEditorAt` remedies, and that is a decision rather than a gap.** The
 * third remedy — clearing a hand-placed `visualStart` — is an action the bar already carries in its
 * own right (M4-T1 moved it here from the command surface), available to every activity in Visual
 * mode whether or not it is flagged. Rendering a conflict-flavoured twin beside it would be
 * ADR-0093's defect reproduced inside one surface, one day after removing it between two.
 *
 * **Not pen-gated, and not shaded.** Both routes only OPEN the editor, which is a read; the editor
 * itself gates every write it offers (ADR-0060's per-scope save). Shading the route would leave a
 * Viewer looking at a flagged bar with no way to see what is wrong with it — which is the dead end
 * ADR-0082 exists to prevent, not an application of it.
 */
function ConflictRemedyControl({
  ctx,
  api,
}: {
  ctx: SelectionActionContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement | null {
  const key = ctx.conflictKey;
  // `barAction` renders nothing: that remedy is an item the bar already carries, and a second copy
  // of it would be ADR-0093's defect inside one surface. `isVisible` on the registry item says the
  // same thing, so this is a belt-and-braces guard rather than the rule's only home — and it is the
  // reason `conflict-remedy.structural.test.ts` asserts every `barAction.itemId` resolves to a real
  // registered item. A pointer into a registry is only as good as the id being right.
  if (!key) return null;
  const remedy = CONFLICT_REMEDIES[key];
  if (remedy.kind !== 'openEditorAt') return null;
  return (
    <button
      // `api.itemProps` already carries the focusable marker for a non-presentational render item;
      // repeating it was harmless duplication the accessibility gate asked to remove.
      {...api.itemProps}
      type="button"
      onClick={() => ctx.onOpenEditorAt(remedy.at)}
      className={cn(toolbarControlVariants({}), 'gap-1.5')}
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{remedy.label}</span>
    </button>
  );
}

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
    // ── The conflict remedy (ADR-0094 M4) ───────────────────────────────────────────────────
    //
    // **Deliberately NOT gated on `VITE_CANVAS_NAV`**, which gates the Next-conflict cycle and its
    // count. The flag governs a way of FINDING a flagged activity; the flag on the activity is the
    // engine's and is real whether or not that navigation exists. A planner who reaches a conflicted
    // bar by clicking it, or by the Has-conflict filter, should be offered the remedy — gating it
    // would make the fix reachable only through one route to the problem. Said here because the
    // component gate asked whether it was an oversight, and every other flag interaction in these
    // registries is annotated.
    //
    // FIRST, and conditional: it is present only when the selected activity is actually flagged, and
    // when it is, it is the reason a planner is looking at this bar at all. Everything after it is
    // what you can do to any activity; this is what is wrong with THIS one.
    //
    // One item, not one per conflict type. The `label` a `ToolbarItem` carries is a plain string, so
    // three types would otherwise mean three registrations differing only in copy — and the registry
    // has a precedent both ways (`duplicate`/`duplicate-band` are two items on inverse predicates).
    // Here the types are mutually exclusive by construction (`leadingConflictKey` returns one), so
    // one item reading its label from the remedy map keeps the map the single source rather than
    // spreading it across three registry entries that could each drift.
    {
      id: 'conflict-remedy',
      group: 'object',
      tier: 1,
      showLabel: 'always',
      order: -1,
      // A placeholder: the live label comes from the remedy map via `render`. `defineToolbar`
      // rejects an empty label, and the overflow menu reads `item.label` directly.
      label: 'Fix this conflict',
      icon: <TriangleAlert className="size-4" />,
      // Visible only for a conflict whose remedy is a ROUTE. A `barAction` remedy is already on the
      // bar as its own item, so registering a second control for it would duplicate it — and an
      // item that renders `null` while claiming a roving stop is worse than one that is absent.
      isVisible: (ctx) =>
        ctx.conflictKey !== null && CONFLICT_REMEDIES[ctx.conflictKey].kind === 'openEditorAt',
      render: (ctx, api) => <ConflictRemedyControl ctx={ctx} api={api} />,
    },
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
    /**
     * **Notes — moved here from the command surface** (`docs/specs/object-bar-defects/` M2).
     *
     * It lived on the command deck as `Add note`, and the Gantt hid it there on the stated ground
     * that "the object bar is docked in the Gantt with a correctly-labelled route". **There was no
     * such route**: this bar had no notes item, `Logic` opens the Logic tab, and the Gantt row menu
     * mirrors this roster — so a planner working in the Gantt could not reach an activity's notes
     * at all. The reasoning described a replacement that did not exist.
     *
     * It belongs here rather than in both places. `add-note`'s `isEnabled` consulted the selection,
     * which is ADR-0093's discriminator verbatim: an action whose subject is the selected object
     * belongs on the object's surface. That ADR deleted `Report progress` from the command surface
     * for exactly this, so adding a second copy here would have re-created the defect it removed —
     * and `selection-duplication.structural.test.ts` could not have caught it, because it compares
     * ids and labels and `add-note`/"Add note" collides with neither `notes` nor "Notes".
     *
     * **Not pen-gated** (ADR-0046 — notes are a Contributor action, like progress), so it takes the
     * role gate alone. The reason puts the permanent condition BEFORE the transient one, which is
     * the wording `add-note` arrived at: a reader without the right is told that, not misleadingly
     * told to select something first.
     *
     * Sits next to `Logic` because that is where a planner last reached it — `Add note` opened the
     * Logic panel and scrolled to a Notes section until ADR-0062 gave notes a tab.
     */
    ...(NOTES_ENABLED
      ? [
          {
            id: 'notes',
            group: 'object',
            tier: 1,
            showLabel: 'always',
            order: 0.5,
            label: 'Notes',
            description: 'Add or read notes on this activity.',
            srDescription: () => 'Add or read notes on this activity.',
            icon: <StickyNote className="size-4" />,
            isEnabled: (ctx: SelectionActionContext) => ctx.canWriteNotes,
            disabledReason: (ctx: SelectionActionContext) =>
              ctx.canWriteNotes ? undefined : NOTES_REASON,
            onActivate: (ctx: SelectionActionContext) => ctx.onNotes(),
          } satisfies ToolbarItem<SelectionActionContext>,
        ]
      : []),
    ...(ENTRY_ROUTES_ENABLED
      ? [
          {
            id: 'progress',
            group: 'object',
            tier: 1,
            showLabel: 'always',
            order: 1,
            /**
             * **`Progress`, not `Report progress`, and renamed on BOTH surfaces in one commit.**
             *
             * The UX review declined this shortening on a specific ground rather than a stylistic
             * one: `:423-425` requires this bar's labels to match the activities table's, "so the
             * same operation reads the same on the canvas and in the table", and renaming here
             * alone would have split that vocabulary across three surfaces and left the fourth.
             * `ActivitiesTable.tsx` moved with it, which answers the objection instead of
             * overriding it.
             *
             * It is here because it is worth a LINE: measured, the row was 32 px from fitting on
             * one line at 1920 and this is 46 (`docs/specs/foot-row/m0-measurement.md`). A bare
             * noun beside `Logic` / `Resources` / `Steps` also reads consistently — those are the
             * same editor's tabs — and the verb survives below for anyone whose only channel is the
             * accessible name.
             *
             * **It survives on `srDescription`, and `description` alone would NOT have carried it.**
             * This first shipped with `description` only, whose docblock says in as many words that
             * it is "appended to the native hover `title`" (`toolbar-registry.ts:298-303`) — so the
             * verb reached a sighted mouse user hovering, and nobody else: not a screen-reader user,
             * not a sighted keyboard user, which is precisely the audience the sentence above
             * claimed to be covering. `srDescription` is the `aria-describedby` channel
             * (`toolbar-registry.ts:342-362`). Both are set, because the two audiences are
             * different and neither is served by the other's mechanism. The gate this fell through
             * is the one `ToolbarSplitButton.tsx:47-52` records having caught four times.
             */
            label: 'Progress',
            description: 'Report progress on this activity.',
            srDescription: () => 'Report progress on this activity.',
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
    /*
     * **`Steps` was here and is gone** (`docs/specs/object-bar-defects/` M1).
     *
     * It opened the SAME dialog on the SAME tab as `Progress`: `openActivityEditor` maps
     * `progress → { tab: 'progress' }` and `steps → { tab: 'progress', focusSteps: true }`, and
     * `focusSteps` feeds one prop — `autoFocusHeading` on the steps panel. Two controls differing
     * only in scroll position, with the same subject, permission and effect, which is ADR-0093's
     * discriminator failing inside one surface rather than between two.
     *
     * It was also the only item on this bar that HID rather than shaded without the pen, while
     * `Edit`, `Duplicate` and `Delete` beside it shade with a reason (ADR-0082). Shading it would
     * have fixed what a planner sees and kept what caused it.
     *
     * `focusSteps` and the `'steps'` purpose deliberately REMAIN: they are how the Progress tab
     * knows to land focus on the steps panel, and deleting a mapping to remove a button is a wider
     * change than the defect needs.
     */
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
    // ── Clear visual start — MOVED here from the command surface (ADR-0094 M4-T1) ──────────
    //
    // Its `isEnabled` consulted `ctx.selectedActivity`, which is ADR-0093's discriminator verbatim:
    // an action whose subject is the selected object belongs on the object's surface. It was one of
    // the four selection-consulting command-surface items that ADR-0093 enumerated and left alone,
    // because at the time only `update-progress` had a twin. This epic gives it one — the
    // `visualConflict` remedy IS this action — so rather than duplicate it, it moves.
    //
    // `selection-duplication.structural.test.ts` was verified RED against the two-copy state before
    // the command-surface item was deleted: the gate covers this by construction, which was the
    // whole point of deriving both rosters from the registries rather than listing them.
    //
    // Order 6.5 — after Delete, so it demotes to the `⋯` FIRST under width pressure. It is the
    // rarest action on the bar and the only one that is inert outside Visual mode.
    ...(SCHEDULING_MODES_ENABLED && TOOLBAR_QUICK_WINS_ENABLED
      ? [
          {
            id: 'clear-visual-placement',
            group: 'object' as const,
            tier: 1 as const,
            showLabel: 'always' as const,
            order: 6.5,
            label: 'Clear visual start',
            // **Omitted outside Visual mode, not shaded** (foot-row-and-deck M1). ADR-0082's own
            // discriminator: the action does not APPLY to a plan scheduled Early, so there is
            // nothing for a reason sentence to say beyond "this does not exist here". It was the
            // only permanently-shaded control on the bar, and at 146 px the second-widest of the
            // ten — measured, omitting it is a necessary half of the fix for a wrap that costs the
            // diagram 36 px at 1646 (and it is NOT sufficient: `m0-candidates.spec.ts` shows the
            // bar still wraps at 819.4 px against 775.6 px available).
            isVisible: (ctx: SelectionActionContext) => ctx.clearPlacementApplies,
            /**
             * **A `TriangleAlert` when this IS the conflict's remedy, an `Eraser` otherwise.**
             *
             * The ux gate's blocking finding, and it is the epic's own purpose failing on its
             * commonest conflict type. The two route remedies render first, ahead of Logic, with a
             * conflict icon; this one sits last, after Delete, with a neutral icon — so a planner
             * who pressed Next conflict, read "visual placement conflict" and landed on the bar had
             * to hunt nine controls for the one that answers it. The `barAction` decision (do not
             * render a twin) is right and stays; what it left out was any signal at all.
             *
             * The icon rather than the position, because `order` is static and a per-context order
             * would re-run the width ladder as the selection changes — moving controls under the
             * planner's cursor, which is exactly what kept the count off the `next-conflict` label.
             * `icon` already takes a ctx form for precisely this kind of state.
             */
            icon: (ctx: SelectionActionContext) =>
              ctx.conflictKey === 'visualConflict' ? (
                <TriangleAlert className="size-4" />
              ) : (
                <Eraser className="size-4" />
              ),
            penGated: true,
            // The shared `clearVisualPlacementGate`'s verdict, computed once by the host and passed
            // in — never re-derived here. Two independent copies of a four-condition ladder is how
            // the count and the filter came to disagree about the word "conflict" in the first place.
            isEnabled: (ctx: SelectionActionContext) => ctx.clearPlacement.enabled,
            disabledReason: (ctx: SelectionActionContext) => ctx.clearPlacement.reason ?? undefined,
            onActivate: (ctx: SelectionActionContext) => ctx.onClearVisualPlacement(),
          },
        ]
      : []),
    // ---------------------------------------------------------------- canvas commands (M2-T1)
    //
    // A separate `find` group, so the primitive draws its rule between "what to do with this
    // activity" and "how to look at it". Neither is pen-gated: looking is not editing.
    //
    // `showLabel: 'always'` matches the object actions above rather than the Row-1 registrations
    // these replace, and the reason is the surface: this is a compact bar of a handful of commands
    // where the name IS the affordance, not a 25-item row rationing width. Same for `tier: 1`.
    //
    // **This paragraph was here TWICE**, in near-identical copies, and the deleted one still said
    // "none of the three" after `float-paths` left. A comment that disagrees with its neighbour
    // about how many items it governs is the drift class this repository keeps filing, and it was
    // sitting in the block being edited.
    //
    // **`zoom-to-selection` KEEPS its label, and the round trip is worth recording.** M1 made it
    // `showLabel: 'never'`: at ten items the bar needed 1037.4 px against 775.6 px at 1646, so it
    // wrapped and the diagram paid 36 px, and dropping this one label plus omitting
    // `clear-visual-placement` was the measured fix.
    //
    // **M4 then widened the container by 231 px and nobody re-asked.** Bounding the plan's facts
    // handed that width to the dock, so the arithmetic M1 chose against no longer held — the
    // architecture review caught it, and it is the ADR-0113 rule (re-verify the PROBLEM, not only
    // the design) applied inside one epic. Re-measured with the label restored: **41 px in both
    // states at 1920 AND 1646**, the two widths the product owner actually uses, and 77 px at 1440
    // with a selection. They chose the label, with that cost stated.
    //
    // So the surface rule this file states one paragraph up survives intact: every item on this
    // bar carries its name, because the name IS the affordance here. `Deck.tsx`'s `ICON_ONLY` set
    // exists for glyphs a stranger cannot guess wrong, and a crosshair is not one of them.
    //
    // Moving these two to the command deck instead was approved and then **withdrawn on its own
    // measurement**: the deck goes two lines → three at 1646, costing 58 px to save 36. See
    // `docs/specs/workspace-foot-and-deck/m0-measurement.md`.
    //
    // **Two things a future reader will reach for, and neither works here.**
    //
    // `showLabel: { atLeast: 'comfortable' }` — the band form (ADR-0091 D3a) — is **inert on this
    // bar**. `Toolbar.tsx` pins `layout: 'comfortable'` and then resolves the policy as
    // `(showLabel ?? 'auto') !== 'never'`, so an object literal is never equal to `'never'` and
    // labels unconditionally. The docked selection bar sits outside any band by design
    // (`toolbar-band.tsx`), so a width-conditional label here would read as conditional and not be
    // one. `'never'` is the only lever that exists.
    //
    // And this is **not** a reversal of ADR-0114 D7, which declined to shorten this item's label
    // text on WCAG 2.4.6 grounds. The accessible name is unchanged — `ToolbarButton` pins it to
    // `aria-label` exactly when the visible label is withheld. Only the painted text goes.
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
            // 'Zoom to selection', not the shorter 'Zoom to' this first shipped with. The bar is
            // named "Actions for <activity>", so in context the short form reads fine — but an
            // accessible name has to stand on its own in a screen reader's control list, where
            // "Zoom to" is a sentence with its object missing (WCAG 2.4.6). The e2e journey caught
            // it, which no unit test could: the suite was rewritten alongside the rename.
            label: 'Zoom to selection',
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

/**
 * The **selection-actions toolbar** (ADR-0031, Fork-2) — the object actions for the selected
 * activity, in the reserved chrome **below** the scene beside the plural bar, never over it.
 *
 * It used to float, positioned each frame just above the selected bar so the actions were where
 * the planner's attention already was. The product owner reported the consequence directly: "when i
 * select an activity the bar that appears above it on the canvas gets in the way and obscures some
 * other activities and view." That was never a surprise — `docs/TECH_DEBT.md` #31 recorded it as a
 * known trade-off from the day it shipped, with "a lane-aware / side placement" as the fast-follow.
 * The fast-follow that was actually chosen is simpler than either: **stop overlaying the scene.**
 * ADR-0064 had already settled the same question for the mode statement ("reserved chrome, never an
 * overlay") and ADR-0080 for the plural bar; this is the singular case joining them, so the
 * workspace stops shipping two answers and giving the worse one to the commoner case.
 *
 * Removing the float removes an entire mechanism, not just a style: the per-frame `requestAnimation
 * Frame` placement loop, its clamping arithmetic, the `visibility: hidden` first-paint guard, and
 * the canvas's per-frame `selectionAnchorRef` write all go with it. The bar now re-renders only
 * when the selection changes, which it always did — the loop existed solely to move the node.
 *
 * It stays a normal `role="toolbar"` (roving tabindex, pen-gated set) rendered inline, DOM-adjacent
 * to the listbox for a sane Tab order, and it still does **not** auto-focus, so the canvas's
 * parallel listbox keeps its `aria-activedescendant` — the planner Tabs to it when they want it.
 * `restoreFocus` still fires on unmount (deselect, or the last activity deleted) so focus is never
 * stranded on `<body>`; it no longer has a "hidden while still mounted" state to guard, because
 * there is no longer anything that can hide it. Pass `context = null` to render nothing at all.
 */
export function SelectionActionsBar({
  context,
  restoreFocus,
}: {
  context: SelectionBarContext | null;
  /** Called when the bar unmounts **while it holds focus**, to hand focus back (e.g. to the canvas
   * listbox) so keyboard focus is never stranded on `<body>`. Should be referentially stable. */
  restoreFocus?: () => void;
}): React.ReactElement | null {
  // Losing the bar — on deselect, or when the last activity is deleted — would blur whatever inside
  // it held focus onto `<body>`, which silently disables the workspace accelerators: the exact WCAG
  // 2.4.3 failure ADR-0080's journey found for the bulk delete. So hand focus back first.
  //
  // **Three things about this are the regression test's doing rather than the author's.**
  //
  // First, `context` must be in the dependency array. Deselecting does not unmount this component —
  // the host renders it whenever `showDiagram && selectionActionsWired`, which does not change — it
  // passes `context: null`, and the `if (!context) return null` below removes the div on an ordinary
  // re-render. A cleanup keyed only on the referentially-stable `restoreFocus` runs solely on a true
  // unmount that ordinary interaction never causes. The rAF loop this replaced had `context` in its
  // deps and was therefore correct by accident; the dependency went out with the loop.
  //
  // Second, that is necessary and NOT sufficient, which is what the test proved: by the time either
  // a passive or a layout cleanup runs, React has already detached the ref, so the element handle is
  // `null` and the DOM question "did this bar hold focus?" has no answer left. Both attempts stayed
  // red against a fix that reads correct.
  //
  // So the answer is not a DOM read at all: focus-held is **tracked as it happens**, and the
  // cleanup consults a boolean. `onBlur` clears it only for a real move to another element — when
  // the bar is being removed the browser blurs it with no related target, which is exactly the case
  // the cleanup must still see as "we had focus". The `activeElement` guard then makes the handoff
  // conditional on focus having actually been dropped, so a planner who moved on themselves is
  // never yanked back.
  const heldFocusRef = useRef(false);
  useLayoutEffect(
    () => () => {
      if (!heldFocusRef.current) return;
      heldFocusRef.current = false;
      const active = document.activeElement;
      if (active === null || active === document.body) restoreFocus?.();
    },
    [context, restoreFocus],
  );

  if (!context) return null;

  return (
    <div
      onFocus={() => {
        heldFocusRef.current = true;
      }}
      onBlur={(event) => {
        // Only a real move to another element clears it. When the bar is being REMOVED the browser
        // blurs it with no related target, and that is exactly the case the cleanup must still see
        // as "we had focus".
        const next = event.relatedTarget as Node | null;
        if (next !== null && !event.currentTarget.contains(next)) heldFocusRef.current = false;
      }}
      // **It has a card now, and the invariant this comment used to assert is not gone — it is a
      // variant.** It read: "No border, padding or radius: docked, the ROW is the container, and a
      // bar that brings its own box makes the row 6 px taller than the 36 px it already occupied —
      // measured, and the reason the journey's 'costs the canvas no height' assertion is an
      // equality rather than a bound."
      //
      // That measurement still holds, and measuring three candidates proved it holds harder than
      // it reads. The deck's own geometry took this row from ONE line to two at 1920 — its `px-2`
      // consumed exactly the 15 px of margin M3 had left — and dropping the padding still cost a
      // line at 1646, where the content sits at the container width and a 2 px border is enough to
      // wrap it. So what is shared is the background and the radius, which cost nothing; the border
      // and the padding belong to `boxed`. See `toolbarCardVariants` for the table.
      //
      // The rewrite is deliberate: a comment asserting an invariant the code no longer honours is
      // the defect class this repository keeps recording, and deleting it would have lost the
      // number that turned out to decide the design.
      //
      // **`min-w-0`, never `shrink-0` — this line was the clipping defect.** `Toolbar` wraps
      // unconditionally (`Toolbar.tsx:181-189`) and the dock outlet is `flex min-w-0 flex-1
      // flex-wrap` (`canvas-dock.tsx:104`), but a `shrink-0` item between them takes `max-content`
      // and never shrinks — so the outlet's width was never imposed on this wrapper and the
      // wrapping toolbar inside was never asked to break a line. The surplus painted past the row
      // and was clipped by the workspace body's `overflow-hidden`, putting `Clear visual placement`
      // off-screen at 1920 and `Edit`/`Duplicate`/`Delete` with it at 1646 — pointer-unreachable.
      // Measured both ways in `docs/specs/foot-row/m0-measurement.md` §C1b: content 1753 px against
      // containers of 1619 and 1345 before, exactly the container width after.
      //
      // **NOT "keyboard-reachable because focus scrolls it into view", which is what this comment
      // said until §C1d measured it.** Focusing a clipped control moved its rect by zero — the clip
      // is an ancestor's `overflow-hidden` and there is no scrollable ancestor to move. It shipped
      // unreported because nothing LOOKED wrong: the row simply ended, and a control that is not
      // painted looks exactly like a control that does not exist.
      //
      // **That cost is now zero, and this paragraph was wrong twice before it was stale.** It said
      // the row "wraps to 77 px at 1920 and 117 px at 1646" — the two figures belong to 1646 and
      // 1440, and 1920 never wrapped at all. ADR-0115 then removed the wrap entirely: measured, the
      // foot row is **41 px in both states at 1920, 1646 and 1440**, so a selection costs the canvas
      // nothing and `dock.spec.ts` asserts that as an equality rather than a bound.
      // The principle the sentence carried still holds and is worth keeping: a row that is too tall
      // is a trade; a row that hides a command is not.
      className={cn(toolbarCardVariants({ chrome: 'bare' }), 'min-w-0 items-center')}
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
