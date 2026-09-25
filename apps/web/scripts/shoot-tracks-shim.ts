/**
 * **Links-and-labels M3 — `link-tracks` with a switch, for the before pictures only.**
 *
 * `shoot-tracks.mjs` bundles the real painter with an esbuild plugin that redirects every import of
 * `link-tracks` here. While `globalThis.__noTracks` is set, `splitResidueTracks` hands every line
 * back unmoved, which is the frame as it was before M3; otherwise it is the shipped pass. Nothing
 * else in the painter changes.
 */
import * as shipped from '../src/features/tsld/render/link-tracks';

export * from '../src/features/tsld/render/link-tracks';

declare global {
  var __noTracks: boolean | undefined;
}

export function splitResidueTracks(
  ...args: Parameters<typeof shipped.splitResidueTracks>
): ReturnType<typeof shipped.splitResidueTracks> {
  if (!globalThis.__noTracks) return shipped.splitResidueTracks(...args);
  return { lines: args[0].map((l) => l.line), split: 0, segments: 0, splitAt: [], refused: {} };
}
