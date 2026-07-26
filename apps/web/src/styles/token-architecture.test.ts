import { describe, expect, it } from 'vitest';

import {
  blockBody,
  declarations,
  hasBlock,
  readGlobalsCss,
  THEME_SELECTORS,
  themeTokens,
} from '@/test/css-blocks';

/**
 * Structural pins on the token vocabulary (ADR-0055 §1).
 *
 * These assert *shape*, not colour — that every surface family is complete in every theme,
 * that the families stay unreachable from Tailwind, and that the one CSS feature the whole
 * mechanism rests on is still present. `token-contrast.test.ts` is the sibling that checks
 * the values themselves.
 *
 * The reason both exist: every defect this epic fixes was invisible to a reviewer reading
 * class names. `text-muted-foreground` on a navy header looks correct in a diff. Only a
 * machine that resolves the token and computes the ratio catches it.
 */

/** The 17 tokens a surface family must supply, per ADR-0055 §1. */
const FAMILY_TOKENS = [
  '',
  '-foreground',
  /* A family that supplies `-muted-foreground` but no `-muted` for it to sit on is the same
     incompleteness trap in a new place: inside the Corporate chrome, `bg-muted` kept the PAGE's
     pale grey while its text followed the scope's light grey — 1.81:1. */
  '-muted',
  '-muted-foreground',
  '-border',
  /* `-input` is a SEPARATE token from `-border`, not a synonym for it: a divider is decoration
     (WCAG 1.4.11 exempts it), a control's outline identifies the control and must clear 3:1.
     They shared a value once, and every text field in every theme had a 1.26:1 outline. */
  '-input',
  '-accent',
  '-accent-foreground',
  '-primary',
  '-primary-foreground',
  '-field',
  '-field-foreground',
  '-field-muted-foreground',
  '-destructive-text',
  '-warning-text',
  '-info-text',
  '-ring',
] as const;

const FAMILIES = ['chrome', 'panel'] as const;

/** The exact rebind list each `[data-surface]` rule must carry — no more, no fewer. */
const REBOUND_NAMES = [
  '--background',
  '--foreground',
  '--muted',
  '--muted-foreground',
  '--border',
  '--input',
  '--accent',
  '--accent-foreground',
  '--primary',
  '--primary-foreground',
  '--field',
  '--field-foreground',
  '--field-muted-foreground',
  '--destructive-text',
  '--warning-text',
  '--info-text',
  '--ring',
] as const;

describe('@theme inline is load-bearing', () => {
  it('keeps the `inline` keyword', () => {
    // Without `inline`, Tailwind resolves each token to a computed value at :root and emits
    // that literal into every utility. Utilities would stop following the variable, so every
    // [data-surface] rebind below would silently do nothing and the whole design would revert
    // to page colours — with no error, no failing build, and a diff that looks like a tidy-up.
    expect(readGlobalsCss()).toMatch(/@theme\s+inline\s*\{/);
  });

  it('exposes no `--color-chrome-*` or `--color-panel-*` utility', () => {
    // `bg-chrome` must not compile. The scope component is the only route to these values;
    // if a utility existed, a page component could hand-apply a header colour and the
    // surface boundary would become a convention people forget rather than a structure.
    const theme = blockBody('@theme inline');
    for (const family of FAMILIES) {
      expect(theme).not.toMatch(new RegExp(`--color-${family}\\b`));
      expect(theme).not.toMatch(new RegExp(`--color-${family}-`));
    }
  });

  it('does expose the two global pairs the surfaces share', () => {
    const theme = declarations(blockBody('@theme inline'));
    for (const name of [
      '--color-field',
      '--color-field-foreground',
      '--color-canvas',
      '--color-canvas-band',
    ]) {
      expect(theme.has(name), `${name} is missing from @theme inline`).toBe(true);
    }
  });
});

describe.each(THEME_SELECTORS)('%s declares complete surface families', (selector) => {
  const tokens = themeTokens(selector);

  it.each(FAMILIES)('the %s family has all 17 tokens', (family) => {
    const missing = FAMILY_TOKENS.map((suffix) => `--${family}${suffix}`).filter(
      (name) => !tokens.has(name),
    );
    // Named individually: "a family is incomplete" is useless at 3am; "--chrome-muted-foreground
    // is missing" is the actual bug — that exact token's absence is what made every piece of
    // secondary header text reach for the page grey and vanish on navy.
    expect(missing, `${selector} is missing ${missing.join(', ')}`).toEqual([]);
  });

  it('declares the field and canvas pairs literally, not as var() aliases', () => {
    // A `var(--background)` alias here would be resolved once against the block it is
    // declared in and then inherit as a fixed value — .dark and .corporate would silently
    // inherit Light's white field (spec §4.7 D10).
    for (const name of ['--field', '--field-foreground', '--canvas', '--canvas-band']) {
      const value = tokens.get(name);
      expect(value, `${selector} does not declare ${name}`).toBeDefined();
      expect(value, `${selector} ${name} must be a literal colour, not ${value}`).not.toMatch(
        /var\(/,
      );
    }
  });
});

describe.each(FAMILIES)('the [data-surface="%s"] rule', (family) => {
  const rebinds = declarations(blockBody(`[data-surface='${family}']`));

  it('rebinds exactly the ADR-0055 §1 list', () => {
    expect([...rebinds.keys()].sort()).toEqual([...REBOUND_NAMES].sort());
  });

  it('points every rebind at its own family', () => {
    for (const [name, value] of rebinds) {
      expect(value, `${name} should read from --${family}-*`).toMatch(
        new RegExp(`^var\\(--${family}\\b`),
      );
    }
  });
});

describe('the flag-keyed override layers', () => {
  it.each(['data-designed-chrome', 'data-canvas-visual-language'])(
    '%s has a home, so a flagged value change never leaks into a theme block',
    (attribute) => {
      // Either a global layer or a theme-scoped one (`[attr].corporate`) — S3's light rail is
      // Corporate-only, so it takes the scoped form. What matters is that the flag's values
      // live behind the attribute rather than in the theme block, which is what makes the
      // rollback byte-for-byte for colour.
      const anyLayer = [
        `[${attribute}]`,
        ...THEME_SELECTORS.filter((t) => t !== ':root').map((t) => `[${attribute}]${t}`),
      ].some(hasBlock);
      expect(anyLayer, `no [${attribute}] layer found in globals.css`).toBe(true);
    },
  );
});

describe('a theme-scoped flag layer restates its global layer in full', () => {
  it.each(['data-designed-chrome', 'data-canvas-visual-language'])(
    '%s: every token the global layer declares is restated per theme',
    (attribute) => {
      if (!hasBlock(`[${attribute}]`)) return; // no global layer ⇒ nothing to shadow
      const global = [...declarations(blockBody(`[${attribute}]`)).keys()];
      for (const theme of THEME_SELECTORS.filter((t) => t !== ':root')) {
        const selector = `[${attribute}]${theme}`;
        // `[attr]` and `.dark` have EQUAL specificity and both match <html>, so the later rule
        // wins — the global layer overrides the theme block it sits after. A theme-scoped layer
        // that forgets a token therefore inherits the global layer's value, which is Light's.
        // The failure is silent and looks like a colour choice, so it is pinned rather than
        // trusted: a scoped layer must restate the global list in full, unchanged values included.
        const scoped = hasBlock(selector) ? declarations(blockBody(selector)) : new Map();
        const missing = global.filter((name) => !scoped.has(name));
        expect(missing, `${selector} does not restate ${missing.join(', ')}`).toEqual([]);
      }
    },
  );
});

describe('the retired token families are gone', () => {
  it.each(['--app-header', '--sidebar'])('%s has no declarations left', (prefix) => {
    // Both were replaced by a complete surface family. Leaving them declared invites a
    // future component to reach for a name that no longer participates in any scope.
    const css = readGlobalsCss().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(new RegExp(`${prefix}[a-z-]*\\s*:`));
  });
});
