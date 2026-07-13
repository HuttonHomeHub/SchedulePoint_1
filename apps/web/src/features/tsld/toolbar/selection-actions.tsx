import { Pin, SquarePen, Trash2, Waypoints } from 'lucide-react';
import { createPortal } from 'react-dom';

import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import { defineToolbar, type ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';

/**
 * The context for the **floating selection-actions** bar (ADR-0031, Fork-2 default): the commands
 * that act on the currently-selected activity. Read actions (open logic) are always available;
 * mutating actions (edit / set constraint / delete) are pen-gated as a set via `canEditSchedule`.
 */
export interface SelectionActionContext {
  /** The selected activity's display name — for the bar's accessible name + action labels. */
  targetName: string;
  /** Whether schedule edits are allowed now (role + pen); gates the mutating actions. */
  canEditSchedule: boolean;
  onOpenLogic: () => void;
  onEdit: () => void;
  onSetConstraint: () => void;
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
      id: 'set-constraint',
      group: 'object',
      tier: 1,
      order: 2,
      label: 'Set constraint',
      icon: <Pin className="size-4" />,
      penGated: true,
      disabledReason: () => PEN_REASON,
      onActivate: (ctx) => ctx.onSetConstraint(),
    },
    {
      id: 'delete',
      group: 'object',
      tier: 1,
      order: 3,
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
 * parallel listbox keeps its `aria-activedescendant` — the user Tabs to it when they want it. Pass
 * `ctx = null` (nothing selected) to render nothing.
 */
export function SelectionActionsBar({
  anchor,
  ctx,
}: {
  anchor: SelectionAnchor | null;
  ctx: SelectionActionContext | null;
}): React.ReactElement | null {
  if (!anchor || !ctx) return null;

  // Prefer above the selection; if it would clip the top, drop below the bar.
  const above = anchor.top - BAR_OFFSET;
  const top = above < 8 ? anchor.top + 28 : above;

  return createPortal(
    <div
      style={{ position: 'fixed', top, left: anchor.centerX, transform: 'translateX(-50%)' }}
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
