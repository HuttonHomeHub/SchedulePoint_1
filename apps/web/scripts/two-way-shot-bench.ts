/**
 * **Links-and-labels M0-T3 — the browser entry for `shoot-two-way.mjs`. SCRATCH.**
 *
 * The real `paintScene` and `resolveTsldPalette` under the canvas surface scope; `route-frame` is
 * redirected to `two-way-route-frame-shim.ts` at bundle time, and `prototype` switches the split on.
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
  prototype: boolean;
}

declare global {
  var renderTwoWay: (input: ShotInput) => void;
}

globalThis.renderTwoWay = ({ canvas, root, scene, view, size, dpr, prototype }) => {
  globalThis.__twoWayPrototype = prototype;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2D context — the picture would be blank and look like one');
  paintScene(ctx, scene, view, size, resolveTsldPalette(root), dpr);
};
