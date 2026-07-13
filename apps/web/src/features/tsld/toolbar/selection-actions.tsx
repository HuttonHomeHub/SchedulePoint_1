import { SquarePen, Trash2, Waypoints } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import { defineToolbar, type ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';

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
  onOpenLogic: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const PEN_REASON = 'Start editing to change this activity';

/** The selection object-actions, expressed as toolbar items over {@link SelectionActionContext}. */
export const selectionActionItems: ToolbarItem<SelectionActionContext>[] =
  defineToolbar<SelectionActionContext>([
    {
      id: 'open-logic',
      group: 'object',
      tier: 1,
      order: 0,
      label: 'Open logic',
      icon: <Waypoints className="size-4" />,
      onActivate: (ctx) => ctx.onOpenLogic(),
    },
    {
      id: 'edit',
      group: 'object',
      tier: 1,
      order: 1,
      label: 'Edit activity',
      icon: <SquarePen className="size-4" />,
      penGated: true,
      disabledReason: () => PEN_REASON,
      onActivate: (ctx) => ctx.onEdit(),
    },
    {
      id: 'delete',
      group: 'object',
      tier: 1,
      order: 2,
      label: 'Delete activity',
      icon: <Trash2 className="size-4" />,
      penGated: true,
      disabledReason: () => PEN_REASON,
      onActivate: (ctx) => ctx.onDelete(),
    },
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

/**
 * The **floating selection-actions toolbar** (ADR-0031, Fork-2 default). When an activity is
 * selected it appears just above the selected bar with its object actions, so they're where the
 * user's attention already is and the main toolbar stays stable. It is a normal `role="toolbar"`
 * (roving tabindex, pen-gated set) rendered in a portal; it does **not** auto-focus, so the canvas's
 * parallel listbox keeps its `aria-activedescendant` — the user Tabs to it when they want it.
 *
 * Position tracks the canvas imperatively: the canvas writes the selection's live viewport geometry
 * to `anchorRef` every frame (ADR-0026 D3 — no per-frame React state), and this bar reads it on its
 * own rAF to move the portal node, so it follows pan/zoom without re-rendering the toolbar. When the
 * anchor is `null` (nothing drawn there, or the canvas is off-screen) the bar hides itself. Pass
 * `ctx = null` (nothing selected) to render nothing at all.
 */
export function SelectionActionsBar({
  anchorRef,
  ctx,
}: {
  anchorRef: React.RefObject<SelectionAnchor | null>;
  ctx: SelectionActionContext | null;
}): React.ReactElement | null {
  const barRef = useRef<HTMLDivElement>(null);

  // Follow the canvas by reading the anchor ref each frame and moving the portal node — never
  // re-rendering the toolbar (its content only changes when the selection does). Runs only while
  // something is selected (the effect is keyed on `ctx`), and stops on deselect/unmount.
  useEffect(() => {
    if (!ctx) return;
    let raf = 0;
    const place = (): void => {
      raf = requestAnimationFrame(place);
      const el = barRef.current;
      if (!el) return;
      const anchor = anchorRef.current;
      if (!anchor) {
        // Selected but nothing to point at (scrolled off / hidden pane) — hide, but keep it mounted
        // so it reappears the moment the selection is back on-screen.
        if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
        return;
      }
      // Prefer above the selection; if it would clip the top, drop below the bar.
      const above = anchor.top - BAR_OFFSET;
      const top = above < 8 ? anchor.top + 28 : above;
      el.style.visibility = 'visible';
      el.style.top = `${top}px`;
      el.style.left = `${anchor.centerX}px`;
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [ctx, anchorRef]);

  if (!ctx) return null;

  return createPortal(
    <div
      ref={barRef}
      style={{ position: 'fixed', top: 0, left: 0, transform: 'translateX(-50%)' }}
      className="border-border bg-popover z-40 rounded-md border p-1 shadow-md"
    >
      <Toolbar
        items={selectionActionItems}
        context={ctx}
        label={`Actions for ${ctx.targetName}`}
        authoringEnabled={ctx.canEditSchedule}
      />
    </div>,
    document.body,
  );
}
