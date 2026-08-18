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

describe('the auth scope earns its keep', () => {
  /** Perceptual distance between two OKLCH colours — ΔL plus the chroma vector difference. */
  function oklchDistance(a: string, b: string): number | null {
    const parse = (v: string): [number, number, number] | null => {
      const m = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/.exec(v.trim());
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const x = parse(a);
    const y = parse(b);
    if (!x || !y) return null;
    const toAb = ([, c, h]: [number, number, number]): [number, number] => [
      c * Math.cos((h * Math.PI) / 180),
      c * Math.sin((h * Math.PI) / 180),
    ];
    const [ax, bx] = toAb(x);
    const [ay, by] = toAb(y);
    return Math.hypot(x[0] - y[0], ax - ay, bx - by);
  }

  it('differs perceptibly from the page, or it is not a scope', () => {
    // **This assertion exists because the plan said to retire this scope and the measurement
    // said not to** (ADR-0097). ADR-0077 §2 pinned the login theme-invariant while the rest of
    // the product followed the theme; with one theme that argument distinguishes nothing, so
    // `auth` looked like a scope with no remaining reason. Measured, 12 of its 18 tokens differ
    // from their page counterparts by more than the ~0.02 OKLCH step at which a difference is
    // visible — led by `--auth-ring`, which ADR-0077 M7 derived from the old app's failing
    // 2.02:1 up to 3.01–3.36:1 to clear WCAG 1.4.11.
    //
    // So the scope survives on its VALUES rather than on its original reasoning, and this gate
    // is what keeps that honest: if a later change quietly aligns `auth` to the page, the scope
    // has genuinely become dead weight and should be retired deliberately — not left as 18
    // aliases that look like a design decision and are not one.
    const tokens = themeTokens(':root');
    const pairs: Array<[string, string]> = [
      ['--auth', '--background'],
      ['--auth-foreground', '--foreground'],
      ['--auth-field', '--field'],
      ['--auth-accent', '--accent'],
      ['--auth-ring', '--ring'],
      ['--auth-info-text', '--info-text'],
      ['--auth-success-text', '--success-text'],
      ['--auth-warning-text', '--warning-text'],
    ];

    const perceptible = pairs.filter(([authToken, pageToken]) => {
      const a = tokens.get(authToken);
      const b = tokens.get(pageToken);
      expect(a, `${authToken} is not declared`).toBeDefined();
      expect(b, `${pageToken} is not declared`).toBeDefined();
      const distance = oklchDistance(a!, b!);
      return distance !== null && distance >= 0.02;
    });

    expect(
      perceptible.length,
      'every sampled --auth-* token now matches its page counterpart, so the auth scope is ' +
        '18 aliases pretending to be a design decision — retire it deliberately or restore ' +
        'the values (ADR-0097).',
    ).toBeGreaterThanOrEqual(4);
  });

  it('keeps the focus ring ADR-0077 M7 derived for WCAG 1.4.11', () => {
    // Named on its own because it is the single largest delta (~0.39) and the one with a
    // success criterion behind it: a focus ring you cannot see looks exactly like a focus ring
    // you have not triggered, which is why the original 2.02:1 survived a human review.
    const tokens = themeTokens(':root');
    const distance = oklchDistance(tokens.get('--auth-ring')!, tokens.get('--ring')!);
    expect(distance, '--auth-ring has collapsed onto the page ring').toBeGreaterThan(0.1);
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
