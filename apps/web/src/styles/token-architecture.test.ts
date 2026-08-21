import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
describe('the brand family is declared, not inherited', () => {
  it.each(FAMILY_TOKENS)('declares --brand%s in every theme block', (suffix) => {
    // **This gate was "theme-invariant, literally" and went half-vacuous when the themes did**
    // (ADR-0097). It asserted that `--brand*` was declared identically in all THREE theme blocks;
    // with `THEME_SELECTORS` down to one entry, the identity half compared one value with itself
    // and passed for a reason unrelated to what its name claimed — the ADR-0090/0091 shape,
    // arriving through this epic's own door. Found by the architect re-reading its own plan.
    //
    // Re-pointed rather than deleted, because the OTHER half still proves something real: that
    // every member of the family is DECLARED in the block rather than inherited from an earlier
    // one. That is the completeness property ADR-0055 §1 rests on, and it is what would fail if
    // somebody trimmed the family down to the tokens the login happens to use today.
    //
    // The invariance half is dormant, not wrong: it becomes live again the moment a second theme
    // is added, and `THEME_SELECTORS` being a list rather than a constant is what makes it come
    // back automatically instead of needing to be remembered.
    const name = `--brand${suffix}`;
    const values = THEME_SELECTORS.map((selector) => declarations(blockBody(selector)).get(name));
    expect(values.filter((value) => value !== undefined)).toHaveLength(THEME_SELECTORS.length);
    // Still meaningful with one theme: pins that the family agrees across whatever blocks exist.
    expect(new Set(values).size).toBe(1);
  });
});

/**
 * Tokens deliberately OUTSIDE the closure, each for a reason that is not "we forgot".
 *
 * - **Resets** (ADR-0097 §1.5c). `--card` and `--popover` are not family members and not
 *   exceptions: they are surfaces in miniature, and the honest way to keep ADR-0055's promise
 *   that "a Card means the same thing everywhere" inside a rebinding world is for a Card to
 *   restore the page family for its subtree rather than to be governed by whichever scope it
 *   landed in.
 * - **Packs** (§1.3). A month band and three gridline tiers have no meaning on a header; a
 *   gradient's second stop has no sibling in the base vocabulary. Forcing every scope to declare
 *   them is tokens nobody can use and more chances to get a value wrong. The discriminator: if
 *   the thing has a semantic sibling in the base vocabulary, rebind it; if it does not, pack it.
 * - **Data vocabulary.** `--chart-*` is deliberately outside — ADR-0077 records that binding the
 *   login motif to chart tokens keeps the PAGE theme's values on a pinned panel, which is the
 *   failure being avoided rather than an oversight.
 */
const OUTSIDE_THE_CLOSURE = {
  resets: ['--card', '--card-foreground', '--popover', '--popover-foreground'],
  packs: [
    '--canvas',
    '--canvas-band',
    '--canvas-grid-day',
    '--canvas-grid-month',
    '--canvas-grid-year',
    '--canvas-nonworking-hatch',
    // The minimap rectangle's two-tone frame (ADR-0100 decision 9): the same discriminator
    // as the gridline tiers — a viewport frame has no meaning on a header and no semantic
    // sibling in the base vocabulary, and its contrast is gated by its OWN pairs
    // (MINIMAP_GROUNDS in token-contrast.test.ts), not by a scope's completeness.
    '--canvas-minimap-frame',
    '--canvas-minimap-frame-halo',
    '--ground',
    '--ground-end',
  ],
  data: ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'],
} as const;

/**
 * **The rebound family, COMPUTED rather than authored** (ADR-0097 §1.5).
 *
 * This used to be a hand-written array of 18 names, and it failed once per discovery: three
 * separate people found a token outside it — the chrome stub, then `--secondary`, then
 * `--destructive` — and each time the available answer was "add that one". A rule that fails
 * once per discovery is not a rule.
 *
 * So the family is derived from what a compiled utility can composite. Every unqualified colour
 * token `@theme inline` exposes becomes `bg-*` / `text-*` / `border-*`, so every one of them can
 * be painted on, or against, a scoped `--background` — which means every one of them is half of
 * a pair the scope governs, unless it is deliberately outside for one of the three reasons above.
 *
 * **Completeness stops being a count and becomes a property:** a scope is complete when no pair a
 * compiled utility can composite is split across two scopes. The count is now an output.
 *
 * **Its blind spot, stated:** this is what a utility CAN compile, not what the product DOES
 * render, so it is a superset and governs pairs nobody makes. That is the correct direction to be
 * wrong in — a governed pair nobody renders costs three lines of CSS; an ungoverned pair somebody
 * renders costs a WCAG failure nobody can see coming.
 */
function computeReboundNames(): string[] {
  const theme = blockBody('@theme inline');
  const exposed = [...theme.matchAll(/--color-[\w-]+\s*:\s*var\((--[\w-]+)\)/g)].map(
    (match) => match[1]!,
  );
  const excluded = new Set<string>([
    ...OUTSIDE_THE_CLOSURE.resets,
    ...OUTSIDE_THE_CLOSURE.packs,
    ...OUTSIDE_THE_CLOSURE.data,
  ]);
  return [...new Set(exposed)].filter((name) => !excluded.has(name)).sort();
}

const REBOUND_NAMES = computeReboundNames();

describe('the theme contract', () => {
  it('every theme block declares the whole page family, literally', () => {
    // **The gate that keeps ADR-0097 §1.5a honest the day a second theme returns.**
    //
    // The page family works today because `:root` and any theme class both match `<html>`, so an
    // alias like `--background: var(--page-background)` resolves against the same element that
    // declares the source. Measured in Chromium, not assumed — the rule this replaces claimed the
    // opposite, and it is right only for a theme applied to a DESCENDANT, which this product never
    // does.
    //
    // A second theme block is still on `<html>`, so it must restate the page family LITERALLY. Set
    // only `--page-background` and it works; set only `--background` and the alias is shadowed
    // while everything beneath it silently keeps the first theme's values — a whole family wrong,
    // with nothing failing. That is the failure this asserts against, from day one rather than
    // from the day it bites.
    //
    // With one theme it checks `:root`'s own completeness, which is worth having on its own: the
    // family is the thing every scope rebinds out of, so a missing member is a scope with nothing
    // to restore from.
    for (const selector of THEME_SELECTORS) {
      const declared = declarations(blockBody(selector));
      const missing = REBOUND_NAMES.filter((name) => {
        const pageToken = `--page-${name.slice(2)}`;
        const value = declared.get(pageToken);
        return value === undefined || /^var\(/.test(value.trim());
      });
      expect(
        missing,
        `${selector} does not declare these page-family tokens literally: ${missing.join(', ')}`,
      ).toEqual([]);
    }
  });

  it('the unqualified names alias the family rather than restating it', () => {
    // The other direction. If a name were declared literally in BOTH places they could drift, and
    // the drift would be invisible — two identical colours today, two different ones after one
    // edit. One source, one alias.
    const declared = declarations(blockBody(':root'));
    const restated = REBOUND_NAMES.filter((name) => {
      const value = declared.get(name);
      return value !== undefined && !/^var\(--page-/.test(value.trim());
    });
    expect(
      restated,
      `these should alias --page-*, not restate a value: ${restated.join(', ')}`,
    ).toEqual([]);
  });
});

describe('the rebound family is a closure, not a list', () => {
  it('every exposed colour token is either rebound or deliberately outside', () => {
    // The assertion that makes the derivation trustworthy: a token added to `@theme inline`
    // lands in the family automatically, and a token that should NOT be in the family has to be
    // named in `OUTSIDE_THE_CLOSURE` with a reason. There is no third option, which is exactly
    // what the hand-written array allowed.
    const theme = blockBody('@theme inline');
    const exposed = new Set(
      [...theme.matchAll(/--color-[\w-]+\s*:\s*var\((--[\w-]+)\)/g)].map((m) => m[1]!),
    );
    const accounted = new Set([
      ...REBOUND_NAMES,
      ...OUTSIDE_THE_CLOSURE.resets,
      ...OUTSIDE_THE_CLOSURE.packs,
      ...OUTSIDE_THE_CLOSURE.data,
    ]);
    const orphans = [...exposed].filter((name) => !accounted.has(name));
    expect(orphans, `unaccounted colour tokens: ${orphans.join(', ')}`).toEqual([]);
  });

  it('pulls in the status fills three people found one at a time', () => {
    // Named explicitly, because they are the evidence the closure is worth having: each was
    // discovered separately and added by hand. Measured against the navy scopes they were
    // 2.47:1 (destructive) and 1.34:1 (secondary, info) before this landed.
    for (const name of ['--destructive', '--secondary', '--info', '--success', '--warning']) {
      expect(REBOUND_NAMES, `${name} is not in the computed family`).toContain(name);
    }
  });
});

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

/**
 * **The `canvas` scope, which is deliberately NOT in `FAMILIES`** (ADR-0097 Landing E, L1).
 *
 * The other four scopes rebind onto their own `--<family>-*` value set, and the gate above asserts
 * that prefix. `canvas` cannot use one, and the reason is a genuine collision rather than a
 * shortcut: `--canvas` and `--canvas-band` already exist as the **PLOT pack**, are deliberately
 * exposed in `@theme inline` so `bg-canvas` compiles and the painter can read
 * `--color-canvas-band`, and the sweep at "no family leaks into @theme inline" asserts that
 * `--color-<family>-` is ABSENT. Adding `canvas` there would make two assertions in this file
 * contradict each other.
 *
 * So at L1 the scope rebinds every closure name onto the **page's** values, plus `--background`
 * onto the ground the container already painted. That is byte-identical arrival by construction:
 * the painter reads the same numbers it read yesterday, and only the element it reads them from
 * has moved. The values are L4-1, in their own commit, so a reader can see which change moved a
 * colour — and that is when the scope earns a value set of its own and joins `FAMILIES`.
 *
 * Completeness is still asserted, because it is the property that matters and it is independent of
 * where the values come from: no pair a compiled utility can composite may be split across two
 * scopes, and the ADR-0092 dock, the create popover and the bulk-selection bar are all DOM inside
 * this container.
 */
describe("the [data-surface='canvas'] rule", () => {
  const rebinds = declarations(blockBody("[data-surface='canvas']"));

  it('rebinds exactly the closure, all 31 of it', () => {
    expect([...rebinds.keys()].sort()).toEqual([...REBOUND_NAMES].sort());
  });

  it('reads from its own family, never straight from the page', () => {
    // L1 pointed these at `--page-*` because nothing differed yet. L4-1 gives the scope a family,
    // and the assertion moves with it: a rebind that reads the page directly is a value the
    // diagram cannot change without changing the buttons, which is the coupling `diagnosis.md`
    // §3.2 records a theme having to work around.
    for (const [name, value] of rebinds) {
      expect(value, `${name} should read --plot-*`).toMatch(/^var\(--plot-[a-z-]+\)$/);
    }
  });

  it('declares the whole family, including the members that only alias the page', () => {
    // Thirty of the thirty-one alias `--page-*` today. Declaring them anyway is the ADR-0055 §1
    // rule — a partial family is a trap — and it is what makes the NEXT diagram-only value a
    // one-line edit rather than a decision about whether to start a family.
    const tokens = themeTokens(':root');
    for (const name of REBOUND_NAMES) {
      const member = `--plot-${name.replace(/^--/, '')}`;
      expect(tokens.has(member), `${member} is not declared at :root`).toBe(true);
    }
  });

  it('does not shadow a name it fails to rebind', () => {
    // The trap this scope exists to close, asserted from the other direction: a name the block
    // omits keeps whatever `:root` gave it, which for a diagram ink means a value validated
    // against `--background` painted on a ground that is not `--background`. Measured at 1.02:1
    // today, so nobody could see it — which is why it is a gate and not a review note.
    expect(rebinds.size).toBe(REBOUND_NAMES.length);
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

describe('weight is a governed axis', () => {
  /** Every `font-<weight>` utility in the source, excluding tests. */
  function weightSites(): string[] {
    const root = join(process.cwd(), 'src');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk(root);
    const pattern = /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g;
    const sites: string[] = [];
    for (const file of files) {
      // **Comments are stripped, and both ceilings were re-measured after adding this.** The first
      // version scanned raw text, so a docblock EXPLAINING a weight decision counted as placing
      // one — which inflated the numbers and, worse, made writing down the reasoning push the gate
      // towards failing. A gate that penalises its own documentation gets worked around. (Third
      // occurrence of a scan matching prose in this repository: the Gantt row-rhythm gate and the
      // overview's archetype gate each shipped it once.)
      const text = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const match of text.matchAll(pattern)) {
        sites.push(`${file.slice(root.length + 1)}: ${match[0]}`);
      }
    }
    return sites;
  }

  it('declares the weights it uses, rather than inheriting the framework default', () => {
    // Ownership, not a re-scale. The values are today's; what changes is that they are now a
    // theme decision with a name rather than whatever Tailwind ships.
    const tokens = themeTokens(':root');
    for (const step of ['light', 'normal', 'medium', 'semibold', 'bold']) {
      expect(tokens.get(`--weight-${step}`), `--weight-${step} is not declared`).toBeDefined();
    }
  });

  it('uses no weight outside the variable font’s 300–700 axis', () => {
    // **The one assertion here that prevents a visible defect rather than governing a count.**
    // Space Grotesk's `wght` axis runs 300–700, so `font-thin` (100), `font-extralight` (200),
    // `font-extrabold` (800) and `font-black` (900) have no real instance to interpolate to —
    // the browser SYNTHESISES them, and faux-bold on a grotesque reads as a rendering fault
    // rather than a choice. Nothing uses them today; this is what keeps it that way after
    // somebody reaches for `font-black` on a heading.
    const outside = weightSites().filter((site) =>
      /font-(thin|extralight|extrabold|black)\b/.test(site),
    );
    expect(outside, `weights outside the 300–700 axis: ${outside.join(', ')}`).toEqual([]);
  });

  /**
   * **A ratchet on the weights placed BY SCREENS, at the measured floor of 165.**
   *
   * It counted every site and was set at 186 — and then failed on the six page archetypes, which
   * is the gate working and the number measuring the wrong thing. A primitive placing a weight is
   * the design system doing its job: `PageHeader` decides what a page title weighs, once, for
   * every screen. A route placing one is the judgement that archetype exists to absorb.
   *
   * So the ceiling covers `src/` **outside `components/ui/`**, which is where drift lives: 165
   * independent decisions about rank, made one at a time, with nothing saying which rank a section
   * heading should have. It comes down as screens adopt the archetypes (Landings B and F).
   *
   * Narrowed rather than raised. Raising it to accommodate the fix would have made the number mean
   * "how much weight is in the tree", which nobody needs to know; this way it means "how many
   * screens are still deciding for themselves", which is the thing the epic is changing.
   *
   * **Ratcheted 165 → 162 by Landing B**, which is what the ratchet is for. The overview screen
   * pushed it UP by two on its first run — four row links each restating the same four
   * declarations — and the fix was to move that treatment into `rowLinkClass` on the `ListRow`
   * primitive rather than to raise the number. Re-measured after the scan stopped counting
   * occurrences inside comments (see `weightSites`), which moved both buckets down by one.
   */
  // 162 → 163 (minimap M4): the minimap panel's title takes `font-medium` to MATCH the
  // Legend's — the ux gate found the first draft had dodged this ratchet by shipping a
  // caption-weight title beside a full-weight sibling, which is the one-off the ratchet
  // exists to prevent, inverted.
  // ...and 163 -> 164: the shortcuts sheet's new Minimap section heading takes the
  // `font-semibold` every other section heading in that sheet already carries.
  const SCREEN_WEIGHT_CEILING = 164;

  it(`no more than ${SCREEN_WEIGHT_CEILING} weights placed outside the primitives`, () => {
    const sites = weightSites().filter((site) => !site.startsWith('components/ui/'));
    expect(
      sites.length,
      `screens placing their own weight rose to ${sites.length} (ceiling ${SCREEN_WEIGHT_CEILING})`,
    ).toBeLessThanOrEqual(SCREEN_WEIGHT_CEILING);
  });

  /**
   * The other half. The primitives may decide weight — that is the point — but not without limit:
   * a design system in which every component picks its own is the same disorder one directory in.
   * Set at the measured 23, which includes the six archetypes and `rowLinkClass`. It read 24 until
   * the scan stopped counting occurrences inside comments; the earlier 23 → 24 move was a real one,
   * caught when the first count globbed only `.tsx` and missed `toolbar/toolbar-styles.ts`, which
   * is exactly the kind of quiet undercount a ratchet is supposed to make visible rather than
   * inherit.
   *
   * A rise here is not automatically wrong — it is what the screen ceiling coming down looks like
   * from this side, and Landing B is exactly that trade: four screen sites became one primitive.
   * It is a ceiling so that the trade is a decision somebody makes rather than a drift.
   */
  it('no more than 23 weights placed inside the primitives', () => {
    const sites = weightSites().filter((site) => site.startsWith('components/ui/'));
    expect(sites.length, `primitives placing weight rose to ${sites.length}`).toBeLessThanOrEqual(
      23,
    );
  });
});

describe('the sizing rhythm ratchets down', () => {
  /**
   * Arbitrary Tailwind sizing values in `className` — `w-[240px]`, `text-[10px]`, `p-[7px]`.
   * Counted across the whole source tree, excluding tests and excluding values that reference a
   * token (`w-[var(--rail)]`, `h-[--row-h]`), which are the opposite of the problem.
   */
  function countArbitrarySizing(): { total: number; sites: string[] } {
    const root = join(process.cwd(), 'src');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk(root);

    const pattern =
      /\b(?:w|h|min-w|min-h|max-w|max-h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|top|left|right|bottom|inset|text|leading|tracking|rounded|basis|size)-\[[^\]]+\]/g;
    const sites: string[] = [];
    for (const file of files) {
      // **Comments are stripped, for the reason `weightSites` records one axis over** — and this
      // scanner still had the hole after that one was fixed. A docblock explaining why a value is
      // arbitrary counted as *using* one, so writing down the reasoning pushed the gate towards
      // failing; Graphite M4 hit it by documenting a `w-[46px]` it had just replaced with `w-12`,
      // which is a gate going red at the exact moment its rule was being obeyed. Fourth occurrence
      // of a scan matching prose in this repository, and the first where the fix was already
      // written twenty lines away.
      const text = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const match of text.matchAll(pattern)) {
        if (/\[(?:--|var\()/.test(match[0])) continue; // token-referencing: not the defect
        sites.push(`${file.slice(root.length + 1)}: ${match[0]}`);
      }
    }
    return { total: sites.length, sites };
  }

  /**
   * **A ratchet set at the measured floor, not an aspiration** (ADR-0058's rule: a gate that
   * fails on day one gets deleted rather than fixed).
   *
   * It was 27 before the type ramp landed and is 20 after — the seven that went were
   * `text-[10px]` / `text-[0.6875rem]` / `text-[0.625rem]`, all reaching for a size the scale
   * had no name for. They now use `text-micro`, which is the whole reason that step exists.
   *
   * **The remaining 20 are mostly legitimate and this number should not be read as debt.**
   * `w-[min(15rem,32vw)]`, `max-h-[60vh]`, `w-[calc(100vw-2rem)]` are responsive clamps that no
   * design token can express — a token is one value and these are a relationship. What the
   * ratchet is for is the OTHER kind: a one-off pixel nudge that should have been a scale step,
   * which is how the seven above accumulated one at a time, each of them locally reasonable.
   *
   * Lower this number when it drops. Never raise it without saying which relationship the new
   * value expresses that a token could not.
   *
   * **20 → 18 at Graphite M4**, and not because two were removed: stripping comments from the scan
   * (see `countArbitrarySizing`) revealed that two of the twenty were prose all along. Re-measured
   * rather than left at the old figure, which would have quietly bought two units of slack.
   */
  const ARBITRARY_SIZING_CEILING = 18;

  it(`uses no more than ${ARBITRARY_SIZING_CEILING} arbitrary sizing values`, () => {
    const { total, sites } = countArbitrarySizing();
    expect(
      total,
      `arbitrary sizing values rose to ${total} (ceiling ${ARBITRARY_SIZING_CEILING}):\n` +
        sites.join('\n'),
    ).toBeLessThanOrEqual(ARBITRARY_SIZING_CEILING);
  });

  it('has no arbitrary TYPE sizes at all, because the ramp now covers them', () => {
    // Stricter than the general ratchet, and it can be: a font size is never a relationship
    // between the viewport and a container — it is a step on a scale, and the scale now has a
    // step for every size the product was reaching for.
    const { sites } = countArbitrarySizing();
    const type = sites.filter((site) => /\b(?:text|leading|tracking)-\[/.test(site));
    expect(type, `arbitrary type sizes: ${type.join(', ')}`).toEqual([]);
  });
});

describe('the typeface is chosen, shipped, and legible in a table', () => {
  it('names a real face and self-hosts it', () => {
    // **Until ADR-0097 this product had never chosen a typeface.** There was no `@font-face`
    // anywhere and no font file in the repository; `--font-sans` merely NAMED 'Inter' first in
    // a fallback stack, so the product's face was whatever each reader's machine happened to
    // have — and every width measurement here was taken in whichever face resolved on the CI
    // runner. A value that looked decided, was cited, and had never been set.
    const css = readGlobalsCss();
    expect(css).toMatch(/@font-face\s*\{/);
    expect(themeTokens(':root').get('--font-sans')).toContain('Space Grotesk');
  });

  it('serves the face from this origin, because the CSP allows no other', () => {
    // Not a preference. `docker-compose.yml`'s policy is `font-src 'self'` (ADR-0074), so a
    // Google Fonts URL fails CLOSED and SILENTLY — before first paint, in enforce mode only,
    // on the deployed origin only. The symptom is the fallback stack, which looks like a
    // design choice rather than a blocked request.
    const css = readGlobalsCss();
    const sources = [...css.matchAll(/@font-face[^}]*?src:\s*url\(([^)]*)\)/gs)].map(
      (match) => match[1]!,
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source, `${source} is not same-origin`).not.toMatch(/^['"]?https?:/);
    }
  });

  it('sets tabular figures wherever a number is data', () => {
    // **Load-bearing for THIS face rather than a refinement.** Space Grotesk's digits are
    // proportional by default and dramatically so: its `1` is 404 units against the `0`'s 638,
    // a 58% difference. Measured with fontTools before the face was committed. Without
    // `tabular-nums` a column of dates does not line up and a duration ticking from `9 d` to
    // `10 d` shifts everything after it — which reads as a rendering bug, not a font setting.
    //
    // This gate exists because the next person to change the typeface will not know that, and
    // the failure is quiet: the columns simply stop aligning.
    const css = readGlobalsCss();
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
    const base = blockBody('@layer base');
    expect(base, 'table cells do not opt into tabular figures').toMatch(/th,\s*\n?\s*td,/);
  });

  it('does not force tabular figures on running text', () => {
    // The other half, and the reason the rule is scoped rather than global: the even spacing
    // that aligns a column reads as gappy in a sentence. A `body { font-variant-numeric }`
    // would pass the assertion above and be the wrong answer.
    const base = blockBody('@layer base');
    const match = /body\s*\{([^}]*)\}/.exec(base);
    // **Throw rather than default to `''`.** This read used `?? ''`, and an empty string passes
    // `not.toMatch` vacuously — so a reformat of `@layer base` (a `body, .foo {` selector, a
    // restructured block) would have turned this gate green while proving nothing. That is the
    // ADR-0093 shape: a gate that passes equally when the thing it checks has vanished.
    if (!match) throw new Error('no `body { … }` block in @layer base — this gate cannot run');
    expect(match[1]).not.toMatch(/font-variant-numeric/);
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
