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

/** The 18 tokens a surface family must supply, per ADR-0055 §1. */
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
  /* The eighteenth, added by ADR-0077 §9. The family had words for "this failed", "be careful"
     and "here is a fact", and none for "that worked" — so a success message on a scoped surface
     had to reach for the global `--success`, which is a solid BUTTON FILL that follows the page
     theme. On the theme-invariant login card that meant Dark's mint green on pinned white. The
     absence was the trap ADR-0055 §1 describes, sitting inside a family that read as complete. */
  '-success-text',
  '-warning-text',
  '-info-text',
  '-ring',
] as const;

const FAMILIES = ['chrome', 'panel', 'brand', 'auth'] as const;

/**
 * `brand` is the only family whose defining property is a **value** one: identical in Light, Dark
 * and Corporate, because a signed-out visitor cannot choose a theme and something else chooses one
 * for them (ADR-0077 §2).
 *
 * That property needs its own assertion, because the completeness sweep below **cannot see it**:
 * `themeTokens()` merges each theme over `:root`, so a member deleted from `.dark` is inherited and
 * reads as present. Verified by deleting `--brand-input` from the `.dark` block and watching
 * `token-architecture.test.ts` stay green. The plan for this milestone asserted the opposite — that
 * repeating the family per block is what the gate rests on — so this is the claim being checked
 * rather than trusted (ADR-0076 §19.9).
 */
describe('the brand family is theme-invariant, literally', () => {
  it.each(FAMILY_TOKENS)('declares --brand%s in all three theme blocks, identically', (suffix) => {
    const name = `--brand${suffix}`;
    const values = THEME_SELECTORS.map((selector) => declarations(blockBody(selector)).get(name));
    // Declared — not inherited — in each block.
    expect(values.filter((value) => value !== undefined)).toHaveLength(THEME_SELECTORS.length);
    expect(new Set(values).size).toBe(1);
  });
});

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
  '--success-text',
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
      // The public screens' ground (ADR-0077 M7). A gradient needs two stops and the 17-name
      // vocabulary has no word for the second one, so — like `--canvas` — it is a global pair
      // drawn BY the page rather than a name rebound within a scope.
      '--color-ground',
      '--color-ground-end',
    ]) {
      expect(theme.has(name), `${name} is missing from @theme inline`).toBe(true);
    }
  });
});

describe.each(THEME_SELECTORS)('%s declares complete surface families', (selector) => {
  const tokens = themeTokens(selector);

  it.each(FAMILIES)('the %s family has all 18 tokens', (family) => {
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

describe('the flag-keyed override layers are gone', () => {
  it.each(['data-designed-chrome', 'data-canvas-visual-language'])(
    'no [%s] value layer survives, in any form',
    (attribute) => {
      // **This assertion replaces two that were its opposite** (ADR-0097). ADR-0055 §6 put
      // flagged VALUES behind an attribute so a rollback stayed byte-for-byte for colour as
      // well as markup, and a second gate then had to pin that a theme-scoped layer restated
      // its global layer in full — because `[attr]` and `.dark` have equal specificity and the
      // later rule wins, so a scoped layer that forgot a token silently inherited Light's grey.
      //
      // Both are now meaningless: the values are folded into the one theme block, and there is
      // no second theme for a layer to shadow. The trap they guarded cannot be re-set — but a
      // layer could be re-added by someone reaching for the old pattern, so the gate inverts
      // rather than disappearing. It is also honest about what it does not cover: a flag that
      // gates STRUCTURE is untouched by this and always was.
      const forms = [`[${attribute}]`, ...THEME_SELECTORS.map((t) => `[${attribute}]${t}`)];
      const found = forms.filter(hasBlock);
      expect(
        found,
        `globals.css still declares ${found.join(', ')} — flagged token values were folded ` +
          'into the theme block by ADR-0097; a `VITE_` constant is inlined at build time and ' +
          'was never an operator rollback (ADR-0088).',
      ).toEqual([]);
    },
  );

  it('the values those layers held live in the theme block', () => {
    // The other half, and the reason the deletion above is safe to assert: `--chrome` and
    // `--panel` were the flag layers' subject, so finding them in the theme proves the fold
    // happened rather than that the layers were simply dropped. Without this, a commit that
    // deleted the layers and lost their values would pass the assertion above.
    const tokens = themeTokens(':root');
    for (const name of ['--chrome', '--panel', '--canvas', '--canvas-band']) {
      expect(tokens.get(name), `:root does not declare ${name}`).toBeDefined();
    }
  });
});

describe('the time-axis gridline tiers (tsld-toolbar-canvas-refinements F5)', () => {
  it.each(THEME_SELECTORS)('%s declares all three grid tokens, literally', (selector) => {
    const tokens = themeTokens(selector);
    for (const name of ['--canvas-grid-day', '--canvas-grid-month', '--canvas-grid-year']) {
      const value = tokens.get(name);
      expect(value, `${selector} does not declare ${name}`).toBeDefined();
      // Same reasoning as --field/--canvas: a var() alias here would resolve once against the
      // block it's declared in, and .dark/.corporate would silently inherit Light's grid.
      expect(value, `${selector} ${name} must be a literal colour, not ${value}`).not.toMatch(
        /var\(/,
      );
    }
  });

  it('maps all three into @theme inline, so the painter-facing tokens compile', () => {
    const theme = declarations(blockBody('@theme inline'));
    for (const name of [
      '--color-canvas-grid-day',
      '--color-canvas-grid-month',
      '--color-canvas-grid-year',
    ]) {
      expect(theme.has(name), `${name} is missing from @theme inline`).toBe(true);
    }
  });
});

describe('the retired token families are gone', () => {
  it.each(['--app-header', '--sidebar'])('%s has no declarations left', (prefix) => {
    // Both were replaced by a complete surface family. Leaving them declared invites a
    // future component to reach for a name that no longer participates in any scope.
    const css = readGlobalsCss().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(new RegExp(`${prefix}[a-z-]*\\s*:`));
  });
});
