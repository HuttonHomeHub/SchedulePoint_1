/**
 * **Where a link may leave or enter an activity** (node-to-node links M1-T1, spec §4.1).
 *
 * A link has two ends. Each end's **anchor** is today's `lagAnchorPoints` point, unchanged (spec
 * D-8): a node where there is no lag, an embed partway along the bar where there is one. This module
 * says, for each end, which **directions** its end segment may take and how much of the line its
 * glyph **covers** (the reach). The router uses both; the attachment instrument
 * (`scripts/attachment-probe.ts`) applies the same table independently, from its own code, so the
 * two cannot agree with each other by sharing a mistake (ADR-0124).
 *
 * | End kind     | Directions                                             | Reach                  |
 * | ------------ | ------------------------------------------------------ | ---------------------- |
 * | start node   | W, N, S (never E, which runs along its own bar)        | `NODE_REACH_PX`        |
 * | finish node  | E, N, S (never W)                                      | `NODE_REACH_PX`        |
 * | embed        | N, S only                                              | `EMBED_REACH_PX`       |
 * | milestone    | E or W at the side anchor; N, S at the glyph's centre  | 0 side / radius centre |
 * | span end     | as a start or finish node (LOE, hammock, WBS summary)  | 0                      |
 *
 * For a predecessor end the directions are the ways the first segment may **travel**. For a
 * successor end they are the **sides** the last segment may arrive from. The two tables are the same
 * (a start node is left or entered on its W, N or S side), so one set serves both readings.
 */
import {
  ARROWHEAD_ROUTED_PX,
  barGlyphKind,
  isMilestone,
  LINK_ELBOW_RADIUS,
  MILESTONE_RADIUS,
  NODE_REACH_PX,
  type Point,
  type Rect,
  type RenderActivity,
} from './render-model';

export type LinkDir = 'E' | 'W' | 'N' | 'S';

/** The direction opposite to `d`: the side a segment travelling `d` arrives from. */
export const OPPOSITE_DIR: Readonly<Record<LinkDir, LinkDir>> = { E: 'W', W: 'E', N: 'S', S: 'N' };

/**
 * How much of a link an embed's dot covers, in px. Equal to `ATTACH_DOT_R` in `paint.ts`, which
 * cannot be imported here: `paint.ts` imports `route-frame.ts`, which imports this module.
 * `link-ports.test.ts` pins the two equal, so the dot and the router cannot disagree about it.
 */
export const EMBED_REACH_PX = 2;

export type LinkEndKind =
  'start-node' | 'finish-node' | 'embed' | 'milestone' | 'span-start' | 'span-finish';

/** One place a link may join an end, and the directions it allows there. */
export interface LinkPort {
  point: Point;
  allowed: ReadonlySet<LinkDir>;
  /** How much of the line the end's glyph covers from `point`, in px. */
  reach: number;
}

export interface LinkEnd {
  kind: LinkEndKind;
  /** One port, or two for a milestone (its side anchor and its centre, spec D-5). */
  ports: readonly LinkPort[];
}

const WNS: ReadonlySet<LinkDir> = new Set(['W', 'N', 'S']);
const ENS: ReadonlySet<LinkDir> = new Set(['E', 'N', 'S']);
const NS: ReadonlySet<LinkDir> = new Set(['N', 'S']);
const ONLY_W: ReadonlySet<LinkDir> = new Set(['W']);
const ONLY_E: ReadonlySet<LinkDir> = new Set(['E']);

/**
 * **The stub rule** (spec §4.1). An end segment followed by a bend must be long enough that the bend
 * is visible: at the predecessor end the rounded corner must lie outside the glyph, at the successor
 * end the whole arrowhead must lie on one straight segment. Both are derived from existing
 * constants, never tuned: 9 + 5 = 14 px and 9 + 8 = 17 px at a node. A line with no bend is exempt.
 */
export function predecessorStub(reach: number): number {
  return reach + LINK_ELBOW_RADIUS;
}

export function successorStub(reach: number): number {
  return reach + ARROWHEAD_ROUTED_PX;
}

/**
 * Classify one end of a link.
 *
 * An anchor within half a pixel of a bar's edge is that edge's node; strictly inside is an embed
 * (a lag or lead). A milestone offers two ports: its side anchor, which only a horizontal may use,
 * and its centre, which only a vertical may use — a vertical arriving at the side anchor would run
 * past the glyph rather than into it (spec D-5). The centre's reach is the glyph's radius, so the
 * arrowhead stops at the triangle rather than under it.
 */
export function linkEndOf(activity: RenderActivity, anchor: Point, rect: Rect): LinkEnd {
  const atLeft = Math.abs(anchor.x - rect.x) <= 0.5;
  const atRight = Math.abs(anchor.x - (rect.x + rect.w)) <= 0.5;
  if (isMilestone(activity.type)) {
    const centre: LinkPort = {
      point: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
      allowed: NS,
      reach: MILESTONE_RADIUS,
    };
    const side: LinkPort = { point: anchor, allowed: atRight ? ONLY_E : ONLY_W, reach: 0 };
    return { kind: 'milestone', ports: [side, centre] };
  }
  if (barGlyphKind(activity.type) !== 'bar') {
    if (!atLeft && !atRight) {
      return { kind: 'embed', ports: [{ point: anchor, allowed: NS, reach: 0 }] };
    }
    return atRight
      ? { kind: 'span-finish', ports: [{ point: anchor, allowed: ENS, reach: 0 }] }
      : { kind: 'span-start', ports: [{ point: anchor, allowed: WNS, reach: 0 }] };
  }
  if (atLeft) {
    return { kind: 'start-node', ports: [{ point: anchor, allowed: WNS, reach: NODE_REACH_PX }] };
  }
  if (atRight) {
    return { kind: 'finish-node', ports: [{ point: anchor, allowed: ENS, reach: NODE_REACH_PX }] };
  }
  return { kind: 'embed', ports: [{ point: anchor, allowed: NS, reach: EMBED_REACH_PX }] };
}

/** The end's port for a segment of the given orientation, or null if it has none. */
export function portFor(end: LinkEnd, orientation: 'H' | 'V'): LinkPort | null {
  for (const port of end.ports) {
    const ok =
      orientation === 'H'
        ? port.allowed.has('E') || port.allowed.has('W')
        : port.allowed.has('N') || port.allowed.has('S');
    if (ok) return port;
  }
  return null;
}
