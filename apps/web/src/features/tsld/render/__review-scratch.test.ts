import { describe, it } from 'vitest';
import { PRINT_TOKEN_SOURCES } from './palette';
import { compositeOver, parseColour, relativeLuminance, type Srgb } from '@/test/colour';
import { blockBody, declarations, themeTokens, THEME_SELECTORS } from '@/test/css-blocks';

function canvasScope(): Map<string, string> {
  const t = new Map(themeTokens(THEME_SELECTORS[0]));
  for (const [n, v] of declarations(blockBody("[data-surface='canvas']"))) {
    const s = /^var\((--[a-z0-9-]+)\)$/.exec(v)?.[1];
    const r = s === undefined ? v : t.get(s);
    if (r === undefined) throw new Error(n);
    t.set(n, r);
  }
  return t;
}
const srgb = (v: string): Srgb => compositeOver(parseColour(v), [1, 1, 1]);
const lum = (v: string) => relativeLuminance(srgb(v));
const ratio = (a: string, b: string) => {
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const out = (s: string) => process.stdout.write(s + '\n');

describe('s', () => {
  it('d', () => {
    const t = canvasScope();
    const R = (f: keyof typeof PRINT_TOKEN_SOURCES) => t.get(PRINT_TOKEN_SOURCES[f][0])!;
    const paper = t.get('--print-ground')!;
    const bandNow = t.get('--canvas-band')!;
    const washNow = R('nonWorking');
    const hatch = R('nonWorkingHatch');
    const bandProp = 'oklch(0.982 0.003 250)';
    const washProp = 'oklch(0.955 0.002 248)';

    const grounds = [
      ['paper', paper],
      ['band(shipped)', bandNow],
      ['band(proposed .982)', bandProp],
      ['wash(shipped)', washNow],
      ['wash(proposed .955)', washProp],
    ] as const;

    out('\n=== EVERY DRAWN MARK vs FOUR/FIVE GROUNDS (after M2) ===');
    out('mark'.padEnd(18) + grounds.map(([n]) => n.padEnd(21)).join(''));
    const marks = [
      'labelBeside',
      'dataDate',
      'outline',
      'edge',
      'today',
      'selection',
      'bar',
      'critical',
      'nearCritical',
      'gridLineMonth',
      'gridLineYear',
      'gridLineDay',
      'gridLine',
      'barStroke',
      'conflict',
    ] as const;
    for (const m of marks) {
      out(m.padEnd(18) + grounds.map(([, g]) => ratio(g, R(m)).toFixed(3).padEnd(21)).join(''));
    }

    out('\n=== the washes / band themselves (1.4.11 subject on screen) ===');
    out(
      `band(shipped) on paper        ${ratio(paper, bandNow).toFixed(4)}   OKLCH dL ${(0.976 - 1).toFixed(3)}`,
    );
    out(
      `band(proposed) on paper       ${ratio(paper, bandProp).toFixed(4)}   OKLCH dL ${(0.982 - 1).toFixed(3)}  <-- repo perceptibility threshold is 0.02`,
    );
    out(
      `band(shipped) on screen grd   ${ratio(t.get('--canvas')!, bandNow).toFixed(4)}   OKLCH dL +0.018`,
    );
    out(
      `wash(shipped) on paper        ${ratio(paper, washNow).toFixed(4)}   dL ${(0.965 - 1).toFixed(3)}`,
    );
    out(
      `wash(proposed) on paper       ${ratio(paper, washProp).toFixed(4)}   dL ${(0.955 - 1).toFixed(3)}`,
    );
    out(`wash(prop) on band(prop)      ${ratio(bandProp, washProp).toFixed(4)}   dL -0.027`);
    out(`wash(shipped) on band(shipped)${ratio(bandNow, washNow).toFixed(4)}   dL -0.011`);

    out('\n=== THE HATCH — the sole non-colour channel for a weekend ===');
    out(
      `hatch on wash(shipped)        ${ratio(washNow, hatch).toFixed(4)}  <- today, screen AND paper (both opaque, same pair)`,
    );
    out(
      `hatch on wash(proposed .955)  ${ratio(washProp, hatch).toFixed(4)}  <- WEAKER after the proposal`,
    );
    out(
      `hatch on paper (no wash)      ${ratio(paper, hatch).toFixed(4)}  <- the spec's "1.25:1", wrong ground`,
    );
    // what hatch value would keep 1.127 against the proposed wash?
    for (const L of [0.925, 0.915, 0.905, 0.895, 0.885]) {
      const v = `oklch(${L} 0.006 252)`;
      out(`   hatch ${L} on wash(prop): ${ratio(washProp, v).toFixed(4)}`);
    }
    out('\n=== minimum asserted ratio, per ground ===');
    const text = ['labelBeside', 'dataDate'] as const,
      nonText = ['edge', 'outline', 'today', 'selection'] as const;
    for (const [n, g] of grounds) {
      const tmin = Math.min(...text.map((f) => ratio(g, R(f))));
      const mmin = Math.min(...nonText.map((f) => ratio(g, R(f))));
      const barmin = Math.min(
        ...(['bar', 'critical', 'nearCritical'] as const).map((f) => ratio(g, R(f))),
      );
      out(
        `${n.padEnd(22)} text-min ${tmin.toFixed(3)} (>=4.5)  mark-min ${mmin.toFixed(3)} (>=3)  barfill-min ${barmin.toFixed(3)} (ungated, screen rule >=3)`,
      );
    }
  });
});
