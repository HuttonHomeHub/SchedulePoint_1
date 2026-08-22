import { describe, expect, it } from 'vitest';

import { PRINT_TOKEN_SOURCES } from './palette';

import { compositeOver, fmtRatio, parseColour, relativeLuminance, type Srgb } from '@/test/colour';
import {
  blockBody,
  declarations,
  readGlobalsCss,
  themeTokens,
  THEME_SELECTORS,
} from '@/test/css-blocks';

/**
 * **Paper is light, and it is light because it is declared light** (TECH_DEBT #158).
 *
 * The defect this replaces: `resolvePrintPalette` resolved the print ground from the live
 * `--background`, so Graphite shipped an exported PNG/PDF and a printed programme carrying a
 * near-black diagram panel inside white paper chrome — confirmed by capturing the downloaded PNG,
 * not inferred from the token chain.
 *
 * **Why no test caught it.** Every export suite runs in jsdom, where `getComputedStyle` yields
 * nothing and the resolver takes its fallbacks — so they exercise the branch that is correct and
 * can never reach the branch that ships. This gate reads `globals.css` instead, replaying the
 * cascade the way `token-contrast.test.ts` does, which is the only way to see what the browser
 * would hand the export.
 *
 * **And why it is a gate rather than a comment.** The resolver used to force light by clearing a
 * `.dark` class; ADR-0097 removed the trick as unnecessary and left a note saying "if a dark theme
 * returns, this is one of the places that needs it back". ADR-0099 made the whole product dark two
 * days later. A correct comment naming its own trigger is not a gate — ADR-0058's rule in the one
 * form it keeps taking.
 *
 * Verified RED against the pre-fix tree, twice: with `ground`/`ink` reading `--background`/
 * `--foreground` the first assertion fails on the paper trio being surface-rebound, and against
 * Graphite's values the luminance assertion fails at 0.026.
 */

/**
 * Derived, never restated. An earlier draft hand-listed these six, which is a second roster of the
 * same facts — the very thing `PRINT_TOKEN_SOURCES`'s own docblock warns against, reproduced in
 * the file that consumes it. A paper field added to the table without being added here would have
 * gone ungated.
 */
const PAPER_FIELDS = (
  Object.keys(PRINT_TOKEN_SOURCES) as (keyof typeof PRINT_TOKEN_SOURCES)[]
).filter((field) => PRINT_TOKEN_SOURCES[field][0].startsWith('--print-'));

/** Replay the cascade for the canvas surface — the scope the export resolves the diagram from. */
function canvasScope(): Map<string, string> {
  const tokens = new Map(themeTokens(THEME_SELECTORS[0]));
  for (const [name, value] of declarations(blockBody("[data-surface='canvas']"))) {
    const source = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
    const resolved = source === undefined ? value : tokens.get(source);
    if (resolved === undefined) throw new Error(`canvas rebinds ${name} to an unknown ${value}`);
    tokens.set(name, resolved);
  }
  return tokens;
}

function srgb(value: string): Srgb {
  return compositeOver(parseColour(value), [1, 1, 1]);
}

function L(value: string): number {
  return relativeLuminance(srgb(value));
}

function ratio(a: string, b: string): number {
  const la = relativeLuminance(srgb(a));
  const lb = relativeLuminance(srgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('the print palette resolves light (structural)', () => {
  const tokens = canvasScope();
  const resolved = (field: keyof typeof PRINT_TOKEN_SOURCES): string => {
    const [name] = PRINT_TOKEN_SOURCES[field];
    const value = tokens.get(name);
    if (value === undefined) throw new Error(`${field} reads ${name}, which is not declared`);
    return value;
  };

  it('the paper fields read --print-* and nothing a surface can rebind', () => {
    // The load-bearing assertion. A paper field reading a page/surface token is exactly the
    // defect: it makes the deliverable's ground a function of the app's current theme.
    const wrong = PAPER_FIELDS.filter((f) => !PRINT_TOKEN_SOURCES[f][0].startsWith('--print-'));
    expect(
      wrong,
      `these paper fields do not read a --print-* token: ${wrong.join(', ')}.\n` +
        'Paper must be light by declaration, not by agreeing with whatever the screen is doing.',
    ).toEqual([]);
  });

  it('no scope OTHER than print rebinds a --print-* token', () => {
    // The other direction, and what makes the first assertion mean something: if another scope
    // could rebind these, "reads --print-*" would stop implying "is light".
    //
    // **Repaired rather than replaced when the print scope landed** (#163). The plan proposed
    // swapping it for "paper's background is a literal", which is a different property — and this
    // plan's own risk line says replacing an assertion is how a gate stops proving anything. It
    // went red only because the regex tested the whole block body while the print block has
    // `var(--print-*)` on the RIGHT-hand side; it now tests declaration NAMES, which is what it
    // always meant.
    const css = readGlobalsCss().replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders: string[] = [];
    for (const m of css.matchAll(/\[data-surface=['"]([a-z]+)['"]\]\s*\{([^}]*)\}/g)) {
      if (m[1] === 'print') continue;
      for (const name of declarations(m[2] ?? '').keys()) {
        if (name.startsWith('--print-')) offenders.push(`${m[1]}: ${name}`);
      }
    }
    expect(offenders, `a non-print scope rebinds paper: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the paper ground is light', () => {
    // Not "is white" — a warm paper stock would be fine. The property is that ink derived for
    // paper lands on something ink shows up on.
    const luminance = relativeLuminance(srgb(resolved('ground')));
    expect(luminance, `paper ground ${resolved('ground')} is not light`).toBeGreaterThan(0.7);
  });

  it('the title and subtitle inks clear 4.5:1 on the paper ground (WCAG 1.4.3)', () => {
    for (const field of ['ink', 'mutedInk'] as const) {
      const r = ratio(resolved('ground'), resolved(field));
      expect(r, `${field} on paper is ${fmtRatio(r)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every in-bar label clears 4.5:1 on the fill it is drawn on (WCAG 1.4.3)', () => {
    // The assertion that would have caught TECH_DEBT #158's own prescribed fix. Freezing the
    // palette to the pre-light-theme literals pairs white ink with the on-schedule fill at
    // 3.56:1 — the commonest bar in any programme — because those literals predate the
    // criticality ladder that derived the pairing.
    const pairs = [
      ['bar', 'labelInside'],
      ['critical', 'labelInsideCritical'],
      ['nearCritical', 'labelInsideNearCritical'],
      ['today', 'todayInk'],
    ] as const;
    for (const [fill, ink] of pairs) {
      const r = ratio(resolved(fill), resolved(ink));
      expect(r, `${ink} on ${fill} is ${fmtRatio(r)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the washes drawn across the paper stay tints of it, never dark areas', () => {
    // ONE of the holes the rest of this file would otherwise leave — this said "the hole" until
    // the deferred review, and the paper-vs-ink assertion below is the other. Pinning paper light
    // stops the GROUND going near-black, but the non-working wash, the month band and the day
    // gridline are AREAS chosen against a light ground and still resolved from the canvas scope. A
    // dark surface returning would paint them as near-black blocks on white paper.
    //
    // **What this cannot claim, established by sampling the exported PNG rather than reasoning:**
    // the export's scene sets neither `monthBands` nor `isWorkingDay`, so `paintScene` skips both
    // layers and every pixel outside a gridline or a bar comes out pure white today. These four
    // fields are gated but not currently reachable in the deliverable — a guard against the day
    // that gap is closed, not a description of what the artefact contains (TECH_DEBT #164).
    //
    // Deliberately NOT applied to `gridLineMonth`/`gridLineYear`: those are RULES, and are meant
    // to be mid-dark. Applying a lightness floor to them would gate the wrong property.
    for (const field of ['nonWorking', 'nonWorkingHatch', 'monthBand', 'gridLineDay'] as const) {
      const luminance = relativeLuminance(srgb(resolved(field)));
      expect(luminance, `${field} (${resolved(field)}) is not a tint of paper`).toBeGreaterThan(
        0.5,
      );
    }
  });

  it('every mark drawn straight onto paper clears its floor against the paper ground', () => {
    // **The second hole, and the one that matters most under a returned dark theme.** These are
    // painted directly onto `canvasGround`, which is now pinned light — while they themselves
    // still resolve from the canvas scope. Nothing else in this file pairs the two regimes, so
    // without this the build would break on the washes and stay green on an INVISIBLE criticality
    // outline. That outline exists precisely so criticality is not carried by colour alone
    // (WCAG 1.4.1), so losing it silently is worse than losing the wash.
    //
    // ADR-0097's completeness rule names this shape exactly: the defect is "a pair whose two
    // halves are governed by different scopes". Splitting paper from diagram created three such
    // pairs; this is what stops them being latent.
    const text = ['labelBeside', 'dataDate'] as const; // 4.5:1 — WCAG 1.4.3
    const marks = ['edge', 'outline', 'today', 'selection'] as const; // 3:1 — WCAG 1.4.11
    for (const field of text) {
      const r = ratio(resolved('canvasGround'), resolved(field));
      expect(r, `${field} on paper is ${fmtRatio(r)}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const field of marks) {
      const r = ratio(resolved('canvasGround'), resolved(field));
      expect(r, `${field} on paper is ${fmtRatio(r)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('each fallback still matches the token it stands in for', () => {
    // The fallbacks are a hand-computed second copy of every value in `globals.css`, and in
    // production they are dead code — `resolvePrintPalette` only ever runs against an attached,
    // styled element, so `getComputedStyle` always answers. Their only live consumers are the
    // jsdom unit suites, which assert against the literals: re-value a token and those suites go
    // on passing against a colour nothing renders with.
    //
    // Raised independently by two reviewers, and it is this commit's own finding one level down —
    // `PrintSurface.css` pinned three hexes by comment and they drifted. A comment is not a pin;
    // neither is a literal in a table. This is the pin.
    for (const field of Object.keys(PRINT_TOKEN_SOURCES) as (keyof typeof PRINT_TOKEN_SOURCES)[]) {
      const [, fallback] = PRINT_TOKEN_SOURCES[field];
      const live = relativeLuminance(srgb(resolved(field)));
      const stated = relativeLuminance(srgb(fallback));
      expect(
        Math.abs(live - stated),
        `${field}: fallback ${fallback} no longer matches ${resolved(field)}`,
      ).toBeLessThan(0.005);
    }
  });

  it('the three grounds keep their order, so a polarity flip fails rather than passing', () => {
    // **A lightness FLOOR cannot detect a polarity inversion**, which is why this exists beside
    // the floor above rather than instead of it: the band's luminance is 0.930 whether it sits
    // above or below its ground, so `> 0.5` is satisfied either way. #158's own fix moved the
    // paper ground to true white and inverted the band and the wash from lighter-than-ground to
    // darker — invisible to every assertion in this file at the time.
    //
    // The inversion is ACCEPTED (spec CQ-4): an alternating band carries no polarity meaning, and
    // light-grey bands on white is the printed convention. `--print` is `oklch(1 0 0)`, maximum
    // lightness, so nothing can be lighter than paper and no value could restore the screen's
    // order anyway. What is asserted is therefore the chain in its accepted direction, so a later
    // edit that flips one of them fails here instead of shipping.
    const ground = L(resolved('canvasGround'));
    const band = L(resolved('monthBand'));
    const wash = L(resolved('nonWorking'));
    const hatch = L(resolved('nonWorkingHatch'));
    expect(hatch, `hatch ${hatch} is not darker than the wash ${wash}`).toBeLessThan(wash);
    expect(wash, `wash ${wash} is not darker than the band ${band}`).toBeLessThan(band);
    expect(band, `band ${band} is not darker than paper ${ground}`).toBeLessThan(ground);
  });

  it('every mark clears its floor on ALL THREE grounds, not just paper', () => {
    // **There are three grounds, not two, and the wash is the one that was missed.** It paints
    // OPAQUELY over the band (`paint.ts:839` — `fillStyle` then `fillRect`, no `globalAlpha`), so
    // a mark inside a weekend column sits on 0.965 rather than on the band or on paper. Sweeping
    // paper alone asserted the easiest of the three and called it covered.
    //
    // `bar` is included deliberately: the criticality ladder was solved for "≥ 3:1 on the 0.958
    // diagram ground" and nothing had ever checked it against a paper ground. It is the narrowest
    // margin in the picture — 3.220:1 on the wash — so it is the one most likely to be broken by
    // an unrelated re-value, and it was the one nothing watched.
    //
    // **Measured, not reasoned:** moving `--plot-primary` to `oklch(0.665)` gives 3.03:1 on paper
    // and 2.83:1 on the band. A paper-only sweep passes that value; this one fails it. That is the
    // whole reason the sweep is three grounds rather than one.
    const grounds = [
      ['paper', resolved('canvasGround')],
      ['month band', resolved('monthBand')],
      ['non-working wash', resolved('nonWorking')],
    ] as const;
    const text = ['labelBeside', 'dataDate'] as const; // WCAG 1.4.3
    const marks = [
      'edge',
      'outline',
      'today',
      'selection',
      'bar',
      'critical',
      'nearCritical',
    ] as const; // 1.4.11
    for (const [label, ground] of grounds) {
      for (const field of text) {
        const r = ratio(ground, resolved(field));
        expect(r, `${field} on the ${label} is ${fmtRatio(r)}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const field of marks) {
        const r = ratio(ground, resolved(field));
        expect(r, `${field} on the ${label} is ${fmtRatio(r)}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('every diagram field the export reads resolves through the canvas scope', () => {
    // Totality: a field added to the palette without a token that resolves would silently take a
    // fallback in the browser too, which is how a colour ends up in a delivered PDF that nobody
    // chose. `resolved()` throws on an undeclared token, so this sweeps the whole roster.
    for (const field of Object.keys(PRINT_TOKEN_SOURCES) as (keyof typeof PRINT_TOKEN_SOURCES)[]) {
      expect(resolved(field), `${field} resolves to an empty value`).not.toBe('');
    }
  });

  it('the print stylesheet reads the same tokens rather than restating their values', () => {
    // `PrintSurface.css` carried hex literals under a comment claiming they were "PINNED to
    // resolvePrintPalette()'s own light fallbacks so the two can't drift". They had drifted.
    // One source, asserted.
    const css = readGlobalsCss();
    for (const name of ['--print', '--print-foreground', '--print-muted-foreground']) {
      expect(css, `${name} is not declared`).toContain(`${name}:`);
    }
  });
});
