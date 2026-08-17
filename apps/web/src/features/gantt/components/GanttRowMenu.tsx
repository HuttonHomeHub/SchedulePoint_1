import { useRef, useState } from 'react';

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
  /** The bar context — the same object the dock is handed, built by `buildSelectionBarContext`. */
  context: SelectionBarContext;
  /** The row this menu belongs to, for the accessible name. */
  activityName: string;
}

export function GanttRowMenu({ context, activityName }: GanttRowMenuProps): React.ReactElement {
  // `Menu` anchors at a VIEWPORT POINT, not at an element — it clamps x/y to stay on screen, which
  // an element ref cannot express. Read from the trigger at open time rather than held in state, so
  // a row scrolled between two opens anchors where it now is.
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = anchor !== null;

  // The same classification the coverage gate makes: an item gated on the canvas is not reachable
  // here, and the two canvas-only actions answer false with `canvas: null`.
  const items = selectionActionItems.filter((item) =>
    item.isVisible ? item.isVisible(context, { layout: 'comfortable' }) : true,
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // Named for its subject, so a screen-reader user moving through rows hears which activity
        // each menu belongs to rather than twenty identical "Actions" buttons.
        aria-label={`Actions for ${activityName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded px-1 focus-visible:ring-2 focus-visible:outline-none"
        onClick={(event) => {
          // The row itself selects on click; a menu press must not also change the selection out
          // from under the planner — the same reason the cell's Enter stops propagating.
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ x: rect.left, y: rect.bottom });
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      <Menu
        open={open}
        onClose={() => setAnchor(null)}
        anchor={anchor ?? { x: 0, y: 0 }}
        label={`Actions for ${activityName}`}
        restoreFocusRef={triggerRef}
      >
        {items.map((item) => {
          const enabled = item.isEnabled ? item.isEnabled(context) : true;
          const reason = item.disabledReason?.(context) ?? null;
          return (
            <MenuItem
              key={item.id}
              disabled={!enabled}
              {...(reason === null ? {} : { disabledReason: reason })}
              onSelect={() => {
                setAnchor(null);
                item.onActivate?.(context);
              }}
            >
              {item.label}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
