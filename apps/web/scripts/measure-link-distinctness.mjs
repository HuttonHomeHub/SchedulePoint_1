#!/usr/bin/env node
/**
 * **M5-T1b — is the relationship distinguishable from the furniture?** (logic-legibility)
 *
 *   node scripts/measure-link-distinctness.mjs
 *
 * M5-T1's ink measurement says the link layer is **not** the quietest thing on the surface by area
 * (58–114 % of bar ink) and that M3 already tripled its per-mark weight by thinning the bar. So the
 * premise "the relationship is the quietest thing" does not survive as a statement about weight,
 * and the question it was really pointing at is **distinctness**: a link is a neutral line on a
 * surface that is full of neutral lines — gridlines at three tiers, the lane rule, the data-date
 * and Today verticals.
 *
 * Resolved in a **real browser**, under `[data-surface="canvas"]`, because that is the only place
 * the answer is authoritative: ADR-0102's finding is that an `@theme inline` alias declared at
 * `:root` is substituted on the element that declares it and a surface rebind can never reach it,
 * so a value resolved by parsing the stylesheet can be right about the file and wrong about the
 * picture. Each token is painted into a 1x1 canvas and read back as sRGB, which is exact and needs
 * no oklch conversion of our own.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { chromium } from '@playwright/test';

/** What the painter reads, and what each one is for (`palette.ts:150-164`). */
const TOKENS = {
  '--canvas': 'the ground',
  '--muted-foreground': 'THE LINK (palette.edge)',
  '--border': 'the day/month/year gridlines (palette.gridLine)',
  '--canvas-lane-rule': 'the lane rule',
  '--primary': 'an on-schedule bar (palette.bar)',
  '--destructive': 'a critical bar AND a critical link',
  '--warning': 'a near-critical bar AND a near-critical link',
  '--foreground': 'the data-date rule, and label ink',
};

const tokens = readFileSync('src/styles/globals.css', 'utf8');
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  execFileSync('sh', [
    '-c',
    'ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1',
  ])
    .toString()
    .trim();

const browser = await chromium.launch({ executablePath: chromiumPath || undefined });
const page = await browser.newPage();
await page.setContent(
  `<style>${tokens}</style><div id="host" data-surface="canvas"></div><canvas id="c" width="1" height="1"></canvas>`,
);
const resolved = await page.evaluate((names) => {
  // `globalThis.` throughout: this callback is serialised into the page, where `document` and
  // `getComputedStyle` are globals the linter (correctly) does not know about in a node script.
  const host = globalThis.document.getElementById('host');
  const canvas = globalThis.document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const style = globalThis.getComputedStyle(host);
  const out = {};
  for (const name of names) {
    const declared = style.getPropertyValue(name).trim();
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = declared || '#000000';
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    out[name] = { declared, srgb: [r, g, b] };
  }
  return out;
}, Object.keys(TOKENS));
await browser.close();

const lum = ([r, g, b]) => {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

console.log(`\n[logic-legibility M5-T1b] ${new Date().toISOString()}`);
console.log(`  commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`);
console.log('  resolved under [data-surface="canvas"] in Chromium, read back as painted pixels\n');
for (const [name, what] of Object.entries(TOKENS)) {
  const r = resolved[name];
  console.log(
    `    ${name.padEnd(22)} ${r.declared.padEnd(30)} rgb(${r.srgb.join(', ')})  — ${what}`,
  );
}

// **The control.** Two tokens resolving to the same pixel means either a real collision or a
// resolution that silently fell back; either way the ratios below would be meaningless, so it is
// named rather than left for a reader to spot in the table.
const byPixel = new Map();
for (const [name, r] of Object.entries(resolved)) {
  const key = r.srgb.join(',');
  byPixel.set(key, [...(byPixel.get(key) ?? []), name]);
}
for (const [key, names] of byPixel) {
  if (names.length > 1)
    console.log(`\n  NOTE: ${names.join(' and ')} resolve to the same pixel (${key}).`);
}

const ground = resolved['--canvas'].srgb;
const link = resolved['--muted-foreground'].srgb;
console.log('\n  Against the ground, and against each other\n');
for (const [name, what] of Object.entries(TOKENS)) {
  if (name === '--canvas') continue;
  const c = resolved[name].srgb;
  console.log(
    `    ${name.padEnd(22)} vs ground ${ratio(c, ground).toFixed(2).padStart(6)}:1   ` +
      `vs the link ${ratio(c, link).toFixed(2).padStart(6)}:1   — ${what}`,
  );
}
