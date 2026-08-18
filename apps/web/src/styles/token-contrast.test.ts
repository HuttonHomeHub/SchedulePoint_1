import { describe, expect, it } from 'vitest';

import { compositeOver, fmtRatio, parseColour, relativeLuminance, type Srgb } from '@/test/colour';
import { blockBody, declarations, hasBlock, THEME_SELECTORS, themeTokens } from '@/test/css-blocks';

/**
 * The computed contrast matrix (ADR-0055 §2).
 *
 * Every defect this epic fixes shipped past a human reviewer, a component reviewer and an
 * axe suite. None of them could have caught it: the class names were right, and axe only
 * ever scanned the default theme in its default surface. So the gate has to *compute* —
 * resolve each token the way the cascade would, and check the pair.
 *
 * Runs over 3 themes × 3 surface scopes × 2 flag states. The flag layers are empty today,
 * which means the flagged milestones (S3's light rail, S4's cream canvas) get their contrast
 * checked the moment they add a value, without anyone remembering to extend this file.
 */

type Scope = 'page' | 'chrome' | 'panel' | 'brand' | 'auth';
const SCOPES: Scope[] = ['page', 'chrome', 'panel', 'brand', 'auth'];

const FLAG_ATTRIBUTES = ['data-designed-chrome', 'data-canvas-visual-language'] as const;

/**
 * The flag layers that apply to a theme, in cascade order: the global layer first, then the
 * theme-scoped one (`[attr].corporate`), which has the higher specificity and therefore wins.
 * Absent layers are skipped — a flag whose values are Corporate-only (S3's light rail) has no
 * global block at all.
 */
function flagLayersFor(theme: (typeof THEME_SELECTORS)[number]): string[] {
  const suffix = theme === ':root' ? '' : theme;
  return FLAG_ATTRIBUTES.flatMap((attribute) =>
    [`[${attribute}]`, suffix ? `[${attribute}]${suffix}` : ''].filter(
      (selector) => selector !== '' && hasBlock(selector),
    ),
  );
}

/**
 * Resolve the tokens a component would actually see, given a theme, a surface scope and
 * whether the flagged value layers are applied — i.e. replay the cascade by hand.
 */
function resolve(
  theme: (typeof THEME_SELECTORS)[number],
  scope: Scope,
  flagsOn: boolean,
): Map<string, string> {
  const tokens = new Map(themeTokens(theme));
  if (flagsOn) {
    for (const layer of flagLayersFor(theme)) {
      for (const [name, value] of declarations(blockBody(layer))) tokens.set(name, value);
    }
  }
  if (scope === 'page') return tokens;

  for (const [name, value] of declarations(blockBody(`[data-surface='${scope}']`))) {
    const source = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
    const resolved = source === undefined ? value : tokens.get(source);
    if (resolved === undefined) throw new Error(`${scope} rebinds ${name} to an unknown ${value}`);
    tokens.set(name, resolved);
  }
  return tokens;
}

/** The opaque fill a scope paints, used as the backdrop for any translucent ink. */
function fillOf(tokens: Map<string, string>): Srgb {
  const background = tokens.get('--background');
  if (background === undefined) throw new Error('no --background');
  return compositeOver(parseColour(background), [1, 1, 1]);
}

function ratio(tokens: Map<string, string>, fillToken: string, inkToken: string): number {
  const fillValue = tokens.get(fillToken);
  const inkValue = tokens.get(inkToken);
  if (fillValue === undefined) throw new Error(`${fillToken} is not declared`);
  if (inkValue === undefined) throw new Error(`${inkToken} is not declared`);
  const surface = fillOf(tokens);
  const fill = compositeOver(parseColour(fillValue), surface);
  const ink = compositeOver(parseColour(inkValue), fill);
  const a = relativeLuminance(fill);
  const b = relativeLuminance(ink);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Text pairs — WCAG 1.4.3 Contrast (Minimum), 4.5:1. */
const TEXT_PAIRS: ReadonlyArray<readonly [fill: string, ink: string, why: string]> = [
  ['--background', '--foreground', 'body text on the surface'],
  ['--background', '--muted-foreground', 'secondary text on the surface'],
  ['--background', '--destructive-text', 'an error message on the surface'],
  ['--background', '--success-text', 'a success message on the surface'],
  ['--background', '--warning-text', 'a warning message on the surface'],
  ['--background', '--info-text', 'an informational message on the surface'],
  ['--accent', '--accent-foreground', 'a hovered or selected row'],
  ['--primary', '--primary-foreground', 'the label of a primary button'],
  // **The hovered fills, and the reason they are tokens.** `hover:bg-destructive/90` composited
  // against the page rather than resolving to a value, so it was invisible here — this suite
  // reads tokens and an alpha utility is not one. It lightened the fill toward a white page and
  // took the label to 4.32:1: a live 1.4.3 failure on every Delete button, shipped, in the
  // default theme. It also sat in the one place neither gate reaches, because
  // `e2e-designed-ui/designed-ui.spec.ts` says in its own docblock that axe measures no hover
  // state. Asserting the pair is the fix; changing the colour is only how the pair passes.
  ['--destructive-hover', '--destructive-foreground', 'the label of a hovered destructive button'],
  ['--destructive', '--destructive-foreground', 'the label of a destructive button at rest'],
  ['--secondary', '--secondary-foreground', 'the label of a secondary button'],
  ['--field', '--field-foreground', 'what a user types into an input'],
  // The pair nobody had ever checked, and the reason `--field-muted-foreground` exists: a
  // placeholder sits on the FIELD fill, not on the surface. On navy chrome the surface grey
  // is light (validated against navy) and the field is white — 2:1, invisible. A placeholder
  // belongs to the field's colour system, so it gets its own token per surface.
  ['--field', '--field-muted-foreground', 'placeholder text inside an input'],
  // The solid status fills. Nothing pairs them as a fill+label TODAY — `badge.tsx` uses an alpha
  // wash plus the `-text` variant, and documents why. But `@theme inline` compiles
  // `bg-warning text-warning-foreground`, so the pairing is one autocomplete away, and an
  // unasserted-but-available token pair is exactly the trap this suite exists to remove.
  ['--muted', '--muted-foreground', 'secondary text on a muted block'],
  // **A read-only grid cell, and the trap ADR-0083 found going the other way.** A gated field is
  // read-only rather than `disabled`, so the reader can still read the value — which REMOVES the
  // 1.4.3 exemption `disabled:opacity-50` currently relies on. The treatment therefore dims the
  // CHROME and never the VALUE: the cell fill drops to `--muted` while the text stays
  // `--foreground`. This pair is asserted BEFORE the CSS that needs it exists (M2-T4), because a
  // pair added afterwards is a pair that shipped unchecked.
  [
    '--muted',
    '--foreground',
    'the value in a read-only field, whose chrome is dimmed and text is not',
  ],
  ['--success', '--success-foreground', 'the label of a solid success fill'],
  ['--warning', '--warning-foreground', 'the label of a solid warning fill'],
  ['--info', '--info-foreground', 'the label of a solid info fill'],
];

/** Non-text pairs — WCAG 1.4.11 Non-text Contrast, 3:1. */
const NON_TEXT_PAIRS: ReadonlyArray<readonly [fill: string, ink: string, why: string]> = [
  ['--background', '--ring', 'the focus indicator against the surface it sits on'],
  ['--background', '--primary', 'a primary button against the surface'],
  // **`--destructive` against the surface is deliberately NOT asserted here, and the reason is a
  // finding rather than an exemption.** It would fail: 2.92:1 at rest and 2.90:1 hovered, in the
  // scoped surfaces. That is because `--destructive` is not a rebound name, so inside a scope it
  // keeps the page's red while `--background` becomes navy — the ADR-0055 §"a family is complete or
  // it is a trap" shape, and the same one already recorded for `--secondary`.
  //
  // It is latent, not live: the destructive variant renders in `ConfirmDialog` (a modal `<dialog>`,
  // which the browser puts in the top layer, on page tokens) and in `BulkSelectionBar`. Asserting
  // it would therefore pin a pairing the product does not currently make, and the fix — whether
  // `--destructive` joins the rebound family — is a vocabulary decision that belongs to the
  // design-system rewrite (ADR-0097), not to a hover-contrast fix. Raised there; recorded here so
  // the absence reads as a decision rather than an oversight.
  // `--input` is NOT covered by the decorative-border exemption below, and conflating the two
  // is how it went unnoticed at 1.26:1 in every theme. `--field` is valued identically to the
  // surface it sits on by design, so this outline is the ONLY thing that says a text field is
  // there — 1.4.11's central example. Both directions are checked because the token draws the
  // boundary of a filled control (`input`, `textarea`, `select`) and of an `outline` Button,
  // which sits on the page fill rather than a field fill.
  ['--field', '--input', 'the outline of a text field against its own fill'],
  ['--background', '--input', 'the outline of an outline-variant control on the surface'],
  // **The Gantt's dependency arrows (M4).** A link line is not decoration: it is the only graphical
  // carrier of "this activity waits for that one", so 1.4.11 applies and the decorative-border
  // exemption above does not. Asserted BEFORE the CSS that draws them exists — the ADR-0083
  // ordering, and the same discipline the read-only field pair took, because a pair added after the
  // fact is a pair that shipped unchecked.
  //
  // Two pairs, not one. A link crosses the chart's own ground AND, when it passes behind a row the
  // reader has selected, the accent fill — and `--accent` is a different value from `--background`
  // in every theme, so a line validated only against the page would be the thing that vanishes on
  // exactly the row somebody is looking at.
  ['--background', '--muted-foreground', 'a dependency arrow against the chart ground'],
  ['--accent', '--muted-foreground', 'a dependency arrow crossing the selected row'],
  // **The Gantt's constraint badge (M5).** A small mark beside a bar saying "this activity is
  // pinned", which sustains awareness after the one-per-session note that explained the moment is
  // gone. It is a graphical object carrying meaning, so 1.4.11 applies — its own pair rather than
  // riding in on the arrows', which is the precedent those tokens set one milestone earlier, and
  // asserted BEFORE the CSS exists.
  ['--background', '--warning-text', 'a constraint badge against the chart ground'],
  ['--accent', '--warning-text', 'a constraint badge on the selected row'],
];

describe.each(THEME_SELECTORS)('%s', (theme) => {
  describe.each([false, true])('flag layers applied: %s', (flagsOn) => {
    describe.each(SCOPES)('%s surface', (scope) => {
      const tokens = resolve(theme, scope, flagsOn);

      it.each(TEXT_PAIRS)('%s / %s — %s — is legible (≥ 4.5:1)', (fill, ink, _why) => {
        const value = ratio(tokens, fill, ink);
        expect(
          value,
          `${fill} vs ${ink} is ${fmtRatio(value)}, needs 4.5:1`,
        ).toBeGreaterThanOrEqual(4.5);
      });

      it.each(NON_TEXT_PAIRS)('%s / %s — %s — is perceivable (≥ 3:1)', (fill, ink, _why) => {
        const value = ratio(tokens, fill, ink);
        expect(value, `${fill} vs ${ink} is ${fmtRatio(value)}, needs 3:1`).toBeGreaterThanOrEqual(
          3,
        );
      });

      it('reports the decorative border ratio without asserting it', () => {
        // Deliberately unasserted, and the reason is written down so the next person does not
        // read a missing assertion as an oversight and "fix" it: WCAG 1.4.11 exempts purely
        // decorative separators, and our dividers never carry meaning on their own — the
        // surfaces either side already differ. Dark writes them at 10% alpha, which would fail
        // a 3:1 rule that was never meant to apply. Reported so a REGRESSION is still visible
        // in the test output.
        const value = ratio(tokens, '--background', '--border');
        expect(value).toBeGreaterThan(1);
      });
    });
  });
});

describe.each(THEME_SELECTORS)('%s — adjacent surfaces', (theme) => {
  describe.each([false, true])('flag layers applied: %s', (flagsOn) => {
    /**
     * How far a surface stands off the page it sits beside — a number `globals.css` quotes in
     * prose ("the rail sits at 1.09:1 against the page") and, until now, nothing computed. A
     * comment asserting a ratio no test recomputes is the same failure this epic exists to
     * close, one level up: the next edit to `--panel` or `--background` could drift it silently
     * and the file would still claim the old figure.
     *
     * Reported, not asserted, and deliberately: 1.4.11 exempts a decorative surface boundary,
     * every scope keeps a real `border-r`/`border-b` rather than relying on the fill difference,
     * and the design WANTS these close. What the suite owes is the number, not a threshold.
     */
    it.each(['chrome', 'panel', 'brand'] as const)('%s vs the page fill', (scope) => {
      const page = fillOf(resolve(theme, 'page', flagsOn));
      const surface = fillOf(resolve(theme, scope, flagsOn));
      const a = relativeLuminance(page);
      const b = relativeLuminance(surface);
      const value = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      // eslint-disable-next-line no-console
      console.log(`[ADR-0055 §2] ${theme} flags=${flagsOn} — ${scope} vs page: ${fmtRatio(value)}`);
      expect(value).toBeGreaterThanOrEqual(1);
    });
  });
});
