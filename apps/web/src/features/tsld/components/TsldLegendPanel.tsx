import { GripVertical, X } from 'lucide-react';
import { useRef, useState } from 'react';

import type { LegendPanelPosition } from '../toolbar/use-legend-panel-prefs';

import { TsldLegend } from './TsldLegend';

import { cn } from '@/lib/utils';

/**
 * The **floating, draggable Legend panel** overlaid on the TSLD canvas (ADR-0031 amendment) — the
 * canvas-first home for the diagram key. The toolbar's Legend control toggles it; here it renders as a
 * small card the planner can drag anywhere within the canvas region and pin (its open state + position
 * persist via {@link useLegendPanelPrefs}). It sits over the canvas rather than in a toolbar popover so
 * the key stays visible while reading the diagram (and is a natural seam for the future print area).
 *
 * Positioning: absolute within the (relative) canvas region. With no saved position it sits in the
 * bottom-left corner; once dragged it uses committed top-left pixels, always re-clamped to the region.
 * Dragging is a pointer enhancement — the panel is fully readable and closable by keyboard without it
 * (repositioning is cosmetic, not an essential function).
 */
export function TsldLegendPanel({
  open,
  position,
  onClose,
  onPositionChange,
}: {
  open: boolean;
  position: LegendPanelPosition | null;
  onClose: () => void;
  onPositionChange: (position: LegendPanelPosition) => void;
}): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null,
  );
  // While dragging we render from live pointer coords; on release the final position is committed to
  // the persisted prefs. `null` means "sit in the default corner" (no inline offset yet).
  const [drag, setDrag] = useState<LegendPanelPosition | null>(null);
  // Drives only the grab/grabbing cursor — kept in state (not read off the ref during render).
  const [grabbing, setGrabbing] = useState(false);

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
        'bg-popover text-popover-foreground border-border absolute z-10 flex max-w-[16rem] min-w-[11rem] flex-col rounded-md border shadow-md',
        active ? null : 'bottom-3 left-3',
      )}
      style={active ? { left: active.x, top: active.y } : undefined}
    >
      {/* Drag handle + title + close. `touch-none` so a touch-drag doesn't scroll the canvas. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="border-border flex touch-none items-center gap-1.5 border-b px-2 py-1.5"
        style={{ cursor: grabbing ? 'grabbing' : 'grab' }}
      >
        <GripVertical aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        <span className="text-sm font-medium">Legend</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide legend"
          className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring ml-auto rounded-sm p-0.5 focus-visible:ring-2 focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="px-2.5 py-2">
        <TsldLegend orientation="vertical" />
      </div>
    </div>
  );
}
