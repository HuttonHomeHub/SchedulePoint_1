/**
 * **Links-and-labels M3 — the browser entry for `shoot-tracks.mjs`.**
 *
 * The real `paintScene` and `resolveTsldPalette` under the canvas surface scope; `link-tracks` is
 * redirected to `shoot-tracks-shim.ts` at bundle time, and `split` switches the pass on.
 */
import { paintScene, type TsldScene } from '../src/features/tsld/render/paint';
import { resolveTsldPalette } from '../src/features/tsld/render/palette';
import type { Viewport } from '../src/features/tsld/render/render-model';

interface ShotInput {
  canvas: HTMLCanvasElement;
  root: HTMLElement;
  scene: TsldScene;
  view: Viewport;
  size: { width: number; height: number };
  dpr: number;
  split: boolean;
}

declare global {
  var renderTracks: (input: ShotInput) => void;
}

globalThis.renderTracks = ({ canvas, root, scene, view, size, dpr, split }) => {
  globalThis.__noTracks = !split;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2D context — the picture would be blank and look like one');
  paintScene(ctx, scene, view, size, resolveTsldPalette(root), dpr);
};
