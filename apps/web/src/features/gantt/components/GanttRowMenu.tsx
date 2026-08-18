import { MoreHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Menu, MenuItem } from '@/components/ui/menu';
import {
  selectionActionItems,
  type SelectionBarContext,
} from '@/features/plan-actions/selection-actions';

/**
 * **The Gantt row's context menu — the dock's own roster, rendered as a menu.**
 *
 * M5-T3, and the whole point is that it is **derived, not restated**. ADR-0093 removed a duplicated
 * `Report progress` between the command surface and the dock, and built a structural gate comparing
 * those two registries — then recorded its own hole in writing: the gate compares **two** rosters,
 * so a **third** copy would be invisible to it. A hand-written list here is that third copy, and
 * would drift in the way that decision spent a milestone removing.
 *
 * So the items come from `selectionActionItems`, filtered by the same `isVisible(canvas: null)`
 * predicate the coverage gate uses to decide what the Gantt can reach. `selection-duplication`
 * gains an assertion that this file holds no roster of its own, verified red against a planted one.
 *
 * **Shading, not omitting** (ADR-0082). An item shut by a state the reader can change keeps its
 * place and carries `disabledReason` — that ADR's load-bearing change was making `Menu`'s roving
 * focus reach a shaded item at all, so its reason is readable by keyboard. An item the OBJECT
 * cannot do (`isVisible` false) is absent instead, which is the same split the dock makes.
 */

export interface GanttRowMenuProps {
  /**
   * The bar context — the same object the dock is handed — built **on open**, not per render.
   *
   * A thunk rather than a value: `buildSelectionBarContext` does an `activities.find` over the whole
   * plan, and this component is rendered once per mounted row. Passing a built object made that an
   * O(plan) scan per row on every render, and the M6 performance gate measured it firing 40 times
   * per keystroke on a 2,000-activity plan. The menu needs it only when it opens, so it is only
   * built then — which removes the cost rather than making it cheaper.
   */
  context: () => SelectionBarContext | null;
  /** The row this menu belongs to, for the accessible name. */
  activityName: string;
  /**
   * The grid's own structure gestures (ADR-0095 M5-T4/T5), or absent.
   *
   * **Not in `selectionActionItems`, and that is deliberate rather than an oversight.** Indent,
   * Outdent and Insert are gestures about a row's place in a GRID; the canvas expresses the same
   * hierarchy as a band that ADR-0063 made select-only, precisely because a summary's dates are an
   * engine rollup with nothing to drag. Putting them in the shared roster would offer three
   * controls on a surface that cannot honour them.
   *
   * `selection-duplication.structural.test.ts` still holds: it forbids this file naming an action
   * the SHARED registry owns, which these are not. The gate keeps its teeth against a third copy of
   * `Report progress`; it was never a ban on a view having gestures of its own.
   */
  structure?: GanttRowStructureActions | undefined;
}

/** One grid gesture: what it does, and why it cannot (ADR-0082 — shaded with a reason, never gone). */
export interface GanttRowStructureAction {
  run: () => void;
  /** Null when it can run; otherwise the sentence a planner can act on. */
  refusal: string | null;
}

export interface GanttRowStructureActions {
  indent: GanttRowStructureAction;
  outdent: GanttRowStructureAction;
  /**
   * Absent while M5-T5 is unbuilt — and absent means **not rendered**, never a shaded "Insert
   * activity below" whose reason is that nobody has written it yet. A control that exists to
   * explain its own absence is the lit-but-inert shape this register keeps recording; a capability
   * that is not there yet is simply not offered.
   */
  insert?: GanttRowStructureAction | undefined;
  /** Whether these are pen-gated writes at all — false shades all three with the pen's own reason. */
  canEditSchedule: boolean;
  penRefusal: string | null;
}

export function GanttRowMenu({
  context,
  activityName,
  structure,
}: GanttRowMenuProps): React.ReactElement {
  // `Menu` anchors at a VIEWPORT POINT, not at an element — it clamps x/y to stay on screen, which
  // an element ref cannot express. Read from the trigger at open time rather than held in state, so
  // a row scrolled between two opens anchors where it now is.
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [resolved, setResolved] = useState<SelectionBarContext | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = anchor !== null && resolved !== null;

  // The same classification the coverage gate makes: an item gated on the canvas is not reachable
  // here, and the two canvas-only actions answer false with `canvas: null`.
  const items =
    resolved === null
      ? []
      : selectionActionItems.filter((item) =>
          item.isVisible ? item.isVisible(resolved, { layout: 'comfortable' }) : true,
        );

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon-sm"
        // **`tabIndex={-1}`, and that is the whole point of a roving tab stop.**
        //
        // This is rendered once per MOUNTED row, so without it every visible row contributes its
        // own tab stop and Tab traversal stops at ~40 menu buttons instead of leaving the widget —
        // undoing the single roving stop the rest of `GanttPanel` works to preserve. Both existing
        // copies of this exact control set it explicitly for the same reason
        // (`HierarchyTree.tsx:400-406`, `ActivitiesTable.tsx:771-786`); this one did not, which the
        // M6 component gate caught. Keyboard users reach the same actions through the row's own
        // selection, which opens the docked bar.
        tabIndex={-1}
        // Named for its subject, so a screen-reader user moving through rows hears which activity
        // each menu belongs to rather than forty identical "Actions" buttons.
        aria-label={`Actions for ${activityName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          // The row itself selects on click; a menu press must not also change the selection out
          // from under the planner — the same reason the cell's Enter stops propagating.
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setResolved(context());
          setAnchor({ x: rect.left, y: rect.bottom });
        }}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </Button>

      <Menu
        open={open}
        onClose={() => {
          setAnchor(null);
          setResolved(null);
        }}
        anchor={anchor ?? { x: 0, y: 0 }}
        label={`Actions for ${activityName}`}
        restoreFocusRef={triggerRef}
      >
        {items.map((item) => {
          // **`penGated` as well as `isEnabled`, and that distinction was a real defect.**
          //
          // The registry expresses pen-gating as a FLAG the `Toolbar` primitive resolves centrally
          // — "the primitive disables every `penGated` item together when authoring is not
          // enabled" — and `SelectionActionsBar` feeds it `authoringEnabled={canEditSchedule}`.
          // This menu read only `isEnabled`, so every pen-gated action (Edit, Delete, Duplicate,
          // Dissolve…) rendered LIVE for a planner who does not hold the pen, and clicking one
          // would have run its handler before the API refused it.
          //
          // Found by the first test written against this component, which the M6 test-engineering
          // gate demanded because the surface had none — and which `coverage.structural.test.ts`
          // structurally could not demand, since it matches labels the docked bar already drives.
          const ctx = resolved;
          if (ctx === null) return null;
          const penShut = item.penGated === true && !ctx.canEditSchedule;
          const enabled = (item.isEnabled ? item.isEnabled(ctx) : true) && !penShut;
          const reason = item.disabledReason?.(ctx) ?? null;
          return (
            <MenuItem
              key={item.id}
              disabled={!enabled}
              {...(reason === null ? {} : { disabledReason: reason })}
              onSelect={() => {
                setAnchor(null);
                setResolved(null);
                item.onActivate?.(ctx);
              }}
            >
              {item.label}
            </MenuItem>
          );
        })}
        {structure === undefined
          ? null
          : STRUCTURE_ITEMS.map(({ id, label, pick }) => {
              const action = pick(structure);
              if (action === undefined) return null;
              // The pen first, then the gesture's own reason — a planner without the pen is told
              // that, not "there is no summary above this row", which would be true and useless.
              const refusal = !structure.canEditSchedule
                ? (structure.penRefusal ?? 'You are not editing this plan.')
                : action.refusal;
              return (
                <MenuItem
                  key={id}
                  disabled={refusal !== null}
                  {...(refusal === null ? {} : { disabledReason: refusal })}
                  onSelect={() => {
                    setAnchor(null);
                    setResolved(null);
                    action.run();
                  }}
                >
                  {label}
                </MenuItem>
              );
            })}
      </Menu>
    </>
  );
}

/**
 * The grid gestures, in the order a planner reads them: the two that move a row within the
 * hierarchy, then the one that adds to it.
 *
 * A module constant rather than three inline blocks, so the pen rule and the refusal precedence are
 * written once — the "one correct pattern applied to a control and not its neighbour" shape this
 * register keeps recording.
 */
const STRUCTURE_ITEMS: ReadonlyArray<{
  id: string;
  label: string;
  pick: (s: GanttRowStructureActions) => GanttRowStructureAction | undefined;
}> = [
  { id: 'indent', label: 'Indent', pick: (s) => s.indent },
  { id: 'outdent', label: 'Outdent', pick: (s) => s.outdent },
  { id: 'insert', label: 'Insert activity below', pick: (s) => s.insert },
];
