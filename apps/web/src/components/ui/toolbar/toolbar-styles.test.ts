import { describe, expect, it } from 'vitest';

import {
  DECK_GROUP_DIVIDER,
  resolveLabelVisibility,
  toolbarLabelClass,
  toolbarControlVariants,
  toolbarLabelMinWidthClass,
  TOOLBAR_TRACK,
  TOOLBAR_TRACK_SWITCH,
} from './toolbar-styles';

/**
 * **One resolver, one helper** (toolbar-redesign M1, SC-8). Every control asks `Deck` or `Toolbar`
 * for a label state and paints it through `toolbarLabelClass`, so these three functions are the whole
 * rule. Verified red by making the `'toolbar'` surface return `'roomy'` (the first case below fails)
 * and by returning `'visible'` for `'never'` (the second).
 */
describe('resolveLabelVisibility', () => {
  it("defaults to 'always', which labels on either surface", () => {
    expect(resolveLabelVisibility(undefined, 'deck')).toBe('visible');
    expect(resolveLabelVisibility(undefined, 'toolbar')).toBe('visible');
    expect(resolveLabelVisibility('always', 'deck')).toBe('visible');
  });

  it("hides a 'never' label on either surface", () => {
    expect(resolveLabelVisibility('never', 'deck')).toBe('hidden');
    expect(resolveLabelVisibility('never', 'toolbar')).toBe('hidden');
  });

  it("leaves 'roomy' to the deck's container query, and treats it as 'always' anywhere else", () => {
    expect(resolveLabelVisibility('roomy', 'deck')).toBe('roomy');
    expect(resolveLabelVisibility('roomy', 'toolbar')).toBe('visible');
  });

  it("adds the coarse pointer to 'roomy-fine' on the deck only", () => {
    expect(resolveLabelVisibility('roomy-fine', 'deck')).toBe('roomy-fine');
    expect(resolveLabelVisibility('roomy-fine', 'toolbar')).toBe('visible');
  });
});

describe('toolbarLabelClass', () => {
  it('paints no label when the control is icon-only', () => {
    expect(toolbarLabelClass('hidden')).toBeNull();
  });

  it('paints a plain truncating label when it is always shown', () => {
    expect(toolbarLabelClass('visible')).toBe('truncate');
  });

  it('keeps a roomy label in the tree but sr-only below the named container width', () => {
    // The variant is the NAMED token `--container-roomy` against the `deck` container, never an
    // arbitrary `@max-[…]` value. sr-only (not display:none) keeps the name for 2.5.3.
    expect(toolbarLabelClass('roomy')).toBe('truncate @max-roomy/deck:sr-only');
    expect(toolbarLabelClass('roomy-fine')).toBe(
      'truncate @max-roomy/deck:sr-only pointer-coarse:sr-only',
    );
  });
});

describe('toolbarLabelMinWidthClass', () => {
  it('sizes the control to its label state, so the minimum cannot disagree with the label', () => {
    expect(toolbarLabelMinWidthClass('hidden')).toBe('min-w-9');
    expect(toolbarLabelMinWidthClass('visible')).toBe('min-w-12');
    expect(toolbarLabelMinWidthClass('roomy')).toBe('min-w-12 @max-roomy/deck:min-w-9');
    expect(toolbarLabelMinWidthClass('roomy-fine')).toBe(
      'min-w-12 @max-roomy/deck:min-w-9 pointer-coarse:min-w-(--control-h)',
    );
  });
});

/**
 * **A shaded control survives forced colours, and a shaded lens still says it is on** (M6 review A1,
 * U2). The mode overrides `color` to `CanvasText` on every control, and `opacity-50` — which survived
 * it — was replaced by quiet ink, so without a `forced-colors:` branch a shut control was
 * indistinguishable from a live one. Verified red by deleting `forced-colors:[color:GrayText]` from the
 * `disabled` branch (the first case fails) and the `selected` compound (the second).
 */
describe('a shaded control', () => {
  it('takes GrayText in forced colours', () => {
    expect(toolbarControlVariants({ disabled: true })).toMatch(/forced-colors:\[color:GrayText\]/);
    expect(toolbarControlVariants({ disabled: false })).not.toMatch(/GrayText/);
  });

  it('keeps an underline when it is a lens that is on, and no other shaded state does', () => {
    expect(toolbarControlVariants({ state: 'selected', disabled: true })).toMatch(
      /shadow-\[inset_0_-2px_0_0_var\(--muted-foreground\)\]/,
    );
    expect(toolbarControlVariants({ state: 'rest', disabled: true })).not.toMatch(/shadow-\[inset/);
  });
});

/**
 * **A group divider is a border, so forced colours keep it** (toolbar-grid M1). The mode drops an
 * author background and keeps a border in a system colour, and a 1 px line painted as a background
 * would vanish there with nothing red to say so. Verified red by changing `before:border-l` to a
 * `before:w-px before:bg-muted-foreground/40` rule: the case fails.
 */
describe('the group divider', () => {
  it('is drawn with a border and takes no layout width', () => {
    expect(DECK_GROUP_DIVIDER).toMatch(/before:border-l/);
    expect(DECK_GROUP_DIVIDER).not.toMatch(/before:bg-/);
    expect(DECK_GROUP_DIVIDER).toMatch(/before:absolute/);
  });
});

/**
 * **A track is a recessed bar with a 1 px join, and its raised member is never colour alone**
 * (toolbar-grid M2). jsdom resolves no stylesheet, so what is asserted here is what the CLASSES
 * promise; the browser reads the computed result (`command-surface.spec.ts`, the raised-member case:
 * a distinct background AND a non-`none` box-shadow, in ordinary colours).
 *
 * Verified red by deleting the `shadow-[…]` class from `TOOLBAR_TRACK_SWITCH` (the second case fails),
 * by deleting `forced-color-adjust` (the third), and by giving the track a `p-1` (the first: padding
 * makes the track taller than its members and grows the row).
 */
describe('the track', () => {
  it('is a recessed field with a 1 px join and no padding, so it is exactly as tall as its members', () => {
    expect(TOOLBAR_TRACK).toMatch(/(^|\s)bg-field(\s|$)/);
    expect(TOOLBAR_TRACK).toMatch(/(^|\s)gap-px(\s|$)/);
    expect(TOOLBAR_TRACK).toMatch(/(^|\s)flex-nowrap(\s|$)/);
    expect(TOOLBAR_TRACK).not.toMatch(/(^|\s)(p|px|py|pl|pr|pt|pb|border)(-\S+)?(\s|$)/);
  });

  it('raises the chosen member with a fill AND a composed box-shadow, never one alone', () => {
    // The fill is the `selected` state's own (`--secondary`); the track only adds the shadow.
    expect(toolbarControlVariants({ state: 'selected', disabled: false })).toMatch(
      /(^|\s)bg-secondary(\s|$)/,
    );
    // One `box-shadow` value holds the 2 px `--field` inset ring and the underline moved in by it, so
    // the two cannot compete for the property.
    const shadow = TOOLBAR_TRACK_SWITCH.split(' ').filter((c) => c.includes(':shadow-[inset'));
    expect(shadow).toHaveLength(1);
    expect(shadow[0]).toMatch(
      /inset_0_0_0_2px_var\(--field\),inset_0_-4px_0_0_var\(--background\)/,
    );
  });

  it('raises only a member that is pressed and not shaded: a shaded one keeps its muted underline', () => {
    for (const c of TOOLBAR_TRACK_SWITCH.split(' ')) {
      expect(c, c).toContain('[aria-pressed=true]:not([aria-disabled=true])');
    }
  });

  it('marks the chosen member under forced colours with system colours, opted out of the backplate', () => {
    // `box-shadow` is dropped there and a border would move the box, so the mark is a `Highlight`
    // fill. `forced-color-adjust: none` is what stops the UA painting a Canvas backplate that put
    // `HighlightText` on white (measured), and the ordinary shadow and ring go with it.
    for (const needle of [
      'forced-colors:bg-[Highlight]',
      'forced-colors:[color:HighlightText]',
      'forced-colors:[forced-color-adjust:none]',
      'forced-colors:shadow-none',
      'forced-colors:ring-0',
    ]) {
      expect(TOOLBAR_TRACK_SWITCH, needle).toContain(needle);
    }
  });

  it('keeps the control’s own focus ring inset, so a 1 px join has room for it', () => {
    // An outset ring would reach into the neighbour across a 1 px gap.
    const ordinary = toolbarControlVariants({ state: 'rest', disabled: false });
    expect(ordinary).toMatch(/(^|\s)focus-visible:ring-inset(\s|$)/);
    expect(ordinary).not.toMatch(/ring-offset/);
  });
});
