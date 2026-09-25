/**
 * **Links-and-labels M2-T6 — the browser entry for `shoot-links-labels.mjs`.** The real
 * `paintScene` and `resolveTsldPalette` under the canvas surface scope; `route-frame` is redirected
 * to `shoot-links-labels-shim.ts` at bundle time, and `textBlind` draws the pre-M2 routes.
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
  textBlind: boolean;
}

declare global {
  var renderLinksLabels: (input: ShotInput) => void;
}

globalThis.renderLinksLabels = ({ canvas, root, scene, view, size, dpr, textBlind }) => {
  globalThis.__textBlind = textBlind;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2D context — the picture would be blank and look like one');
  paintScene(ctx, scene, view, size, resolveTsldPalette(root), dpr);
};
