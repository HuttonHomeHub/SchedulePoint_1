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

type Scope = 'page' | 'chrome' | 'panel' | 'brand' | 'auth' | 'canvas' | 'print';
const SCOPES: Scope[] = ['page', 'chrome', 'panel', 'brand', 'auth', 'canvas', 'print'];

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
  // **Two consumers, one pair.** The second arrived when the WBS band's derived bucket stopped
  // being a filled bar: its name now sits on the diagram's ground rather than on a fill of its
  // own, which is what this row already validates for every scope including `canvas`. A third
  // row saying the same thing would be the duplication this file merged away above.
  ['--background', '--muted-foreground', 'secondary text, and the Unassigned bucket’s name'],
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
  // **The focus indicator against a FILLED control, which is a different question from the line
  // above** (console epic M7). The shared toolbar focus treatment is `ring-inset`, so on a control
  // whose own fill is `--primary` the ring is measured against that fill and not against the band.
  // Inside the chrome scope `--ring` and `--primary` resolve to the **identical string**, so the
  // pen's `primary` state painted an amber ring on an amber fill: a 1:1 indicator, invisible, on
  // the one control the epic exists to put at the head of the row (WCAG 2.2 §2.4.7 and §1.4.11).
  //
  // The collision is CQ-2's, answered once already for `armed` by dropping its ring — an answer
  // that worked because `armed` keeps the band's own fill and therefore never had this pair. M5
  // added a state that does have one, and nobody re-ran the check: the matrix asserted the ring
  // against the surface and had no pair for the ring against a control. Found by the M7 ux review.
  //
  // The pair is added BEFORE the CSS that satisfies it, which is this file's own rule and exists
  // because `--canvas-grid-month` and the minimap frame each shipped broken the other way round.
  // **No new token.** The ring on a `--primary`-filled control is `--primary-foreground`, the ink
  // that control already puts on that fill — so the requirement is expressed by a pair that exists
  // rather than by a name added to every scope's family, which ADR-0097's completeness rule would
  // then oblige all seven to carry. The same two tokens appear in TEXT_PAIRS above at the stricter
  // 4.5 bar; this line is not redundant, because the two say different things and a future author
  // re-valuing one has to satisfy both reasons rather than infer this one from a label's.
  ['--primary', '--primary-foreground', 'the focus indicator on a control filled with --primary'],
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
  // Second consumer, same pair: the WBS band's derived bucket is an unfilled BRACKET stroked in
  // `--muted-foreground` on the diagram ground, so it is a graphical object carrying meaning under
  // 1.4.11 exactly as an arrow is.
  ['--background', '--muted-foreground', 'a dependency arrow, and the Unassigned bucket’s bracket'],
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
 * could not see. **The reason they could not is the part worth keeping**, because it is a shape
 * this file can be blind to again: the band painted its name on whichever of TWO fills applied, and
 * reused `--muted-foreground` — a token this matrix only ever validates as INK — as the derived
 * bucket's FILL. There is no concept here of "a token normally used as ink, repurposed as a fill,
 * then painted with a different ink than the one it was validated with", so the pairing was
 * invisible by construction rather than by oversight.
 *
 * Both were measured before being fixed: the derived bucket's name at **3.01:1** against 4.5, and
 * the selected summary's inset ring at **1.68:1** against 3. Both reached the exported and printed
 * diagram too, since `resolvePrintWbsBandPalette` delegates to the same resolver.
 *
 * **`--muted-foreground` is no longer a fill anywhere in this band** (`docs/TECH_DEBT.md` #71,
 * `docs/specs/wbs-bucket-bracket/`). The derived bucket became an unfilled bracket, so the
 * ink-as-fill inversion above is gone rather than merely validated — which is the stronger fix,
 * since the blind spot it exploited still exists for the next painter that tries it.
 *
 * **The derived bucket therefore has no row of its own here, and that is a decision.** Its two
 * pairings are both against the diagram ground, and both are already swept across every scope
 * — `canvas` included — by the generic rows above: the name by `--background`/`--foreground`
 * in `TEXT_PAIRS`, the bracket by `--background`/`--muted-foreground` in `NON_TEXT_PAIRS`. Each of
 * those rows carries the band's reason in its own comment, which is this file's established
 * two-consumers-one-pair convention. A third row restating them would be the duplication that
 * convention exists to prevent — but an ABSENT row reads as an oversight unless somebody says it
 * is not, which is what this paragraph is for.
 *
 * The ring is asserted against the BAR rather than the ground on purpose: `paintWbsBand` strokes it
 * inset (`bar.x + 0.5`, `bar.w - 1`), unlike the scene's ring, which is offset 2px outward and
 * never touches a fill. Assert the pair the painter actually draws.
 */
describe('the WBS band pairs the ink it paints with the fill it paints on', () => {
  const tokens = resolve(THEME_SELECTORS[0], 'canvas');

  it.each([
    ['--primary', '--primary-foreground', "a real summary's name on its bar", 4.5],
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

/**
 * **The two axis markers against the ruler band they now sit in** (`docs/TECH_DEBT.md` #148,
 * `docs/specs/canvas-axis-markers/`).
 *
 * The `Data date` and `Today` labels moved out of the scene and into the ruler, which changes the
 * ground under them and therefore which pairs have to hold. **M0-T6 established, by reading this
 * file rather than assuming, that none of them was asserted anywhere:**
 *
 * - the canvas sweep at `:250-257` measures `--primary` / `--warning` / `--destructive` against
 *   **`--background`**, and the ruler's ground is `bg-canvas`, i.e. **`--canvas`** — a different
 *   token;
 * - `PLOT_GROUNDS` above, the list that does name `--canvas`, contains the plot pack and not the
 *   marker fills;
 * - the two **ink-on-fill** pairs a marker needs are text, so they answer to 1.4.3's 4.5:1 rather
 *   than 1.4.11's 3:1, and neither appears in this file at all. The word `ruler` did not either.
 *
 * The pairs land **before** the markup and are verified red — the `--canvas-grid-month` precedent
 * directly below, which shipped at 2.08:1 behind a green suite *and* a paragraph saying that could
 * not happen. Writing the value first and the gate after is the recorded cause.
 *
 * A marker is a solid fill carrying a word, so it is judged as text on its own fill and as a
 * component boundary against the band. It is **not** a case where colour is the only channel: each
 * marker names itself in words and stands beside a rule whose weight and dash pattern already
 * distinguish it (ADR-0056), so 1.4.1 is satisfied independently.
 */
/**
 * **The command deck's state ladder** (console epic M3-T1, `docs/specs/workspace-console/`).
 *
 * **This block lands BEFORE the CSS it gates**, which is the rule this file already states two
 * blocks down and the reason `--canvas-grid-month` shipped at 2.08:1 behind a green suite.
 *
 * The ladder exists because the deck had **one** usable surface step and spent it three times: the
 * group card, hover, and pressed/armed all sat between 1.2:1 and 1.34:1 of the band, so **an armed
 * Add tool looked like a hovered button** — a WCAG 2.2 §1.4.11 exposure on the state a planner most
 * needs to notice, and the defect ADR-0064 was opened on. Four states now have four pictures.
 *
 * It is scoped to `chrome` deliberately rather than joining `TEXT_PAIRS`: "armed" is a property of
 * a modal tool on the command surface, and a page-scope button has no such state. Sweeping the
 * ladder over seven scopes would assert a criterion about marks that do not exist there.
 *
 * **The selected underline is `--background`, not `--primary`, and that is the accessibility
 * review's finding rather than a preference.** The approved plan (M3-T1 step 2) says to gate an
 * amber underline at 3:1 against its own fill. Amber measures **2.51:1** there, and sweeping
 * `--secondary`'s lightness shows why no re-value rescues it — the fill needs ≥ 3:1 against the
 * band to identify the state at all, and the underline needs ≥ 3:1 against the fill:
 *
 * | `--secondary` L | underline / fill | fill / band |
 * | --------------- | ---------------- | ----------- |
 * | 0.54 (shipped)  | 2.51             | **3.15**    |
 * | 0.50            | 2.97             | 2.66        |
 * | 0.46            | **3.53**         | 2.24        |
 *
 * No AMBER value satisfies both, for a reason that is **arithmetic rather than empirical**: the
 * band and the amber are 7.91:1 apart, and two 3:1 steps need 9:1. A fill sitting between them
 * cannot be 3:1 from both ends of a 7.91:1 range. Drawing the underline **outside** the box, where
 * it would sit on the band at 7.91:1, was measured in a browser and rejected: after M1 deleted the
 * group cards the deck's clearance below its last control row is **6 px**, so an outset 2 px amber
 * mark would sit 4 px above the band's own 3 px amber rule — two parallel amber lines nearly
 * touching, on a row carrying a selected-capable control (`notes`).
 *
 * **So the underline takes the BAND's own colour instead, and is asserted at 3:1 like everything
 * else.** `--background` against `--secondary` is the same 3.15:1 pair as the fill against the
 * band, read the other way round; it paints as a notch cut from the bottom of the chip. `armed`
 * keeps an amber underline, because armed has no fill — its underline sits on the band at 7.91:1.
 *
 * **The first version of this block reported the amber underline instead of fixing it**, arguing
 * that no criterion requires a redundant second channel because "an open control carries a rotated
 * caret" — a caret that **does not exist**; no caret in this product rotates. The accessibility
 * review then found that the argument had also stopped being true on its own terms: once `selected`
 * was made to outrank `open` (so a filtered `Filter ▾` keeps its mark while its panel is showing),
 * an engaged open trigger and an idle open trigger share the identical `--secondary` fill, and the
 * underline becomes the **sole** carrier of "engaged" at exactly the moment a planner opened the
 * panel to check. Not redundant, therefore not exempt. Both are recorded rather than tidied away:
 * the fabricated premise, and the fact that fixing the precedence is what made it load-bearing.
 */
describe("the command deck's state ladder gives four states four pictures", () => {
  const tokens = resolve(THEME_SELECTORS[0], 'chrome');

  it('an ARMED tool: its amber label is legible on the band it sits on', () => {
    // Armed keeps the band's fill and takes amber ink, a 2 px amber ring and an underline — the
    // product owner's choice from two rendered studies, because the pen (`Stop editing`) is an
    // amber-FILLED control leading the same row, and an amber-filled armed tool put two identical
    // amber slabs side by side: "pen held" and "tool armed" became one picture, which is the
    // confusion the ladder exists to remove.
    //
    // So the label is text on `--background`, and 1.4.3 asks 4.5:1 — where the existing
    // `--background`/`--primary` NON-text pair only ever asked 3:1. That gap is what this asserts.
    const value = ratio(tokens, '--background', '--primary');
    expect(value, `--primary ink on --background is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('an OPEN disclosure: its fill is a perceivable component against the band', () => {
    // 1.4.11. Without this the state is carried by a wash nobody can find, which is the 1.34:1
    // defect being replaced.
    const value = ratio(tokens, '--background', '--secondary');
    expect(value, `--secondary on --background is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(3);
  });

  it('an OPEN disclosure: its label is legible on its own fill', () => {
    const value = ratio(tokens, '--secondary', '--secondary-foreground');
    expect(
      value,
      `--secondary-foreground on --secondary is ${fmtRatio(value)}`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('a SELECTED control: its underline is perceivable on its own fill', () => {
    // 1.4.11, and asserted rather than reported since the accessibility review: while the panel is
    // open this mark is the only thing separating an engaged trigger from an idle one.
    const value = ratio(tokens, '--secondary', '--background');
    expect(
      value,
      `the selected underline on its fill is ${fmtRatio(value)}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('reports what an AMBER underline would have measured on that fill', () => {
    // Kept as a reading rather than deleted: it is the number the plan's step 2 asked to gate at
    // 3:1, and a later reader reaching for amber here should meet the measurement, not rediscover
    // it. Reported so a regression in either token still shows in the output.
    const value = ratio(tokens, '--secondary', '--primary');
    expect(value, `amber on the selected fill would be ${fmtRatio(value)}`).toBeGreaterThan(1);
  });

  it('reports HOVER against the band, which is transient and pointer-accompanied', () => {
    // Deliberately unasserted, and the reason is written down so a later reader does not read the
    // missing assertion as an oversight: hover is not a state a reader has to FIND — it is produced
    // by, and lasts only as long as, a pointer the reader is already aiming. The family also has one
    // usable surface step between the band and `--secondary` (`--muted` and `--accent` are 0.018
    // apart in lightness), and spending it on hover is what leaves it available for the states that
    // do have to be found. Reported so a regression is still visible in the output.
    const value = ratio(tokens, '--background', '--muted');
    expect(value, `hover fill on the band is ${fmtRatio(value)}`).toBeGreaterThan(1);
  });
});

describe('the axis markers are legible in the ruler band', () => {
  const tokens = resolve(THEME_SELECTORS[0], 'canvas');

  const MARKERS: ReadonlyArray<readonly [name: string, fill: string, ink: string]> = [
    ['Data date', '--foreground', '--background'],
    ['Today', '--destructive', '--destructive-foreground'],
    // **The transient cursor readout, named here because leaving it out was the epic's own defect.**
    // The first version of this block covered the two persistent marks and stopped, on the reasoning
    // that they were the ones the register row was about — and the third mark, added by the same
    // diff, shipped painted with `--card`/`--card-foreground`. Those are ADR-0097 RESETS, absent
    // from the canvas rebind, so they resolved the page's white card at **1.13:1** against the ruler
    // ground while every gate stayed green. Three independent reviews caught it; this pair is what
    // stops the fourth marker doing it again, since a treatment nobody asserts is a treatment
    // nobody can be wrong about.
    ['the cursor readout', '--primary', '--primary-foreground'],
  ];

  // `--canvas` and not `--background`: inside this scope they resolve to the same value
  // (`--plot-background: var(--canvas)`), and naming the one the ruler element actually carries
  // (`bg-canvas`, `TsldCanvas.tsx:1870`) is what keeps this pair readable if that ever stops being
  // true — which is precisely the equivalence ADR-0102 found had quietly stopped holding once the
  // light theme gave the diagram a ground of its own.
  it.each(MARKERS)('%s: its fill is a perceivable shape on the ruler ground', (_name, fill) => {
    // WCAG 1.4.11: the marker is a UI component whose boundary against the band it sits in has to
    // be findable, which is what makes it read as a marker rather than as a word floating in the
    // ruler.
    const value = ratio(tokens, '--canvas', fill);
    expect(value, `${fill} on --canvas is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(3);
  });

  it.each(MARKERS)('%s: its word is legible on its own fill', (_name, fill, ink) => {
    // WCAG 1.4.3 — this is text, and small text, so 4.5:1 rather than 3:1.
    const value = ratio(tokens, fill, ink);
    expect(value, `${ink} on ${fill} is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * **The two fills against each other are REPORTED, not asserted — measured at 1.48:1** (`--foreground`
   * oklch(0.321 0 0) against `--destructive` oklch(0.439 0.175 27)), and the reason is written down so
   * the next reader does not read the missing assertion as an oversight and "fix" it. That is this
   * file's own established pattern for a pair where a ratio is the wrong instrument (the day gridline
   * tier and the non-working hatch above).
   *
   * A 1.5:1 floor was drafted here first, by analogy with `CRITICALITY_PAIRS`, and measuring showed
   * the analogy is false. Criticality is carried by fill **alone** — nothing is written on a bar to
   * say it is critical — so on those pairs the ratio *is* the channel and 1.5:1 is the whole
   * protection. A marker carries its own word (`Data date`, `Today`, `Data date · today`) and stands
   * beside a rule whose weight and dash pattern already distinguish it (ADR-0056), so WCAG 1.4.1 is
   * satisfied by two channels that are not colour. No success criterion requires two adjacent
   * components to differ in luminance from **each other**; the criteria that apply are each fill
   * against the band (1.4.11, asserted above) and each word on its own fill (1.4.3, asserted above),
   * and both hold.
   *
   * The honest residual: at 1.48:1 the two fills are close in **lightness** and differ mainly in
   * **hue**, so a reader with a red-green deficiency distinguishes them by the word rather than at a
   * glance. Raising it would mean re-valuing `--foreground` or `--destructive`, two of the most
   * widely-consumed tokens in the product, to separate one pair in one band — which is a worse trade
   * than the one being made here. `axis-markers.test.ts` carries the assertion that actually protects
   * the reader: the two marks never render the same word.
   */
  it("the cursor readout's RING is what bounds it, and clears 3:1 on the ruler ground", () => {
    // Its outline is load-bearing in a way the two persistent marks' are not: they are solid fills
    // on a light band, while this one is deliberately the canvas chip's own treatment — a fill plus
    // a ring-hued 1 px outline — because it is a live, temporary mark that must not read as one of
    // the two standing facts beside it. `--ring` is the marker-channel table's transient hue
    // (`docs/DESIGN_SYSTEM.md`), the same channel the cursor GUIDELINE on the canvas uses, so a
    // planner meets one vocabulary rather than two.
    const value = ratio(tokens, '--canvas', '--ring');
    expect(
      value,
      `the cursor readout's ring is ${fmtRatio(value)} on the ruler ground`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('reports the two fills against each other, which is not a criterion but is worth knowing', () => {
    const value = ratio(tokens, '--foreground', '--destructive');
    expect(value, `the two marker fills differ by ${fmtRatio(value)}`).toBeGreaterThan(1);
  });
});

/**
 * **The grounds the stacked histogram actually paints on — and `--card` is the one the draft missed.**
 *
 * The spec proposed asserting these fills "under the `page` and `canvas` scopes". Neither is where
 * the DOM chart paints: `ResourceHistogram` renders inside `Dialog`, whose content area is
 * `bg-card text-card-foreground` (`components/ui/dialog.tsx:87`), and the strip's chrome panel is
 * `bg-card/95`. `--card` is `oklch(1 0 0)` — pure white, distinct from `--page-background` and from
 * `--canvas`/`--canvas-band` — and ADR-0097 makes `Card` a **reset, deliberately outside every
 * surface scope's rebind closure**, so no `<Surface>` wrapping brings it into line and no existing
 * page/canvas pair implies anything about it.
 *
 * That is not a hypothetical gap. `docs/TECH_DEBT.md` #162 records this repository shipping a
 * chart-adjacent swatch against exactly this reset once already, found by a specialist gate rather
 * than by anything here. The ramp's tightest existing margin is 3.10:1, which is narrow enough that
 * an unmeasured ground is not a formality.
 *
 * **What is deliberately NOT asserted: any pair between two adjacent segment fills.** No success
 * criterion requires two adjacent data fills to differ from each other — the same reasoning this
 * file already records for the Today / Data-date marker pair. 1.4.11 applies to the segment
 * BOUNDARY, and the boundary is a 1 px separator drawn in the ground colour, so it is guaranteed
 * >= 3:1 against both neighbours by the very floor asserted below, however close two fills are to
 * each other. 1.4.1 is satisfied by **position**: segments are ordered by descending total and the
 * legend and table share that order, so identity never requires discriminating hue. The ramp's own
 * worst adjacent pair is 1.46:1 and that is fine.
 */
const STACK_GROUNDS: ReadonlyArray<readonly [name: string, token: string]> = [
  // The dialog chart and the strip's chrome panel. A reset, outside every scope (ADR-0097).
  ['the dialog card', '--card'],
  // The strip's own canvas is transparent, so what shows through is the diagram ground.
  ['the diagram ground', '--canvas'],
  ['a month band', '--canvas-band'],
];

describe('the stacked histogram is perceivable on every ground it paints on', () => {
  // ONE resolve is enough and the reason is worth stating: `--chart-*` sits in
  // `OUTSIDE_THE_CLOSURE.data` and `--card` is a reset, so neither is rebound by any scope — the
  // values are identical whichever scope is asked. Resolved under `canvas` because that is the
  // scope with the most grounds in play.
  const tokens = resolve(THEME_SELECTORS[0], 'canvas');
  const members = Array.from({ length: 12 }, (_, i) => `--chart-${String(i + 1)}` as const);

  it.each(
    members.flatMap((fill) =>
      STACK_GROUNDS.map(([where, ground]) => [fill, ground, where] as const),
    ),
  )('%s is perceivable on %s (%s)', (fill, ground, _where) => {
    const value = ratio(tokens, fill, ground);
    expect(
      value,
      `${fill} vs ${ground} is ${fmtRatio(value)}, needs 3:1 — a segment a reader cannot ` +
        'separate from the ground is a band they cannot see the extent of',
    ).toBeGreaterThanOrEqual(3);
  });

  it.each(STACK_GROUNDS)('the "Other" aggregate is perceivable on %s', (_where, ground) => {
    // The aggregate is neutral rather than a ramp member — it is not a resource, and giving it a
    // categorical colour would say it is one. It still has to be visible.
    const value = ratio(tokens, '--muted-foreground', ground);
    expect(value, `the aggregate vs ${ground} is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(3);
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
    for (const ink of ['--canvas-grid-day', '--canvas-nonworking']) {
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
