/**
 * NetPoint grammar M0-T1 and M0-T2: what the canvas measures today, and what the new tokens must
 * be. (`docs/specs/netpoint-grammar/`, conditions FC-G2 and FC-G3.)
 *
 * Run: `pnpm exec tsx scripts/solve-netpoint-grammar.ts` from `apps/web`.
 *
 * **Reported, never gated.** This script chooses values. `token-contrast.test.ts` is the gate that
 * later holds them, and it verifies each pair red before the painter reads the token (M0-T3). A
 * solver that asserted its own answers would agree with itself.
 *
 * **Today's figures come from the gate's own resolver** (`src/test/scope-tokens.ts`), not from a
 * copy of it. A copy of an instrument measures the copy (ADR-0124). It extracts both today's
 * resolved tokens and the ratio function the gate uses.
 *
 * **A candidate out of the sRGB gamut is refused, not clamped.** A clamped value renders as a
 * colour nobody wrote down, so its ratio describes nothing (`oklchInGamut`).
 */
import {
  contrastRatio,
  deltaE76,
  fmtRatio,
  oklchInGamut,
  oklchToSrgb,
  parseColour,
  relativeLuminance,
  type Srgb,
} from '../src/test/colour';
import { ratio, resolve } from '../src/test/scope-tokens';

/** Print a line of the report. `process.stdout` rather than `console`, per the repo lint rule. */
const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

type Oklch = readonly [L: number, C: number, H: number];
const css = ([L, C, H]: Oklch): string => `oklch(${+L.toFixed(3)} ${+C.toFixed(3)} ${H})`;
const rgb = (c: Oklch): Srgb => oklchToSrgb(...c);

function srgbOf(value: string): Srgb {
  const parsed = parseColour(value);
  if (parsed.alpha !== 1)
    throw new Error(`${value} is translucent; the solver takes opaque inks only`);
  return parsed.srgb;
}

/**
 * The lightness at a fixed hue and chroma whose contrast against `ground` is closest to `target`,
 * on the requested side of the ground, searched in steps of 0.001. Throws if no in-gamut value
 * reaches the target: a solver that returned the nearest miss would hide the one fact it exists to
 * report.
 */
function solveL(
  C: number,
  H: number,
  ground: Srgb,
  target: number,
  side: 'darker' | 'lighter',
): Oklch {
  let best: Oklch | null = null;
  let bestErr = Infinity;
  for (let i = 0; i <= 1000; i += 1) {
    const L = i / 1000;
    if (!oklchInGamut(L, C, H)) continue;
    const c: Oklch = [L, C, H];
    const darker = relativeLuminance(rgb(c)) < relativeLuminance(ground);
    if ((side === 'darker') !== darker) continue;
    const err = Math.abs(contrastRatio(rgb(c), ground) - target);
    if (err < bestErr) {
      bestErr = err;
      best = c;
    }
  }
  if (best === null || bestErr > 0.02) {
    throw new Error(
      `no in-gamut L at C ${C} H ${H} reaches ${target}:1 (${side}); nearest err ${bestErr}`,
    );
  }
  return best;
}

/** The lightest in-gamut value, at a fixed hue and chroma, that still clears `floor` on every ground. */
function lightestClearing(C: number, H: number, grounds: Srgb[], floor: number): Oklch {
  for (let i = 1000; i >= 0; i -= 1) {
    const L = i / 1000;
    if (!oklchInGamut(L, C, H)) continue;
    const c: Oklch = [L, C, H];
    if (grounds.every((g) => contrastRatio(rgb(c), g) >= floor)) return c;
  }
  throw new Error(`nothing at C ${C} H ${H} clears ${floor}:1 on every ground`);
}

const today = resolve(':root', 'canvas');
const need = (name: string): string => {
  const v = today.get(name);
  if (v === undefined) throw new Error(`${name} is not declared in the canvas scope`);
  return v;
};

// ─── M0-T1: the brief's ratios, recomputed ────────────────────────────────────────────────────
const briefRows: Array<[string, string, string]> = [
  ['day rule on the ground', '--canvas', '--canvas-grid-day'],
  ['month rule on the ground', '--canvas', '--canvas-grid-month'],
  ['year rule on the ground', '--canvas', '--canvas-grid-year'],
  ['non-driving link on the ground', '--canvas', '--canvas-link-minor'],
  ['bar (`--primary`) on the ground', '--canvas', '--primary'],
  ['critical on the ground', '--canvas', '--destructive'],
  ['near-critical on the ground', '--canvas', '--warning'],
  ['month rule vs non-driving link', '--canvas-grid-month', '--canvas-link-minor'],
  ['bar vs non-driving link', '--primary', '--canvas-link-minor'],
  ['bar vs driving link (both `--primary`)', '--primary', '--primary'],
  ['non-working wash on the ground', '--canvas', '--canvas-nonworking'],
  ['band on the ground', '--canvas', '--canvas-band'],
  ['lane rule on the ground', '--canvas', '--canvas-lane-rule'],
];
out('## M0-T1 — measured before M1 (canvas scope, today)\n');
out('| Pair | Ratio |\n| --- | --- |');
for (const [label, fill, ink] of briefRows)
  out(`| ${label} | ${fmtRatio(ratio(today, fill, ink))} |`);

// ─── M0-T2: solve against the near-white ground (CQ-2) ────────────────────────────────────────
const GROUND: Oklch = [0.995, 0.002, 250];
const g = rgb(GROUND);
const print = srgbOf(resolve(':root', 'print').get('--print') ?? 'oklch(1 0 0)');

// The quiet surfaces keep today's separations, taken darker than the new ground (A-n3: the band
// inverts, because nothing can be lighter than near-white).
const sep = (ink: string): number => ratio(today, '--canvas', ink);
const band = solveL(0.003, 250, g, sep('--canvas-band'), 'darker');
const nonworking = solveL(0.004, 250, g, sep('--canvas-nonworking'), 'darker');
const laneRule = solveL(0.003, 250, g, sep('--canvas-lane-rule'), 'darker');
const b = rgb(band);

// Grid ceilings (FC-G2): unit and month ≤ 1.80, year ≤ 2.50. Targets sit inside each ceiling with
// the tiers still ordered, so a coarser boundary still wins at a coincident x (ADR-0056 §2).
const gridDay = solveL(0.003, 250, g, 1.15, 'darker');
const gridMonth = solveL(0.005, 250, g, 1.5, 'darker');
const gridYear = solveL(0.008, 250, g, 2.0, 'darker');

// The ladder that stays: near-critical and critical keep their values; the bar is re-hued beside them.
const warning = srgbOf(need('--warning'));
const critical = srgbOf(need('--destructive'));
const labelInk = srgbOf(need('--primary-foreground'));

// The bar (`--canvas-bar`): the lightest green that clears 3:1 on the ground and the band with a
// 0.1 margin, and then the ladder and label conditions are checked, not assumed.
const BAR_C = 0.13;
const BAR_H = 150;
const bar = lightestClearing(BAR_C, BAR_H, [g, b], 3.1);

// The links (violet, CQ-4). Minor: the lightest that clears 3:1 on ground, band and print with a
// 0.2 margin — quietness comes from weight (spec R10). Driving: darker, clearing 4.0. Mark: dark
// enough to clear 3:1 on the minor AND the driving line, and on the ground.
const LINK_H = 295;
const linkMinor = lightestClearing(0.09, LINK_H, [g, b, print], 3.2);
const linkDriving = lightestClearing(0.13, LINK_H, [g, b, print], 4.0);
const linkMark = lightestClearing(0.13, LINK_H, [g, rgb(linkMinor), rgb(linkDriving)], 3.0);

const rows: Array<[string, Oklch]> = [
  ['--canvas', GROUND],
  ['--canvas-band', band],
  ['--canvas-nonworking', nonworking],
  ['--canvas-lane-rule', laneRule],
  ['--canvas-grid-day', gridDay],
  ['--canvas-grid-month', gridMonth],
  ['--canvas-grid-year', gridYear],
  ['--canvas-bar', bar],
  ['--canvas-link', linkDriving],
  ['--canvas-link-minor', linkMinor],
  ['--canvas-link-mark', linkMark],
];
out('\n## M0-T2 — solved values (ground `oklch(0.995 0.002 250)`)\n');
out('| Token | Value | On ground | On band | On print |\n| --- | --- | --- | --- | --- |');
for (const [name, c] of rows) {
  const on = (x: Srgb): string => fmtRatio(contrastRatio(rgb(c), x));
  out(`| \`${name}\` | \`${css(c)}\` | ${on(g)} | ${on(b)} | ${on(print)} |`);
}

const checks: Array<[string, number, string]> = [
  ['bar vs near-critical (neighbour floor ≥ 1.50)', contrastRatio(rgb(bar), warning), '≥ 1.50'],
  ['near-critical vs critical (unchanged)', contrastRatio(warning, critical), '≥ 1.50'],
  ['near-critical on the new ground', contrastRatio(warning, g), '≥ 3.00'],
  ['critical on the new ground', contrastRatio(critical, g), '≥ 3.00'],
  ['label ink `--primary-foreground` on the bar', contrastRatio(labelInk, rgb(bar)), '≥ 4.50'],
  ['mark on the minor line', contrastRatio(rgb(linkMark), rgb(linkMinor)), '≥ 3.00'],
  ['mark on the driving line', contrastRatio(rgb(linkMark), rgb(linkDriving)), '≥ 3.00'],
  ['mark on the ground', contrastRatio(rgb(linkMark), g), '≥ 3.00'],
  ['critical mark on the critical line (darker step)', 0, 'see note'],
  ['month rule vs minor link', contrastRatio(rgb(gridMonth), rgb(linkMinor)), 'reported'],
  ['bar vs minor link (luminance)', contrastRatio(rgb(bar), rgb(linkMinor)), 'reported'],
  ['gap-label text (minor ink) on the ground chip', contrastRatio(rgb(linkMinor), g), '≥ 4.50'],
  ['gap-label text (mark ink) on the ground chip', contrastRatio(rgb(linkMark), g), '≥ 4.50'],
];
out('\n## M0-T2 — the constraints, checked\n');
out('| Check | Value | Bar |\n| --- | --- | --- |');
for (const [label, value, bar] of checks)
  out(`| ${label} | ${value === 0 ? '—' : fmtRatio(value)} | ${bar} |`);

// Critical mark: the darkest a mark can be is black. Report whether a darker step can clear 3:1 on
// the critical line at all.
const black: Srgb = [0, 0, 0];
out(
  `\nBlack on the critical line: ${fmtRatio(contrastRatio(black, critical))}. ` +
    `Black on the near-critical line: ${fmtRatio(contrastRatio(black, warning))}.`,
);

out('\n## FC-G3 — hue separation (ΔE76, floor ≥ 5)\n');
out('| Link ink | vs bar | vs near-critical | vs critical |\n| --- | --- | --- | --- |');
for (const [name, c] of [
  ['--canvas-link', linkDriving],
  ['--canvas-link-minor', linkMinor],
  ['--canvas-link-mark', linkMark],
] as const) {
  const d = (x: Srgb): string => deltaE76(rgb(c), x).toFixed(1);
  out(`| \`${name}\` | ${d(rgb(bar))} | ${d(warning)} | ${d(critical)} |`);
}
