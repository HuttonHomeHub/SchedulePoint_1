import { describe, expect, it } from 'vitest';

import { compositeOver, fmtRatio, parseColour, relativeLuminance, type Srgb } from '@/test/colour';
import {
  blockBody,
  declarations,
  readGlobalsCss,
  THEME_SELECTORS,
  themeTokens,
} from '@/test/css-blocks';

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

type Scope = 'page' | 'chrome' | 'panel' | 'brand' | 'auth' | 'canvas';
const SCOPES: Scope[] = ['page', 'chrome', 'panel', 'brand', 'auth', 'canvas'];

/**
 * Resolve the tokens a component would actually see, given a theme and a surface scope —
 * i.e. replay the cascade by hand.
 *
 * **It used to take a third argument, `flagsOn`, and replay the flag-keyed value layers too**
 * (ADR-0055 §6). ADR-0097 folded those values into the one theme block, so the matrix is
 * half the size and every cell in it describes something a reader can actually reach — which
 * the flags-off half had stopped doing the day `VITE_` inlining made it unreachable
 * (ADR-0088).
 */
function resolve(theme: (typeof THEME_SELECTORS)[number], scope: Scope): Map<string, string> {
  const tokens = new Map(themeTokens(theme));
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
  // The remaining solid status fills and their labels. `badge.tsx` uses an alpha wash plus the
  // `-text` variant today and documents why — but `@theme inline` compiles
  // `bg-warning text-warning-foreground`, so the pairing is one autocomplete away, and an
  // available-but-unasserted pair is exactly the trap this suite exists to remove.
  ['--success', '--success-foreground', 'the label on a solid success fill'],
  ['--warning', '--warning-foreground', 'the label on a solid warning fill'],
  ['--info', '--info-foreground', 'the label on a solid info fill'],
  ['--field', '--field-foreground', 'what a user types into an input'],
  // The pair nobody had ever checked, and the reason `--field-muted-foreground` exists: a
  // placeholder sits on the FIELD fill, not on the surface. On navy chrome the surface grey
  // is light (validated against navy) and the field is white — 2:1, invisible. A placeholder
  // belongs to the field's colour system, so it gets its own token per surface.
  ['--field', '--field-muted-foreground', 'placeholder text inside an input'],
  ['--muted', '--muted-foreground', 'secondary text on a muted block'],
  // The neutral `Badge`'s label. Added when ADR-0097's closure made `--secondary-foreground`
  // scope-derived and the pill — which had been painting it on `--muted` — dropped to 1.53:1 on
  // navy. The pairing was never asserted, so nothing failed here; `e2e-designed-chrome` caught
  // it in a browser. Asserting it is the fix; changing the class is only how it passes.
  // **Two consumers, one pair — merged at M0-T4 rather than listed twice.** The reasons are both
  // kept because they are different situations, and the pair was previously asserted once for each:
  //
  //  1. *The neutral `Badge`'s label.* Added when ADR-0097's closure made `--secondary-foreground`
  //     scope-derived and the pill — which had been painting it on `--muted` — dropped to 1.53:1 on
  //     navy. The pairing was never asserted, so nothing failed here; `e2e-designed-chrome` caught
  //     it in a browser. Asserting it is the fix; changing the class is only how it passes.
  //  2. *A read-only grid cell, and the trap ADR-0083 found going the other way.* A gated field is
  //     read-only rather than `disabled`, so the reader can still read the value — which REMOVES
  //     the 1.4.3 exemption `disabled:opacity-50` relies on. The treatment therefore dims the
  //     CHROME and never the VALUE: the cell fill drops to `--muted` while the text stays
  //     `--foreground`. Asserted BEFORE the CSS that needs it exists, because a pair added
  //     afterwards is a pair that shipped unchecked.
  ['--muted', '--foreground', 'a neutral status pill’s label, and a read-only field’s value'],
];

/** Non-text pairs — WCAG 1.4.11 Non-text Contrast, 3:1. */
const NON_TEXT_PAIRS: ReadonlyArray<readonly [fill: string, ink: string, why: string]> = [
  ['--background', '--ring', 'the focus indicator against the surface it sits on'],
  ['--background', '--primary', 'a primary button against the surface'],
  // **The status fills against the surface — asserted now, and this is where the closure pays
  // off.** These five lines used to be one long comment explaining why `--destructive` could NOT
  // be asserted: it was not a rebound name, so inside a scope it kept the page's red while
  // `--background` became navy, and pinning the pair would have pinned a failure. The comment
  // deferred the decision to ADR-0097 by name, which is exactly what happened — the rebound
  // family became a closure, these five joined it, and each scope now derives its own fill.
  //
  // Measured before that landed: `--destructive` 2.47:1 and `--secondary`/`--info` **1.34:1**
  // against navy, which is very nearly invisible. `Button` ships `secondary` and `destructive`
  // variants painting those exact fills, so this was one component move from being live.
  ['--background', '--destructive', 'a destructive button against the surface'],
  ['--background', '--destructive-hover', 'the same button, hovered'],
  ['--background', '--secondary', 'a secondary button against the surface'],
  ['--background', '--success', 'a solid success fill against the surface'],
  ['--background', '--warning', 'a solid warning fill against the surface'],
  ['--background', '--info', 'a solid info fill against the surface'],
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

/**
 * **The criticality separation, ASSERTED rather than reported** (ADR-0097 Landing E, L4-1).
 *
 * These three fills are the diagram's whole vocabulary for how urgent a bar is, and they were
 * separated by **hue alone**: near-critical against critical measured **1.34:1**, which is below
 * the amount at which a difference reads as intentional. A planner scanning a wall of bars
 * recovered the distinction by inspecting a stroke rather than by looking.
 *
 * **It is not a WCAG failure and this file does not pretend otherwise.** `paint.ts:450-451` gives
 * criticality a SHAPE cue — a solid outline for critical, dashed for near-critical, none otherwise
 * — so colour was never the only channel (1.4.1 is satisfied), and the print path carries the same
 * outline. It is a design-quality failure on the primary surface of a scheduling product, which is
 * reason enough on its own. `diagnosis.md` §3.3 records an earlier draft of this argument being
 * overstated and corrected; the weaker claim is the true one.
 *
 * **The floor is 1.5 and the ceiling is 1.70**, the latter established by maximising the worst pair
 * over all three inks subject to a white inside-label at 4.5:1 and every bar at 3:1 on a near-white
 * ground. So 3:1 between fills is not reachable without changing the label ink or the hues, and the
 * floor is set where it can actually be held rather than where it would look best in a document —
 * the ADR-0058 rule that a gate failing on day one gets deleted rather than fixed.
 *
 * Only the `canvas` scope is swept: these names mean "ordinary / near-critical / critical activity"
 * there and "primary button / warning / destructive" everywhere else, which is exactly the
 * distinction the scope exists to make (`diagnosis.md` §3.2).
 */
const CRITICALITY_PAIRS: ReadonlyArray<readonly [a: string, b: string, why: string]> = [
  ['--primary', '--destructive', 'an ordinary bar against a critical one'],
  ['--warning', '--destructive', 'a near-critical bar against a critical one'],
  ['--primary', '--warning', 'an ordinary bar against a near-critical one'],
];

/**
 * **The WBS band (ADR-0063), which this matrix had no entry for at all.**
 *
 * Added by ADR-0102's accessibility gate, which found two live failures the 216 assertions above
 * could not see. The reason they could not is worth keeping: the band paints its name on whichever
 * of TWO fills applies, and reuses `--muted-foreground` — a token this matrix only ever validates
 * as INK — as the derived bucket's FILL. There is no concept here of "a token normally used as ink,
 * repurposed as a fill, then painted with a different ink than the one it was validated with", so
 * the pairing was invisible by construction rather than by oversight.
 *
 * Both were measured before being fixed: the derived bucket's name at **3.01:1** against 4.5, and
 * the selected summary's inset ring at **1.68:1** against 3. Both reached the exported and printed
 * diagram too, since `resolvePrintWbsBandPalette` delegates to the same resolver.
 *
 * The ring is asserted against the BAR rather than the ground on purpose: `paintWbsBand` strokes it
 * inset (`bar.x + 0.5`, `bar.w - 1`), unlike the scene's ring, which is offset 2px outward and
 * never touches a fill. Assert the pair the painter actually draws.
 */
describe('the WBS band pairs the ink it paints with the fill it paints on', () => {
  const tokens = resolve(THEME_SELECTORS[0], 'canvas');

  it.each([
    ['--primary', '--primary-foreground', "a real summary's name on its bar", 4.5],
    ['--muted-foreground', '--background', "the Unassigned bucket's name on its fill", 4.5],
    ['--primary', '--foreground', "the selected summary's INSET ring on its bar", 3],
  ] as const)('%s / %s — %s', (fill, ink, _why, floor) => {
    const value = ratio(tokens, fill, ink);
    expect(
      value,
      `${fill} vs ${ink} is ${fmtRatio(value)}, needs ${floor}:1`,
    ).toBeGreaterThanOrEqual(floor);
  });
});

describe('the diagram tells its three criticality states apart', () => {
  const tokens = resolve(THEME_SELECTORS[0], 'canvas');

  it.each(CRITICALITY_PAIRS)('%s vs %s — %s — differs by ≥ 1.5:1', (a, b, _why) => {
    const value = ratio(tokens, a, b);
    expect(
      value,
      `${a} vs ${b} is ${fmtRatio(value)}, needs 1.5:1 (ceiling is 1.70:1)`,
    ).toBeGreaterThanOrEqual(1.5);
  });

  it('keeps each of the three perceivable against the ground it is painted on', () => {
    // The pair that had NO entry in this matrix at all before Landing E: every diagram ink was
    // validated against `--background` at `:root` while being painted on `--canvas`.
    for (const ink of ['--primary', '--warning', '--destructive']) {
      const value = ratio(tokens, '--background', ink);
      expect(value, `${ink} on the diagram ground is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(3);
    }
  });
});

/**
 * **The PLOT pack against the two grounds it is drawn on** — the pairs this matrix claimed to cover
 * and did not.
 *
 * ADR-0097 D12 says the plot separation matrix checks "plot fills vs the ground, vs the band, vs
 * each other", and the Consequences section says a class of unreportable contrast defect becomes
 * impossible. Measured after the epic shipped: this file contained **no PLOT-pack pair at all**, and
 * `--canvas-grid-month` was at **2.08:1** against the ground and **1.95:1** against the band. A
 * month boundary on a time-scaled diagram is the axis a planner reads a bar's position off, so that
 * is a live WCAG 1.4.11 failure sitting behind a green suite and a paragraph saying it could not be.
 *
 * The pack is not part of any scope's family — it is drawn by the painter through
 * `token('--color-canvas-grid-month')` rather than by a utility — which is exactly why the closure
 * sweep above cannot see it and why it needs naming here.
 *
 * **Two members are reported rather than asserted, with the reason written down** so the next reader
 * does not read a missing assertion as an oversight and "fix" it (the decorative-border precedent
 * below):
 *
 * - **the DAY tier** is texture, not a landmark. ADR-0056 draws day → month → year so a coarser
 *   boundary wins at a coincident x; the day tier is deliberately the weakest, one per column at the
 *   Day preset, and a planner reads position off the month and year rules. Raising it to 3:1 would
 *   turn a rhythm into a grid of hard lines.
 * - **the non-working HATCH** is a second channel on a signal that already carries itself: the wash
 *   beneath it is `--muted`, and the hatch distinguishes non-working by **kind** rather than being
 *   the only cue (ADR-0056 F7a). Colour is not the sole channel, so 1.4.1 is satisfied and 1.4.11
 *   applies to the wash rather than to the texture over it.
 */
const PLOT_GROUNDS: ReadonlyArray<readonly [name: string, token: string]> = [
  ['the diagram ground', '--canvas'],
  // The alternating month band (ADR-0055 §4). The TIGHTER of the two, and the one the first version
  // of this gate would have missed by checking only the ground.
  ['a month band', '--canvas-band'],
];

/**
 * **The minimap rectangle's frame against the three grounds it actually crosses** (ADR-0100
 * decision 9, minimap M2-T1 — the gate lands BEFORE the CSS value, verified red, because
 * writing the value first is how `--canvas-grid-month` shipped at 2.08:1 behind a green suite).
 *
 * The frame is "the boundary of a UI component" — the case WCAG 1.4.11 names — so every pair
 * asserts 3:1. The grounds are deliberately NOT `PLOT_GROUNDS`: a minimap has no month band,
 * and at scale the rectangle crosses dense bar ink — so the sweep is the canvas ground plus
 * the two bar fills (`--primary` non-critical, `--destructive` critical), which is what the
 * rectangle actually sits on in a 200×120 picture of a 2,000-activity plan.
 */
const MINIMAP_GROUNDS: ReadonlyArray<readonly [name: string, token: string]> = [
  ['the minimap ground', '--canvas'],
  ['non-critical bar ink', '--primary'],
  ['critical bar ink', '--destructive'],
];

describe('the minimap rectangle frame is perceivable on everything it crosses', () => {
  const tokens = resolve(THEME_SELECTORS[0], 'canvas');

  // The frame is a two-tone stroke+halo pair, NOT one solid — measured first: the best any
  // single value can do on the critical fill is white at 2.62:1, because the same edge must
  // also clear the 0.177-L canvas ground. The `outline`/`handleHalo` precedent
  // (`render/paint.ts`): whichever half loses contrast on a given ground, the other holds it.
  it.each(MINIMAP_GROUNDS)('the stroke or its halo clears 3:1 on %s', (_name, ground) => {
    const stroke = ratio(tokens, ground, '--canvas-minimap-frame');
    const halo = ratio(tokens, ground, '--canvas-minimap-frame-halo');
    expect(
      Math.max(stroke, halo),
      `minimap frame pair on ${ground}: stroke ${fmtRatio(stroke)}, halo ${fmtRatio(halo)}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('both halves are REACHABLE — the @theme inline block aliases them to --color-* names', () => {
    // The M4 component review's finding: the pair was declared at :root and referenced from the
    // component as var(--color-canvas-minimap-frame) — but only the `@theme inline` block turns a
    // root token into a usable --color-* custom property, and neither half was in it. So the
    // rectangle and the selection marker painted with NO colour in a real browser while this
    // gate (which computes the pair's own contrast from the :root values) stayed green, jsdom
    // asserted geometry, and the journey asserted visibility. Verified red against the
    // alias-less CSS before the aliases were added.
    const css = readGlobalsCss();
    for (const name of ['canvas-minimap-frame', 'canvas-minimap-frame-halo']) {
      expect(css, `@theme inline must alias --${name}`).toMatch(
        new RegExp(String.raw`--color-${name}:\s*var\(--${name}\);`),
      );
    }
  });

  it('reports the sub-3px criticality degradation without asserting it (the DAY-tier precedent)', () => {
    // WCAG 1.4.1 (M4 a11y gate): in the minimap bitmap a critical bar carries a foreground
    // LIGHTNESS fringe wherever the lane row is ≥ 3px (`CRITICAL_FRINGE_MIN_H`,
    // `render/minimap.ts`) — hue is not the only channel. Below 3px the fringe would BE the
    // bar, so the picture degrades to hue plus the scene's own dash/outline cues one surface
    // up, where the same information is fully available with non-colour channels. Reported
    // here — deliberately unasserted, so a REGRESSION in the fringe's own contrast is still
    // visible in the output — the same contract the day tier and the non-working hatch use.
    const tokens = resolve(THEME_SELECTORS[0], 'canvas');
    const fringeOnCritical = ratio(tokens, '--destructive', '--foreground');
    const fringeOnBar = ratio(tokens, '--primary', '--foreground');
    expect(
      `fringe on critical ${fmtRatio(fringeOnCritical)}, on non-critical ${fmtRatio(fringeOnBar)}`,
    ).toBeTruthy();
  });

  it('the stroke and its halo clear 3:1 against each other, so the edge reads as one line', () => {
    const value = ratio(tokens, '--canvas-minimap-frame-halo', '--canvas-minimap-frame');
    expect(value, `stroke on halo is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(3);
  });
});

describe('the diagram grid is readable on both of its grounds', () => {
  const tokens = resolve(THEME_SELECTORS[0], 'canvas');

  it.each(PLOT_GROUNDS)('the MONTH rule is perceivable on %s (≥ 3:1)', (_name, ground) => {
    const value = ratio(tokens, ground, '--canvas-grid-month');
    expect(value, `month gridline on ${ground} is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(3);
  });

  it.each(PLOT_GROUNDS)('the YEAR rule is perceivable on %s (≥ 3:1)', (_name, ground) => {
    const value = ratio(tokens, ground, '--canvas-grid-year');
    expect(value, `year gridline on ${ground} is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(3);
  });

  it('reports the day tier and the non-working hatch without asserting them', () => {
    // Deliberately unasserted — see the block comment above for why each is exempt. Reported so a
    // REGRESSION is still visible in the test output, which is the same contract the decorative
    // border below has.
    for (const ink of ['--canvas-grid-day', '--canvas-nonworking-hatch']) {
      for (const [, ground] of PLOT_GROUNDS) {
        expect(ratio(tokens, ground, ink)).toBeGreaterThan(1);
      }
    }
  });
});

describe.each(THEME_SELECTORS)('%s', (theme) => {
  describe.each(SCOPES)('%s surface', (scope) => {
    const tokens = resolve(theme, scope);

    it.each(TEXT_PAIRS)('%s / %s — %s — is legible (≥ 4.5:1)', (fill, ink, _why) => {
      const value = ratio(tokens, fill, ink);
      expect(value, `${fill} vs ${ink} is ${fmtRatio(value)}, needs 4.5:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it.each(NON_TEXT_PAIRS)('%s / %s — %s — is perceivable (≥ 3:1)', (fill, ink, _why) => {
      const value = ratio(tokens, fill, ink);
      expect(value, `${fill} vs ${ink} is ${fmtRatio(value)}, needs 3:1`).toBeGreaterThanOrEqual(3);
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

describe.each(THEME_SELECTORS)('%s — adjacent surfaces', (theme) => {
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
    const page = fillOf(resolve(theme, 'page'));
    const surface = fillOf(resolve(theme, scope));
    const a = relativeLuminance(page);
    const b = relativeLuminance(surface);
    const value = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    // eslint-disable-next-line no-console
    console.log(`[ADR-0055 §2] ${theme} — ${scope} vs page: ${fmtRatio(value)}`);
    expect(value).toBeGreaterThanOrEqual(1);
  });
});
