import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { dayAtScreenX, screenXOfDay, worldExtent, type RenderActivity } from '../render/geometry';
import { minimapViewport, type MinimapBox, type MinimapMapping } from '../render/minimap';
import { useNow } from '../render/use-now';
import { daysBetween } from '../render/working-time';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * **The minimap panel** (ADR-0100, minimap M2-T2): a fixed 200×120 picture of the whole
 * programme in the canvas container's bottom-right, with the live viewport as a DOM
 * rectangle on top.
 *
 * The split of responsibilities is the design (ADR-0100 decisions 1–2):
 *
 * - The **picture** is an `aria-hidden` canvas the HOST blits into from its existing rAF
 *   loop — rebuilt on scene change only (`minimapDirtyRef`), never per frame, never on
 *   selection, never at midnight. This component never draws it.
 * - The **rectangle** is a DOM node the host moves by one `style.transform` write per
 *   moved frame (no React render — ADR-0026 D3). Read-only in M2; M3 makes it draggable.
 * - The **selection marker** and the **Today vertical** are the two marks whose subjects
 *   move *without* the scene changing, so they are ordinary React-rendered DOM overlays
 *   here: the marker re-renders on the selection change that already re-renders the host,
 *   and Today re-renders on the existing `useNow(60_000)` tick — the ADR-0056 F6a
 *   instrument, so minimap-Today and canvas-Today go stale or stay fresh together.
 *
 * `role="group"` with a name — deliberately NOT `scrollbar`/`slider` (single-axis,
 * single-value contracts; this viewport is 2-D plus zoom) and NOT `application` (appears
 * nowhere in this codebase). The picture canvas is `aria-hidden` like every canvas layer;
 * the panel's operable content in M2 is the close button alone.
 */
export const MINIMAP_BOX: MinimapBox = { width: 200, height: 120 };

export interface TsldMinimapProps {
  activities: readonly RenderActivity[];
  dataDate: string;
  selectedId: string | null;
  /** Offset the panel above the resource strip when it is active — the minimap does NOT
   * inherit the Legend's over-the-strip liberty (M0-T3's recorded policy). */
  bottomOffsetPx: number;
  onClose: () => void;
  /** The host's refs: the picture canvas it blits into, and the rectangle it transforms. */
  bitmapCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  rectRef: React.RefObject<HTMLDivElement | null>;
  /** Where focus goes on × when the captured opener is unusable — the diagram's own keyboard
   * surface (the parallel listbox). See the close handler for why the opener alone is not enough. */
  dismissFocusRef?: React.RefObject<HTMLElement | null>;
  /** The host's one navigation commit (ADR-0100 M3): centre the scene on a world day/lane
   * (`null` leaves that axis). Returns the committed window for the announcement. */
  onCenterWorld?: (day: number | null, lane: number | null) => MinimapWindow | null;
  /** Page-pan by viewport pages — the group's arrow keys. Same return contract. */
  onPanPages?: (dx: number, dy: number) => MinimapWindow | null;
}

/** The visible window a navigation commit produced — what the announcement reads out. */
export interface MinimapWindow {
  startIso: string;
  endIso: string;
  laneFrom: number;
  laneTo: number;
}

export function TsldMinimap({
  activities,
  dataDate,
  selectedId,
  bottomOffsetPx,
  onClose,
  bitmapCanvasRef,
  rectRef,
  dismissFocusRef,
  onCenterWorld,
  onPanPages,
}: TsldMinimapProps): React.ReactElement {
  // The control that opened the panel, captured so the panel's own Hide button returns focus
  // there instead of dropping it to <body> — the TsldLegendPanel pattern, adopted because focus
  // dropped to <body> is the most repeated named a11y regression in this codebase (M2-T6 lists
  // five ADRs recording it). Toggle-off and responsive withdrawal need nothing here: the
  // dismissing control survives, so focus never moves.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
  }, []);
  const handleClose = (): void => {
    // The captured opener is unusable more often than the Legend's version admits: the panel
    // persists across reloads (localStorage), and on a reloaded page nothing was focused at
    // mount, so the capture is `<body>` — exactly the drop this handler exists to prevent. The
    // journey caught it (the component test's opener was always real). Fallback: the diagram's
    // own keyboard surface, which is where a planner dismissing the overview is standing anyway.
    const opener = openerRef.current;
    onClose();
    if (opener && opener !== document.body && opener.isConnected) opener.focus();
    else dismissFocusRef?.current?.focus();
  };
  // The mapping for the two React-rendered overlays. Deliberately derived here from the same
  // pure functions the host's bitmap build uses (one derivation each), on the renders those
  // overlays already need — an O(n) fold on an activities/selection change, never per frame.
  const mapping = useMemo<MinimapMapping | null>(() => {
    const extent = worldExtent(activities, dataDate);
    return extent === null ? null : minimapViewport(extent, MINIMAP_BOX);
  }, [activities, dataDate]);

  const selected =
    selectedId === null ? null : (activities.find((a) => a.id === selectedId) ?? null);

  // Today, on the minute tick the canvas's own Today marker uses (ADR-0056 F6b). `useNow`
  // returns a CADENCE counter, never a timestamp — its docblock says consumers re-derive the
  // wall clock per bump (the first draft read the counter AS epoch ms, and the component test
  // caught it: no Today line, ever). Derived at plain render scope like the workspace model's
  // `todayIso`, not inside a memo — the arithmetic is four operations, and memoising it would
  // mean calling the clock inside a memoised render, which the compiler lint refuses.
  useNow(60_000);
  const dayFloat = (new Date().getTime() - Date.parse(dataDate)) / 86_400_000;
  const todayAt = mapping === null ? null : screenXOfDay(dayFloat, mapping.view);
  const todayX = todayAt !== null && todayAt >= 0 && todayAt <= MINIMAP_BOX.width ? todayAt : null;

  const marker = useMemo(() => {
    if (mapping === null || selected === null || selected.earlyStart === null) return null;
    const x0 = screenXOfDay(daysBetween(dataDate, selected.earlyStart), mapping.view);
    const x1 =
      selected.earlyFinish === null
        ? x0
        : screenXOfDay(daysBetween(dataDate, selected.earlyFinish) + 1, mapping.view);
    // ≥3×3px (spec AC-2.3): a 1px echo of the bar is invisible at exactly the moment the
    // marker exists to answer "where is my selection in the whole plan?".
    return {
      x: x0,
      y: selected.laneIndex * mapping.pxPerLane,
      w: Math.max(3, x1 - x0),
      h: Math.max(3, mapping.pxPerLane),
    };
  }, [mapping, selected, dataDate]);

  // ── Navigation (M3): drag the rectangle, click to jump, keyboard on the group. ────────────
  // All three commit through the host's ONE `onCenterWorld`/`onPanPages` (the ADR-0065
  // one-function rule); the panel does no viewport arithmetic of its own beyond mapping its
  // box pixels to world coordinates through the same pure mapping the bitmap used.
  const announce = useAnnounce();
  const announceWindow = useCallback(
    (window: MinimapWindow | null): void => {
      if (window === null) return;
      announce(
        `Viewing ${formatCalendarDate(window.startIso)} to ${formatCalendarDate(window.endIso)}, lanes ${String(window.laneFrom + 1)}–${String(window.laneTo + 1)}.`,
      );
    },
    [announce],
  );
  // A held arrow key is a burst; announce the SETTLED window once (the useCoalescedNudge
  // shape, announcement-only). 400ms after the last keypress.
  const pendingAnnounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coalesceAnnounce = useCallback(
    (window: MinimapWindow | null): void => {
      if (window === null) return;
      if (pendingAnnounceRef.current !== null) clearTimeout(pendingAnnounceRef.current);
      pendingAnnounceRef.current = setTimeout(() => {
        pendingAnnounceRef.current = null;
        announceWindow(window);
      }, 400);
    },
    [announceWindow],
  );
  useEffect(
    () => () => {
      if (pendingAnnounceRef.current !== null) clearTimeout(pendingAnnounceRef.current);
    },
    [],
  );

  /** Box px → world (day, lane), through the same mapping the bitmap drew with. */
  const worldAt = useCallback(
    (boxX: number, boxY: number): { day: number; lane: number } | null => {
      if (mapping === null) return null;
      return {
        day: dayAtScreenX(boxX, mapping.view),
        lane: boxY / mapping.pxPerLane - 0.5,
      };
    },
    [mapping],
  );

  // The in-flight drag: the world point under the rectangle's centre at press (for Escape
  // restore), the pointer→centre offset (so the rectangle doesn't jump into the cursor), and
  // whether the pointer actually moved (a still press is not a drag).
  const dragRef = useRef<{
    pressWorld: { day: number; lane: number };
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // The Escape rung, innermost and IN-FLIGHT ONLY (M3-T4): mounted for the drag's lifetime,
  // removed at rest — so the minimap adds nothing to the ladder while no drag is running,
  // which is the "verified red both ways" contract. `preventDefault()` first, so outer rungs
  // (tool disarm, selection clear, drawer close) see the press was answered.
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      const drag = dragRef.current;
      dragRef.current = null;
      setDragging(false);
      if (drag) onCenterWorld?.(drag.pressWorld.day, drag.pressWorld.lane);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dragging, onCenterWorld]);

  const boxPoint = (event: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const host = (event.currentTarget as HTMLElement).closest('[data-minimap-surface]');
    const rect = (host as HTMLElement).getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPadPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || mapping === null) return;
    const rectEl = rectRef.current;
    if (!rectEl) return;
    const p = boxPoint(event);
    // The rectangle's current centre, read from the transform the host wrote last frame.
    const host = rectEl.parentElement?.getBoundingClientRect();
    const r = rectEl.getBoundingClientRect();
    if (!host) return;
    const centreX = r.left - host.left + r.width / 2;
    const centreY = r.top - host.top + r.height / 2;
    const pressWorld = worldAt(centreX, centreY);
    if (!pressWorld) return;
    dragRef.current = {
      pressWorld,
      offsetX: p.x - centreX,
      offsetY: p.y - centreY,
      moved: false,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  };

  const onPadPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = boxPoint(event);
    drag.moved = true;
    const world = worldAt(p.x - drag.offsetX, p.y - drag.offsetY);
    // Continuous gesture: commit, never announce (the house rule — drags are silent,
    // discrete jumps speak once).
    if (world) onCenterWorld?.(world.day, world.lane);
  };

  const endPadDrag = (): void => {
    if (dragRef.current === null) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current = null;
    setDragging(false);
    // One announcement on release of a real drag — the commit that sticks.
    if (wasDrag) announceWindow(onCenterWorld?.(null, null) ?? null);
  };

  const onSurfaceClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (mapping === null) return;
    const p = boxPoint(event);
    const world = worldAt(p.x, p.y);
    if (!world) return;
    // A discrete jump: one commit, one announcement.
    announceWindow(onCenterWorld?.(world.day, world.lane) ?? null);
  };

  const onGroupKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (mapping === null) return;
    let window: MinimapWindow | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        window = onPanPages?.(-1, 0) ?? null;
        break;
      case 'ArrowRight':
        window = onPanPages?.(1, 0) ?? null;
        break;
      case 'ArrowUp':
        window = onPanPages?.(0, -1) ?? null;
        break;
      case 'ArrowDown':
        window = onPanPages?.(0, 1) ?? null;
        break;
      case 'Home':
        // The plan's first dated day — the time axis only (M3-T3; the lane origin holds).
        announceWindow(onCenterWorld?.(dayAtScreenX(0, mapping.view), null) ?? null);
        event.preventDefault();
        return;
      case 'End':
        announceWindow(
          onCenterWorld?.(dayAtScreenX(MINIMAP_BOX.width, mapping.view), null) ?? null,
        );
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    // Arrow bursts coalesce to one settled announcement.
    coalesceAnnounce(window);
  };

  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions --
     Deliberate, and scoped to this return (the file ends with it) — the PanelResizer-separator
     precedent, where the linter's model and the design disagree and the design is written down:
     the GROUP carries tabIndex + onKeyDown because it IS the widget (the spec's keyboard
     contract lives on the named group; `scrollbar`/`slider` are single-axis single-value roles
     and `application` appears nowhere in this codebase, so there is no interactive role that
     fits a 2-D viewport). The SURFACE div's click is the pointer half of a contract whose
     keyboard half is the group's own onKeyDown one node up, and the PAD's pointer handlers are
     the drag gesture whose keyboard equivalent is the same contract — every pointer route here
     has a keyboard sibling, which is exactly what these rules exist to force. */
  return (
    <div
      role="group"
      aria-label="Diagram overview"
      data-testid="tsld-minimap"
      // Focusable so the keyboard contract has a home (M3-T3): every OTHER keyboard route to a
      // viewport position is anchored to an activity/match/date; this is the one unanchored one,
      // which is why it is not optional (WCAG 2.1.1). A distinct DOM node from the listbox's
      // selection cursor — nothing global is claimed.
      tabIndex={0}
      onKeyDown={onGroupKeyDown}
      className="border-border bg-canvas focus-visible:ring-ring absolute right-3 z-10 rounded-md border shadow-md focus-visible:ring-2 focus-visible:outline-none"
      style={{ bottom: 12 + bottomOffsetPx }}
    >
      <div className="flex items-center justify-between pl-2">
        <span className="text-muted-foreground text-xs">Overview</span>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Hide overview"
          className="text-muted-foreground"
          onClick={handleClose}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {mapping === null ? (
        // AC-1.4: no computed dates ⇒ say so; never an empty box that reads as breakage.
        <p className="text-muted-foreground px-3 pb-3 text-xs" style={{ width: MINIMAP_BOX.width }}>
          Nothing to show yet — no activity has calculated dates.
        </p>
      ) : (
        <div
          data-minimap-surface
          onClick={onSurfaceClick}
          className="relative cursor-pointer overflow-hidden"
          style={{ width: MINIMAP_BOX.width, height: MINIMAP_BOX.height }}
        >
          <canvas
            ref={bitmapCanvasRef}
            aria-hidden="true"
            data-testid="tsld-minimap-picture"
            className="block"
            style={{ width: MINIMAP_BOX.width, height: MINIMAP_BOX.height }}
          />
          {/* Selection marker — decoration beside the rectangle, like the picture beneath it. */}
          {marker !== null ? (
            <div
              aria-hidden="true"
              data-testid="tsld-minimap-selection"
              className="pointer-events-none absolute"
              style={{
                left: marker.x,
                top: marker.y,
                width: marker.w,
                height: marker.h,
                background: 'var(--color-canvas-minimap-frame)',
                outline: '1px solid var(--color-canvas-minimap-frame-halo)',
              }}
            />
          ) : null}
          {/* Today vertical — positioned on the same minute tick as the canvas Today marker. */}
          {todayX !== null ? (
            <div
              aria-hidden="true"
              data-testid="tsld-minimap-today"
              className="pointer-events-none absolute inset-y-0"
              style={{ left: todayX, width: 1, background: 'var(--color-destructive)' }}
            />
          ) : null}
          {/* The viewport rectangle: moved by the HOST's frame loop via style.transform. The
              two-tone frame pair is the WCAG 1.4.11 answer measured at M2-T1 — no single
              colour clears the ground and both bar inks, so the stroke holds the dark ground
              and the halo holds the bars. */}
          <div
            ref={rectRef}
            data-testid="tsld-minimap-rect"
            className="absolute top-0 left-0 will-change-transform"
            style={{
              border: '1px solid var(--color-canvas-minimap-frame)',
              outline: '1px solid var(--color-canvas-minimap-frame-halo)',
              outlineOffset: '-2px',
              boxSizing: 'border-box',
            }}
          >
            {/* The hit pad (M3-T6): at the Day preset on a long plan the true rectangle is ~4px
                wide — WCAG 2.5.8 wants 24×24 for the feature's primary gesture, exception or no
                exception; none of the three input reports covered this. Centred on the rectangle,
                never smaller than 24px per axis; stops propagation so a pad press is a drag,
                never a click-to-jump. */}
            <div
              data-testid="tsld-minimap-rect-pad"
              onPointerDown={onPadPointerDown}
              onPointerMove={onPadPointerMove}
              onPointerUp={endPadDrag}
              onPointerCancel={endPadDrag}
              onClick={(event) => {
                event.stopPropagation();
              }}
              className={dragging ? 'cursor-grabbing' : 'cursor-grab'}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100%',
                height: '100%',
                minWidth: 24,
                minHeight: 24,
                touchAction: 'none',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
