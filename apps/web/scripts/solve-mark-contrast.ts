/**
 * Diagram mark contrast M0-T2: what `--canvas-bar` and `--canvas-link` must be so that no ordinary
 * link out-shouts the ordinary bar (`docs/specs/diagram-mark-contrast/`, TECH_DEBT #368).
 *
 * Run: `pnpm exec tsx scripts/solve-mark-contrast.ts` from `apps/web`.
 *
 * **Reported, never gated** (the sibling `solve-netpoint-grammar.ts` explains why): this script
 * chooses values and `token-contrast.test.ts` is the gate that holds them. A solver that asserted
 * its own answers would agree with itself.
 *
 * Today's tokens come from the gate's own resolver (`src/test/scope-tokens.ts`), not a copy of it
 * (ADR-0124). A candidate out of the sRGB gamut is refused, not clamped.
 *
 * Hue and chroma are held; only lightness is searched, at steps of 0.001.
 */
import {
  compositeOver,
  contrastRatio,
  deltaE76,
  fmtRatio,
  oklchInGamut,
  oklchToSrgb,
  parseColour,
  type Srgb,
} from '../src/test/colour';
import { ratio, resolve } from '../src/test/scope-tokens';

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

type Oklch = readonly [L: number, C: number, H: number];
const css = ([L, C, H]: Oklch): string => `oklch(${+L.toFixed(3)} ${+C.toFixed(3)} ${H})`;
const rgb = (c: Oklch): Srgb => oklchToSrgb(...c);
const hex = (s: Srgb): string =>
  `#${s
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const today = resolve(':root', 'canvas');
const need = (name: string): string => {
  const v = today.get(name);
  if (v === undefined) throw new Error(`${name} is not declared in the canvas scope`);
  return v;
};
const srgbOf = (name: string): Srgb => parseColour(need(name)).srgb;

const ground = srgbOf('--canvas');
const band = srgbOf('--canvas-band');
const print = parseColour(resolve(':root', 'print').get('--print') ?? 'oklch(1 0 0)').srgb;
const GROUNDS: Srgb[] = [ground, band, print];
const warning = srgbOf('--warning');
const critical = srgbOf('--destructive');
const labelInk = srgbOf('--primary-foreground');
const foreground = srgbOf('--foreground');
const mark = srgbOf('--canvas-link-mark');
const minor = srgbOf('--canvas-link-minor');
const fill = parseColour(need('--canvas-minimap-frame-fill'));
const tinted = (ink: Srgb): Srgb => compositeOver(fill, ink);

const BAR_C = 0.13;
const BAR_H = 150;
const LINK_C = 0.13;
const LINK_H = 295;

/** Margin over the ladder's 1.5 floor, untinted and through the minimap tint. */
const LADDER_MARGIN = 0.04;

/**
 * How much stronger than the link the bar must be, as a ratio of their contrasts. Without it the
 * solver lands on the exact edge of the ordering (1.002), where rounding a fallback hex to eight
 * bits could flip it; 1.013 is the smallest round step that leaves the edge clear.
 */
const BAR_OVER_LINK = 1.013;

function barOk(L: number): boolean {
  if (!oklchInGamut(L, BAR_C, BAR_H)) return false;
  const bar = rgb([L, BAR_C, BAR_H]);
  if (!GROUNDS.every((g) => contrastRatio(bar, g) >= 3)) return false;
  if (contrastRatio(bar, warning) < 1.5 + LADDER_MARGIN) return false;
  if (contrastRatio(tinted(bar), tinted(warning)) < 1.5 + LADDER_MARGIN) return false;
  if (contrastRatio(tinted(bar), tinted(critical)) < 1.5 + LADDER_MARGIN) return false;
  if (contrastRatio(labelInk, bar) < 4.5) return false;
  if (contrastRatio(foreground, bar) < 3) return false;
  if (contrastRatio(mark, bar) < 3) return false;
  return true;
}

/** The darkest bar that keeps every pair: the smallest L that passes, so the strongest the ladder allows. */
let barL = -1;
for (let i = 0; i <= 1000; i += 1) {
  if (barOk(i / 1000)) {
    barL = i / 1000;
    break;
  }
}
if (barL < 0) throw new Error('no in-gamut bar satisfies every constraint');
const bar: Oklch = [barL, BAR_C, BAR_H];

function linkOk(L: number): boolean {
  if (!oklchInGamut(L, LINK_C, LINK_H)) return false;
  const link = rgb([L, LINK_C, LINK_H]);
  // The new rule: no darker (higher contrast) than the bar on any ground.
  if (!GROUNDS.every((g) => contrastRatio(link, g) * BAR_OVER_LINK <= contrastRatio(rgb(bar), g)))
    return false;
  if (!GROUNDS.every((g) => contrastRatio(link, g) >= 3)) return false;
  if (contrastRatio(mark, link) < 3) return false;
  return true;
}
let linkL = -1;
for (let i = 0; i <= 1000; i += 1) {
  if (linkOk(i / 1000)) {
    linkL = i / 1000;
    break;
  }
}
if (linkL < 0) throw new Error('no in-gamut link satisfies every constraint');
const link: Oklch = [linkL, LINK_C, LINK_H];

out('## Solved values\n');
out('| Token | Today | Solved | sRGB fallback |\n| --- | --- | --- | --- |');
out(`| \`--canvas-bar\` | \`${need('--canvas-bar')}\` | \`${css(bar)}\` | \`${hex(rgb(bar))}\` |`);
out(
  `| \`--canvas-link\` | \`${need('--canvas-link')}\` | \`${css(link)}\` | \`${hex(rgb(link))}\` |`,
);

out('\n## Contrast on each ground (today to solved)\n');
out('| Ink | On ground | On band | On print |\n| --- | --- | --- | --- |');
const todayBar = srgbOf('--canvas-bar');
const todayLink = srgbOf('--canvas-link');
for (const [label, was, now] of [
  ['`--canvas-bar`', todayBar, rgb(bar)],
  ['`--canvas-link`', todayLink, rgb(link)],
  ['`--canvas-link-minor` (unchanged)', minor, minor],
] as const) {
  const cell = (g: Srgb): string =>
    `${fmtRatio(contrastRatio(was, g))} to ${fmtRatio(contrastRatio(now, g))}`;
  out(`| ${label} | ${cell(ground)} | ${cell(band)} | ${cell(print)} |`);
}

out('\n## Every pair that involves a changed token\n');
out('| Pair | Today | Solved | Floor |\n| --- | --- | --- | --- |');
const b = rgb(bar);
const l = rgb(link);
const row = (label: string, was: number, now: number, floor: string): void =>
  out(`| ${label} | ${fmtRatio(was)} | ${fmtRatio(now)} | ${floor} |`);
row('bar vs near-critical', contrastRatio(todayBar, warning), contrastRatio(b, warning), '≥ 1.50');
row('bar vs critical', contrastRatio(todayBar, critical), contrastRatio(b, critical), '≥ 1.50');
row(
  'bar vs near-critical through the viewport tint',
  contrastRatio(tinted(todayBar), tinted(warning)),
  contrastRatio(tinted(b), tinted(warning)),
  '≥ 1.50',
);
row(
  'bar vs critical through the viewport tint',
  contrastRatio(tinted(todayBar), tinted(critical)),
  contrastRatio(tinted(b), tinted(critical)),
  '≥ 1.50',
);
row(
  'label `--primary-foreground` on the bar',
  contrastRatio(labelInk, todayBar),
  contrastRatio(labelInk, b),
  '≥ 4.50',
);
row(
  'inset ring `--foreground` on the bar',
  contrastRatio(foreground, todayBar),
  contrastRatio(foreground, b),
  '≥ 3.00',
);
row('mark on the bar', contrastRatio(mark, todayBar), contrastRatio(mark, b), '≥ 3.00');
row('mark on the driving line', contrastRatio(mark, todayLink), contrastRatio(mark, l), '≥ 3.00');
row('mark on the minor line', contrastRatio(mark, minor), contrastRatio(mark, minor), '≥ 3.00');

out('\n## The ordering (ratio on the ground, bar over link)\n');
out('| Link | On ground today | On ground solved |\n| --- | --- | --- |');
out(
  `| \`--canvas-link\` | ${(contrastRatio(todayBar, ground) / contrastRatio(todayLink, ground)).toFixed(3)} | ${(contrastRatio(b, ground) / contrastRatio(l, ground)).toFixed(3)} |`,
);
out(
  `| \`--canvas-link-minor\` | ${(contrastRatio(todayBar, ground) / contrastRatio(minor, ground)).toFixed(3)} | ${(contrastRatio(b, ground) / contrastRatio(minor, ground)).toFixed(3)} |`,
);

out('\n## Hue separation (ΔE76, floor ≥ 5)\n');
out('| Link ink | vs solved bar | vs near-critical | vs critical |\n| --- | --- | --- | --- |');
for (const [name, c] of [
  ['--canvas-link', l],
  ['--canvas-link-minor', minor],
  ['--canvas-link-mark', mark],
] as const) {
  const d = (x: Srgb): string => deltaE76(c, x).toFixed(1);
  out(`| \`${name}\` | ${d(b)} | ${d(warning)} | ${d(critical)} |`);
}

out('\n## Reported, not fixed here\n');
const rungs: Array<[string, Oklch]> = [['--plot-warning', [0.528, 0.13, 62]]];
for (const [name, c] of rungs)
  out(
    `${name} ${css(c)} in sRGB gamut: ${oklchInGamut(...c)} (tolerance 1e-4); ratio on ground ${fmtRatio(
      ratio(today, '--canvas', '--warning'),
    )}`,
  );
const sources = [
  ['`--muted-foreground` on the ground', ratio(today, '--canvas', '--muted-foreground')],
] as const;
for (const [label, v] of sources) out(`${label}: ${fmtRatio(v)}`);
