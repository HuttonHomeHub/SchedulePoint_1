import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  DESIGNED_BAND_HEIGHT_PX,
  SCALED_ATTRIBUTE,
  SCALE_ATTRIBUTE,
  WORKSPACE_WINDOW_INSET_HEIGHT_PX,
  computeWorkspaceScale,
  isBrowserZoomed,
  isTextEnlarged,
  requiredWorkspaceScale,
  supportsScaling,
  type WorkspaceBox,
} from './workspace-scale';
import { readActualSize, subscribeActualSize } from './workspace-scale-pref';

import { cn } from '@/lib/utils';

/**
 * **The plan workspace's scale: one provider, two wrappers** (ADR-0222 D2, D6).
 *
 * The scaled unit is not one element. The workspace root lives in `<main>`, and the command band is
 * portalled into the shell's second row and spans the Explorer's column too (M0 §1), so one wrapper
 * cannot hold both without moving the band into `<main>` and re-deciding the shell's grid. Instead:
 *
 * - {@link WorkspaceScaleProvider} owns the decision (the box, the guards, the floor, the pointer
 *   hold) and sits above both, in `PlanWorkspace`; React context crosses the portal.
 * - {@link WorkspaceScaleFrame} wraps the root inside `<main>`: a clip box that fills the grid cell,
 *   holding a wrapper laid out at box ÷ scale and drawn at scale.
 * - {@link WorkspaceScaleBand} wraps the band's `<section>` inside the portal the same way, sized from
 *   the slot's width.
 *
 * **Why the box the scale reads is the same however the band is scaled.** The grid gives the root
 * whatever the band's row leaves, so `root height + band height = window height - 51` at every scale:
 * shrinking the band hands the difference to the root. The calculation therefore needs no knowledge of
 * the band's height and cannot chase its own tail.
 *
 * At scale 1 the wrappers add no `transform`, no explicit size and no clipping, so the layout is the
 * one the workspace had before (SC-8). Both are size containers (`globals.css`: `workspace`,
 * `workspace-band`), which is what `ws-short` and `band-*` answer to (D5).
 */

export interface WorkspaceScaleState {
  /** The scale in force: 1 whenever a guard holds. */
  readonly scale: number;
  /** The window would scale if the reader had not chosen actual size, with no text or zoom guard. */
  readonly wouldScale: boolean;
  /** The reader chose actual size on this device. */
  readonly actualSize: boolean;
  /**
   * The window the workspace is laid out as if it were in: the band's layout width, and the root's
   * layout height plus what the shell takes at the designed size. `null` until measured, and outside a
   * workspace. `workspace-media.ts` answers size queries from it.
   */
  readonly window: WorkspaceBox | null;
  /** The frame's own box in layout px: what the scaled wrapper is sized from. */
  readonly frame: WorkspaceBox | null;
}

const OUTSIDE: WorkspaceScaleState = {
  scale: 1,
  wouldScale: false,
  actualSize: false,
  window: null,
  frame: null,
};

interface Registry {
  readonly reportFrame: (box: WorkspaceBox | null) => void;
  readonly reportBand: (box: WorkspaceBox | null) => void;
}

const StateContext = createContext<WorkspaceScaleState | null>(null);
const RegistryContext = createContext<Registry | null>(null);

/** The scale state around the caller, or the unscaled answer outside a plan workspace. */
export function useWorkspaceScale(): WorkspaceScaleState {
  return use(StateContext) ?? OUTSIDE;
}

/** Whether the caller is inside a plan workspace's provider. */
export function useInWorkspace(): boolean {
  return use(StateContext) !== null;
}

interface Environment {
  readonly textEnlarged: boolean;
  readonly zoomed: boolean;
}

function readEnvironment(): Environment {
  return { textEnlarged: isTextEnlarged(), zoomed: isBrowserZoomed() };
}

function sameBox(a: WorkspaceBox | null, b: WorkspaceBox | null): boolean {
  return a === b || (a !== null && b !== null && a.width === b.width && a.height === b.height);
}

/**
 * The scale frozen while a pointer button is down anywhere in the window, or `null` when none is. The
 * scale never changes under a held button: a transform that moves under a drag moves the thing being
 * dragged (ADR-0222 D2, the same rule as the viewport banner, ADR-0179 D4). A press that began elsewhere
 * counts, so the listeners are on the window in the capture phase. `current` is read at the press, which is
 * why it is a ref the caller keeps up to date.
 */
function usePointerHold(current: React.RefObject<number>): number | null {
  const [frozen, setFrozen] = useState<number | null>(null);
  useEffect(() => {
    const down = (): void => setFrozen((already) => already ?? current.current);
    const up = (event: PointerEvent): void => {
      if (event.buttons === 0) setFrozen(null);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [current]);
  return frozen;
}

export function WorkspaceScaleProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [supported] = useState(supportsScaling);
  const actualSize = useSyncExternalStore(subscribeActualSize, readActualSize, () => false);
  const [environment, setEnvironment] = useState<Environment>(readEnvironment);
  const [frame, setFrame] = useState<WorkspaceBox | null>(null);
  const [band, setBand] = useState<WorkspaceBox | null>(null);

  // Zoom and a text-size change fire no event of their own. A zoom resizes the window (`resize`);
  // a text-size setting changes nothing the page is told about, so the reader's return to the tab is
  // the other moment it can have changed.
  useEffect(() => {
    const refresh = (): void => {
      const next = readEnvironment();
      setEnvironment((last) =>
        last.textEnlarged === next.textEnlarged && last.zoomed === next.zoomed ? last : next,
      );
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    // A script or a user style sheet that sets the root size moves nothing the page is told about, but it does
    // write the root element's `style` or `class`.
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(refresh);
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const guards = { ...environment, actualSize };
  const reachable =
    frame === null
      ? null
      : { width: frame.width, height: frame.height + (band?.height ?? DESIGNED_BAND_HEIGHT_PX) };
  // Only the unit's size matters, and it is the same at every scale (see the docblock), so the
  // frame's own height, which does depend on the band's, is combined with the band's here.
  const target = supported ? computeWorkspaceScale(reachable, guards) : 1;
  const wouldScale =
    supported &&
    !environment.textEnlarged &&
    !environment.zoomed &&
    requiredWorkspaceScale(reachable) < 1;

  const inForce = useRef(1);
  const frozen = usePointerHold(inForce);
  const applied = frozen ?? target;
  useEffect(() => {
    inForce.current = applied;
  });

  const registry = useMemo<Registry>(
    () => ({
      reportFrame: (box) => setFrame((last) => (sameBox(last, box) ? last : box)),
      reportBand: (box) => setBand((last) => (sameBox(last, box) ? last : box)),
    }),
    [],
  );

  const viewport = useMemo<WorkspaceBox | null>(() => {
    if (frame === null) return null;
    return {
      width: band?.width ? band.width / applied : window.innerWidth,
      height: frame.height / applied + WORKSPACE_WINDOW_INSET_HEIGHT_PX,
    };
  }, [frame, band, applied]);

  const state = useMemo<WorkspaceScaleState>(
    () => ({ scale: applied, wouldScale, actualSize, window: viewport, frame }),
    [applied, wouldScale, actualSize, viewport, frame],
  );

  return (
    <RegistryContext value={registry}>
      <StateContext value={state}>{children}</StateContext>
    </RegistryContext>
  );
}

/** Reports an element's box in layout px: a `ResizeObserver` content box, which a transform ignores. */
function useReportBox(
  ref: React.RefObject<HTMLElement | null>,
  report: ((box: WorkspaceBox | null) => void) | undefined,
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !report || typeof ResizeObserver === 'undefined') return;
    const read = (): void => {
      const rect = { width: element.offsetWidth, height: element.offsetHeight };
      // Hidden or detached: nothing to say, and a 0 x 0 box would ask for the floor.
      report(rect.width > 0 && rect.height > 0 ? rect : null);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => {
      observer.disconnect();
      report(null);
    };
  }, [ref, report]);
}

/** The attributes a scaled wrapper carries. Both are absent at scale 1, so CSS and the helper see "unscaled". */
function scaledAttributes(scale: number): Record<string, string> {
  return scale < 1 ? { [SCALE_ATTRIBUTE]: String(scale), [SCALED_ATTRIBUTE]: '' } : {};
}

/**
 * The root's frame, wrapped around the workspace inside `<main>`. It fills the grid cell exactly as
 * the root did (`flex min-h-0 flex-1 flex-col`); while scaled it clips, and the inner wrapper is laid
 * out at its box ÷ scale in absolute position, so nothing inside can change the frame's own size and
 * the box the scale reads is never a result of the scale.
 */
export function WorkspaceScaleFrame({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const state = use(StateContext);
  const registry = use(RegistryContext);
  const ref = useRef<HTMLDivElement>(null);
  useReportBox(ref, registry?.reportFrame);

  const scale = state?.scale ?? 1;
  const frame = state?.frame ?? null;
  const scaled = scale < 1 && frame !== null;
  return (
    <div
      ref={ref}
      className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', scaled && 'overflow-hidden')}
    >
      <div
        {...(scaled ? scaledAttributes(scale) : {})}
        className={cn(
          'workspace-container flex min-h-0 min-w-0 flex-1 flex-col',
          scaled && 'absolute top-0 left-0 flex-none',
        )}
        style={
          scaled
            ? {
                width: frame.width / scale,
                height: frame.height / scale,
                transform: `scale(${String(scale)})`,
                transformOrigin: '0 0',
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The command band: its `<section>` landmark and the wrapper that scales it, rendered inside the portal. The
 * outer box is as wide as the slot and as high as the band's layout height × scale, so the shell's row
 * shrinks with the band; the inner box is laid out at the slot's width ÷ scale. The section is rendered
 * here, and not by the caller inside this wrapper, so the band's own JSX keeps its depth. Outside a
 * workspace provider (a test that renders the toolbar alone) it is the bare section.
 */
export function WorkspaceScaleBand({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const state = use(StateContext);
  const registry = use(RegistryContext);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [inner, setInner] = useState<WorkspaceBox | null>(null);
  const [outer, setOuter] = useState<WorkspaceBox | null>(null);
  const reportBand = registry?.reportBand;
  const reportOuter = useCallback(
    (box: WorkspaceBox | null) => {
      setOuter(box);
      reportBand?.(box);
    },
    [reportBand],
  );
  useReportBox(outerRef, reportOuter);
  useReportBox(innerRef, setInner);

  const section = (
    <section aria-label={label} className={className}>
      {children}
    </section>
  );
  if (!state || !registry) return section;
  const scale = state.scale;
  const scaled = scale < 1 && inner !== null && outer !== null;
  const outerWidth = outer?.width ?? 0;
  return (
    <div
      ref={outerRef}
      className={cn(scaled && 'overflow-hidden')}
      style={scaled && inner ? { height: inner.height * scale } : undefined}
    >
      <div
        ref={innerRef}
        {...(scaled ? scaledAttributes(scale) : {})}
        className="workspace-band-container"
        style={
          scaled
            ? {
                width: outerWidth / scale,
                transform: `scale(${String(scale)})`,
                transformOrigin: '0 0',
              }
            : undefined
        }
      >
        {section}
      </div>
    </div>
  );
}
