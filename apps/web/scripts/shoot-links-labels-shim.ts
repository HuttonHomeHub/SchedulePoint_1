/**
 * **Links-and-labels M2-T6 — `routeFrame` with the text term switchable, for the before/after
 * pictures only.** The painter imports `./route-frame`; the shooting script's bundle redirects that
 * import here. With `__textBlind` set, the router is given no text and no plates, which is exactly
 * what it was given before M2. Harness-only: nothing in the product imports this.
 */
import { routeFrame as shippedRouteFrame } from '../src/features/tsld/render/route-frame';

export * from '../src/features/tsld/render/route-frame';

declare global {
  var __textBlind: boolean | undefined;
}

export function routeFrame(
  ...args: Parameters<typeof shippedRouteFrame>
): ReturnType<typeof shippedRouteFrame> {
  if (globalThis.__textBlind !== true) return shippedRouteFrame(...args);
  const [scene, view, visibleIds, byId, rectCache] = args;
  return shippedRouteFrame(scene, view, visibleIds, byId, rectCache, null, null);
}
