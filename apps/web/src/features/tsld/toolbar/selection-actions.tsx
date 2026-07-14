import { SquarePen, Trash2, Waypoints } from 'lucide-react';
import { useEffect, useRef } from 'react';

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
  context: SelectionActionContext | null;
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
