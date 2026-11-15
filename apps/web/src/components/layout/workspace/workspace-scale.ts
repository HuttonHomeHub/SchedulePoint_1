/**
 * **The plan workspace's scale, and the one place that converts what the browser reports into the
 * pixels the workspace is laid out in** (ADR-0222, `docs/specs/scaled-workspace/`).
 *
 * Below the designed window the workspace is laid out at its box divided by a scale and drawn at that
 * scale (`transform: scale(s)`, origin top-left). A transform changes what the browser *shows* and
 * leaves what the page *measures* alone, so inside the scaled subtree two kinds of number disagree by
 * the factor `s` and every consumer has to say which one it wants:
 *
 * - **screen px** — `MouseEvent.clientX/Y` and `getBoundingClientRect()` (measured, M0 §2.1);
 * - **layout px** — `offsetWidth`, `clientWidth`, `ResizeObserver` content boxes, and every length the
 *   workspace's own CSS and painters speak.
 *
 * This module is the conversion. A pointer read, or a rect read that feeds a layout decision, inside
 * the scaled subtree goes through {@link pointInLayout}, {@link layoutSize}, {@link layoutRect} or
 * {@link toLayoutPx}; `workspace-scale.structural.test.ts` lists the files that read either directly.
 * Never `offsetX/Y`: it is layout px under a transform and screen px under `zoom` (M0 §2.1), so only
 * client coordinates are used.
 *
 * Overlays are the exception: a menu, tooltip or popover is portalled to `<body>` and positioned from
 * its trigger's **screen** rect, which is exactly what `getBoundingClientRect` returns, so those reads
 * stay as they are (M0 §2.4).
 */

/**
 * The smallest scale (ADR-0222 D3). One named constant so the owner can change it: nothing else
 * encodes 0.75, and `workspace-scale.test.ts` derives its cells from it. At 0.75 the 28 px controls
 * lay out at 32 px and render at 24 px (WCAG 2.2 §2.5.8); 12 px text renders at 9 px.
 */
export const WORKSPACE_SCALE_FLOOR = 0.75;

/**
 * **The designed box** (ADR-0222 D2), as `docs/specs/scaled-workspace/m0-measurement.md` §1 measured it
 * at a 1280 x 800 window with the Project Explorer at its default width.
 *
 * - **Width 1003**: `<main>`'s box, 1280 less the Explorer's 277.
 * - **Height 749**: the workspace root's 661 plus the command band's 88. M0 found the band is not in
 *   the root (it is portalled into the shell's second row and spans the Explorer's column), so the
 *   scaled unit is two wrappers and the height that must fit is theirs together. The header (48) and
 *   the band's 3 px rule are outside the unit and never scale.
 *
 * `workspace-scale.test.ts` pins both numbers and their arithmetic; the journey at 1280 x 800 reads
 * the live boxes against them.
 */
export const DESIGNED_WORKSPACE_WIDTH_PX = 1003;
export const DESIGNED_ROOT_HEIGHT_PX = 661;
export const DESIGNED_BAND_HEIGHT_PX = 88;
export const DESIGNED_WORKSPACE_HEIGHT_PX = DESIGNED_ROOT_HEIGHT_PX + DESIGNED_BAND_HEIGHT_PX;

/**
 * How far from the window the workspace's box sits at the designed size: what the unscaled shell takes
 * (the Explorer's 277 px, and the header, band rule and the band's own 88 px = 139 px). Used to say what
 * a window-height question means for the workspace's box (`workspace-media.ts`, `globals.css`'s `ws-short`),
 * so a short window and a short workspace agree at the designed size.
 */
export const WORKSPACE_WINDOW_INSET_WIDTH_PX = 277;
export const WORKSPACE_WINDOW_INSET_HEIGHT_PX = 139;

/**
 * Browser zoom shows as `outerWidth / innerWidth` in Chromium (M0 §3: 1.200, 1.440 and 0.833 to three
 * places for real zoom levels 1, 2 and -1). `outerWidth` includes the window's own frame, so at 100 %
 * the ratio is a little over 1 on a real desktop: about 16 px of side border on a 1280 window is 1.0125.
 * 1.05 sits above any frame a window manager draws (it would take 64 px of side border at 1280) and
 * below the smallest zoom step a reader takes (110 %), so it ignores borders and scrollbars and still
 * catches every browser zoom step above 105 %.
 *
 * **Chromium only** (M0 §3, "Caveats that are not measured"): Firefox reports screen sizes in
 * zoom-scaled CSS px and WebKit differently, so the ratio reads 1 there and the reader's own switch
 * (`workspace-scale-pref.ts`) is what covers them.
 */
export const ZOOM_RATIO_TOLERANCE = 1.05;

/** The root font size the designed layout assumes (the browser default). */
export const DEFAULT_ROOT_FONT_PX = 16;

/** The attribute the scaled wrappers carry, read by {@link workspaceScaleOf}. */
export const SCALE_ATTRIBUTE = 'data-workspace-scale';

/** The attribute CSS keys on while scaled (`button.tsx`: the 28 px controls lay out at 32). */
export const SCALED_ATTRIBUTE = 'data-workspace-scaled';

export interface WorkspaceBox {
  readonly width: number;
  readonly height: number;
}

export interface ScaleGuards {
  /** The root font size is larger than the browser default, by a setting or a style sheet (D4.1). */
  readonly textEnlarged: boolean;
  /** The browser reports a zoom above 100 % (D4.2). */
  readonly zoomed: boolean;
  /** The reader chose actual size (D4.3). */
  readonly actualSize: boolean;
}

/** Rounded so a sub-pixel resize does not retune the transform on every frame. */
function steady(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The scale the box asks for, **before** the guards:
 * `min(1, width / Wd, height / Hd)` clamped to the floor (ADR-0222 D2/D3). `available` is the unit's own
 * box at scale 1: the workspace root's width, and the root's height plus the band's. A box not measured
 * yet is scale 1.
 */
export function requiredWorkspaceScale(available: WorkspaceBox | null): number {
  if (!available || available.width <= 0 || available.height <= 0) return 1;
  const fit = Math.min(
    1,
    available.width / DESIGNED_WORKSPACE_WIDTH_PX,
    available.height / DESIGNED_WORKSPACE_HEIGHT_PX,
  );
  return steady(Math.max(WORKSPACE_SCALE_FLOOR, fit));
}

/** The scale in force: 1 whenever a guard holds (D4), otherwise what the box asks for. */
export function computeWorkspaceScale(available: WorkspaceBox | null, guards: ScaleGuards): number {
  if (guards.textEnlarged || guards.zoomed || guards.actualSize) return 1;
  return requiredWorkspaceScale(available);
}

/** The root element's font size in px, or the default where it cannot be read (jsdom, SSR). */
export function rootFontPx(): number {
  if (typeof document === 'undefined') return DEFAULT_ROOT_FONT_PX;
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : DEFAULT_ROOT_FONT_PX;
}

/** D4.1: larger than the default, however it got that way. */
export function isTextEnlarged(): boolean {
  return rootFontPx() > DEFAULT_ROOT_FONT_PX;
}

/** D4.2: the Chromium zoom signal. `false` where either width is missing or zero. */
export function isBrowserZoomed(): boolean {
  if (typeof window === 'undefined') return false;
  const { outerWidth, innerWidth } = window;
  if (!(outerWidth > 0) || !(innerWidth > 0)) return false;
  return outerWidth / innerWidth > ZOOM_RATIO_TOLERANCE;
}

/**
 * Whether this browser can lay the workspace out as it needs to (transforms and size container
 * queries). Where it cannot, the scale is 1 and the workspace behaves as it did before this epic.
 */
export function supportsScaling(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('container-type', 'size')
  );
}

// ---------------------------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------------------------

/**
 * The scale in force around `element`: the nearest scaled wrapper's, and 1 outside every one. Read from
 * the DOM and not from React context so a plain event handler or a `ResizeObserver` callback can ask it.
 */
export function workspaceScaleOf(element: Element | null | undefined): number {
  const wrapper = element?.closest(`[${SCALE_ATTRIBUTE}]`);
  if (!wrapper) return 1;
  const scale = Number.parseFloat(wrapper.getAttribute(SCALE_ATTRIBUTE) ?? '');
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** A length measured on screen, in the layout pixels of the scaled subtree `element` is in. */
export function toLayoutPx(element: Element | null | undefined, screenPx: number): number {
  return screenPx / workspaceScaleOf(element);
}

export interface LayoutRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * `element.getBoundingClientRect()` in layout px. Only **differences** between two rects taken inside
 * one scaled subtree are meaningful (the origin is the viewport's, divided by `s`), which is what every
 * caller does: a size, or `a.left - b.left`.
 */
export function layoutRect(element: Element): LayoutRect {
  const rect = element.getBoundingClientRect();
  const scale = workspaceScaleOf(element);
  return {
    left: rect.left / scale,
    top: rect.top / scale,
    right: rect.right / scale,
    bottom: rect.bottom / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

/** The element's size in layout px (what `offsetWidth` says, with the fraction). */
export function layoutSize(element: Element): WorkspaceBox {
  const { width, height } = layoutRect(element);
  return { width, height };
}

export interface ClientPoint {
  readonly clientX: number;
  readonly clientY: number;
}

/**
 * Where a pointer event landed inside `element`, in the layout px the element's own coordinates are in.
 * Client coordinates only: `(clientX - rect.left) / s`, the same `s` that divides the rect.
 */
export function pointInLayout(
  event: ClientPoint,
  element: Element,
): { readonly x: number; readonly y: number } {
  const rect = element.getBoundingClientRect();
  const scale = workspaceScaleOf(element);
  return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
}

/**
 * A pointer's travel between two client positions, in layout px: what a drag handler adds to a width
 * or a pan. `element` says which subtree the drag is in.
 */
export function deltaInLayout(element: Element | null | undefined, screenDelta: number): number {
  return toLayoutPx(element, screenDelta);
}

/**
 * How far a pointer is from one of the element's edges, in layout px. A right-docked panel's width is
 * "the body's right edge minus X", a bottom panel's height "the body's bottom edge minus Y"; both
 * subtract two screen coordinates, so the difference is what is divided.
 */
export function distanceFromEdgeInLayout(
  element: Element,
  edge: 'right' | 'bottom',
  clientPosition: number,
): number {
  const rect = element.getBoundingClientRect();
  return (rect[edge] - clientPosition) / workspaceScaleOf(element);
}
