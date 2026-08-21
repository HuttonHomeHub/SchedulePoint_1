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

const PAPER_FIELDS = [
  'ground',
  'canvasGround',
  'ink',
  'mutedInk',
  'dataDateInk',
  'handleHalo',
] as const;

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

  it('no surface scope rebinds a --print-* token', () => {
    // The other direction, and what makes the first assertion mean something: if a scope could
    // rebind these, "reads --print-*" would stop implying "is light".
    const css = readGlobalsCss().replace(/\/\*[\s\S]*?\*\//g, '');
    const scopeBlocks = [...css.matchAll(/\[data-surface=['"][a-z]+['"]\]\s*\{([^}]*)\}/g)]
      .map((m) => m[1] ?? '')
      .join('\n');
    expect(scopeBlocks).not.toMatch(/--print-/);
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
    // The hole the rest of this file would otherwise leave. Pinning paper light stops the GROUND
    // going near-black, but the non-working wash, the month band and the day gridline are AREAS
    // chosen against a light ground and still resolved from the canvas scope. A dark surface
    // returning would paint them as near-black blocks on white paper — the same defect one layer
    // in, and the deliverable would look broken in a way no bar-label ratio can see.
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
    for (const name of ['--print-ground', '--print-ink', '--print-muted-ink']) {
      expect(css, `${name} is not declared`).toContain(`${name}:`);
    }
  });
});
