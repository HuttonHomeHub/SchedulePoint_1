/**
 * Pixel-diff two screenshot trees produced by `shoot.mjs`.
 *
 * **Why this is not a byte comparison.** `shoot.mjs` mints a fresh tenant per run, and that
 * tenant's name is painted into the organisation switcher on every authenticated screen — so two
 * runs of an UNCHANGED build differ in every authenticated PNG and agree on the signed-out ones.
 * A `sha256sum` comparison therefore reports "everything changed" for a milestone whose whole exit
 * condition is "nothing changed" (ADR-0099 M2), which is a gate that can only ever be ignored.
 *
 * So this reports WHERE the pixels differ, not whether they do: a differing-pixel count and the
 * bounding box containing them. A layout change moves the box; a tenant name does not.
 *
 *   node scripts/shot-diff.mjs <dirA> <dirB> [--threshold 8]
 *
 * `--threshold` is the per-channel tolerance (0–255) below which a pixel counts as equal; the
 * default absorbs PNG/AA noise without absorbing a moved control.
 */
import { chromium } from '@playwright/test';
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dirA, dirB] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!dirA || !dirB) {
  console.error('usage: node scripts/shot-diff.mjs <dirA> <dirB> [--threshold N]');
  process.exit(2);
}
const tIdx = process.argv.indexOf('--threshold');
const threshold = tIdx === -1 ? 8 : Number(process.argv[tIdx + 1]);

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();

const files = globSync('**/*.png', { cwd: dirA }).sort();
let worst = 0;
for (const rel of files) {
  const a = readFileSync(join(dirA, rel)).toString('base64');
  let b;
  try {
    b = readFileSync(join(dirB, rel)).toString('base64');
  } catch {
    console.log(`MISSING  ${rel}`);
    continue;
  }
  const result = await page.evaluate(
    async ({ a, b, threshold }) => {
      /* global Image, document */
      const load = (data) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${data}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return { sizeMismatch: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
      }
      const draw = (img) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const da = draw(ia);
      const db = draw(ib);
      let n = 0;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -1;
      let y1 = -1;
      for (let i = 0; i < da.length; i += 4) {
        if (
          Math.abs(da[i] - db[i]) > threshold ||
          Math.abs(da[i + 1] - db[i + 1]) > threshold ||
          Math.abs(da[i + 2] - db[i + 2]) > threshold
        ) {
          n++;
          const p = i / 4;
          const x = p % ia.width;
          const y = (p / ia.width) | 0;
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
      return {
        differing: n,
        total: ia.width * ia.height,
        box: n ? { x0, y0, x1, y1 } : null,
      };
    },
    { a, b, threshold },
  );
  if (result.sizeMismatch) {
    console.log(`SIZE     ${rel}  ${result.sizeMismatch}`);
    worst = Infinity;
    continue;
  }
  const pct = ((result.differing / result.total) * 100).toFixed(4);
  worst = Math.max(worst, result.differing);
  if (result.differing === 0) {
    console.log(`IDENTICAL ${rel}`);
  } else {
    const { x0, y0, x1, y1 } = result.box;
    console.log(`DIFF      ${rel}  ${result.differing}px (${pct}%)  box x${x0}–${x1} y${y0}–${y1}`);
  }
}
await browser.close();
console.log(`\nworst differing-pixel count: ${worst}`);
