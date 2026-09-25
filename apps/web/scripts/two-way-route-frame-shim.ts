/**
 * **Links-and-labels M0-T3 — `routeFrame` with the two-way prototype applied. SCRATCH, pictures only.**
 *
 * `shoot-two-way.mjs` bundles the real painter with an esbuild plugin that redirects `paint.ts`'s
 * import of `./route-frame` here. This re-exports the module unchanged and wraps `routeFrame` so that,
 * while `globalThis.__twoWayPrototype` is set, the frame's lines are `splitTwoWayTracks`'s. The
 * painter is not edited: it draws whatever lines the frame hands it, arrowheads and chevrons included,
 * so the picture is the real painter's drawing of the prototype's lines. The arrowhead is NOT trimmed
 * for the offset (that is M3-T2's `headLineFor` change), so a head on an offset end stops
 * `NODE_REACH_PX` short of its tip along the line, as today.
 */
import { routeFrame as shippedRouteFrame } from '../src/features/tsld/render/route-frame';

import { PROTOTYPE_PORT_OFFSET_PX, splitTwoWayTracks } from './two-way-prototype';

export * from '../src/features/tsld/render/route-frame';

declare global {
  var __twoWayPrototype: boolean | undefined;
}

export function routeFrame(
  ...args: Parameters<typeof shippedRouteFrame>
): ReturnType<typeof shippedRouteFrame> {
  const frame = shippedRouteFrame(...args);
  if (!globalThis.__twoWayPrototype || !frame.workingWalk) return frame;
  const [scene, view] = args;
  const split = splitTwoWayTracks(
    scene,
    view,
    frame.lines,
    frame.workingWalk,
    PROTOTYPE_PORT_OFFSET_PX,
    'fewest-crossings',
  );
  return { ...frame, lines: split.lines };
}
