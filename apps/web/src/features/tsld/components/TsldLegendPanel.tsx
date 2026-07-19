import { GripVertical, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { LegendPanelPosition } from '../toolbar/use-legend-panel-prefs';

import { TsldLegend, type LensLegendInfo } from './TsldLegend';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TsldLegendPanelProps {
  open: boolean;
  /** Committed drag position (top-left px within the canvas region), or `null` for the default corner. */
  position: LegendPanelPosition | null;
  onClose: () => void;
  onPositionChange: (position: LegendPanelPosition) => void;
  /** The active-lens legend key (insight lenses, `docs/specs/canvas-lenses/`, flag-on) — the Colour-by
   * mode's bands + the baseline-overlay entry. Absent ⇒ today's default key. */
  lens?: LensLegendInfo;
}

/**
 * The **floating, draggable Legend panel** overlaid on the TSLD canvas (ADR-0031 amendment) — the
 * canvas-first home for the diagram key. The toolbar's Legend control toggles it; here it renders as a
 * small card the planner can drag anywhere within the canvas region and pin (its open state + position
 * persist via {@link useLegendPanelPrefs}). It sits over the canvas rather than in a toolbar popover so
 * the key stays visible while reading the diagram (and is a natural seam for the future print area).
 *
 * Positioning: absolute within the (relative) canvas region. With no saved position it sits in the
 * bottom-left corner; once dragged it uses committed top-left pixels, **re-clamped to the live region**
 * on mount and whenever the region resizes (the layout swaps panes below `md`, the activities panel
 * expands), so a shrunk viewport can never strand the panel off-screen behind the region's
 * `overflow-hidden`. Dragging is a pointer enhancement — the panel is fully readable and closable by
 * keyboard without it (repositioning is cosmetic, not an essential function).
 */
export function TsldLegendPanel({
  open,
  position,
  onClose,
  onPositionChange,
  lens,
}: TsldLegendPanelProps): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null,
  );
  // While dragging we render from live pointer coords; on release the final position is committed to
  // the persisted prefs. `null` means "sit in the default corner" (no inline offset yet).
  const [drag, setDrag] = useState<LegendPanelPosition | null>(null);
  // Drives only the grab/grabbing cursor — kept in state (not read off the ref during render).
  const [grabbing, setGrabbing] = useState(false);
  // The control that opened the panel (the Row-1 Legend toggle), captured so closing via the panel's
  // own Hide button returns focus there instead of dropping it to <body> (WCAG 2.4.3 focus order).
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
  }, [open]);
  const handleClose = useCallback((): void => {
    const opener = openerRef.current;
    onClose();
    opener?.focus();
  }, [onClose]);

  // Re-clamp a committed position against the live region on mount and on region resize, so it can't
  // sit outside the (overflow-hidden) canvas area after the layout shrinks. `null` (default corner) is
  // always in-bounds, so nothing to do. Correcting via `onPositionChange` persists the fixed value.
  useEffect(() => {
    if (!open || !position) return;
    const panel = panelRef.current;
    const parent = panel?.offsetParent as HTMLElement | null;
    if (!panel || !parent) return;
    const clamp = (): void => {
      const parentRect = parent.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const x = Math.min(Math.max(0, parentRect.width - panelRect.width), Math.max(0, position.x));
      const y = Math.min(
        Math.max(0, parentRect.height - panelRect.height),
        Math.max(0, position.y),
      );
      if (x !== position.x || y !== position.y) onPositionChange({ x, y });
    };
    clamp();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(clamp);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [open, position, onPositionChange]);

  if (!open) return null;

  const active = drag ?? position;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    // Left button only, and never start a drag from the close button.
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const panel = panelRef.current;
    const parent = panel?.offsetParent as HTMLElement | null;
    if (!panel || !parent) return;
    const panelRect = panel.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    dragOrigin.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: panelRect.left - parentRect.left,
      y: panelRect.top - parentRect.top,
    };
    setGrabbing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const origin = dragOrigin.current;
    const panel = panelRef.current;
    const parent = panel?.offsetParent as HTMLElement | null;
    if (!origin || !panel || !parent) return;
    const parentRect = parent.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const maxX = Math.max(0, parentRect.width - panelRect.width);
    const maxY = Math.max(0, parentRect.height - panelRect.height);
    const x = Math.min(maxX, Math.max(0, origin.x + (event.clientX - origin.pointerX)));
    const y = Math.min(maxY, Math.max(0, origin.y + (event.clientY - origin.pointerY)));
    setDrag({ x, y });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragOrigin.current) return;
    dragOrigin.current = null;
    setGrabbing(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag) {
      onPositionChange(drag);
      setDrag(null);
    }
  };

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label="Diagram legend"
      className={cn(
        'bg-popover text-popover-foreground border-border absolute z-10 flex max-w-64 min-w-44 flex-col rounded-md border shadow-md',
        active ? null : 'bottom-3 left-3',
      )}
      style={active ? { left: active.x, top: active.y } : undefined}
    >
      {/* Drag handle + title + close. `touch-none` so a touch-drag doesn't scroll the canvas. The
          pointer handlers are a cosmetic reposition enhancement only — the panel is fully readable and
          closable by keyboard without dragging (a11y review), so the handle is deliberately not a
          keyboard-operable control (no role/tabindex to overclaim). */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          'border-border flex touch-none items-center gap-1.5 border-b px-2 py-1.5',
          grabbing ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <GripVertical aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        <span className="text-sm font-medium">Legend</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClose}
          aria-label="Hide legend"
          className="text-muted-foreground ml-auto"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="px-2.5 py-2">
        <TsldLegend orientation="vertical" {...(lens ? { lens } : {})} />
      </div>
    </div>
  );
}
