/**
 * The browser half of `measure-gutter-pitch.mjs` (M-C0-T4 / FC-C3).
 *
 * It exists because FC-C3 is judged on a **rendered image**, not on arithmetic — "two
 * distinguishable runs" is a claim about what a reader can see, and this epic exists because a
 * diagram that satisfied every number was still hard to read. So the picture is painted by the real
 * `paintScene` against a real Chromium 2D context, with the real `resolveTsldPalette` reading the
 * real `globals.css` tokens through ADR-0102's canvas surface scope. Nothing here is a hex literal
 * standing in for a token, and nothing reconstructs the routing pipeline.
 *
 * The scene arrives as data from node (the fixture is read with `fs`, which no browser bundle can
 * do); the **pitch** arrives as a rewritten `LANE_HEIGHT` in the bundle itself, which is why this
 * file has no pitch parameter and reports the constant back instead.
 */
import { BAR_HEIGHT, LANE_HEIGHT } from '../src/features/tsld/render/geometry';
import { paintScene, type TsldScene } from '../src/features/tsld/render/paint';
import { resolveTsldPalette } from '../src/features/tsld/render/palette';

interface SampleInput {
  canvas: HTMLCanvasElement;
  root: Element;
  scene: TsldScene;
  focusLane: number;
  pxPerDay: number;
  size: { width: number; height: number };
  dpr: number;
  /**
   * Optional horizontal origin. Defaults to 40, which is what Part C's three layout shots used and
   * what keeps them byte-identical; M0-T5 passes its own so a picture of a 391-day plan can be
   * framed on the cluster it is about rather than on whatever happens to sit at day zero.
   */
  originX?: number;
}

declare global {
  var renderGutterSample: (input: SampleInput) => {
    laneHeight: number;
    barHeight: number;
    originY: number;
  };
}

globalThis.renderGutterSample = ({
  canvas,
  root,
  scene,
  focusLane,
  pxPerDay,
  size,
  dpr,
  originX,
}) => {
  // Frame the busiest gutter a little below the top edge, at whatever pitch this bundle carries.
  const originY = 40 - focusLane * LANE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2D context — the picture would be blank and look like one');
  paintScene(
    ctx,
    scene,
    { pxPerDay, originX: originX ?? 40, originY },
    size,
    resolveTsldPalette(root),
    dpr,
  );
  return { laneHeight: LANE_HEIGHT, barHeight: BAR_HEIGHT, originY };
};
