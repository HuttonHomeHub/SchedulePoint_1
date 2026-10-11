import { describe, expect, it } from 'vitest';

import {
  DECK_GROUP_PILL_LOCKED,
  resolveLabelVisibility,
  toolbarLabelClass,
  toolbarControlVariants,
  toolbarLabelMinWidthClass,
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
  it('takes GrayText in forced colours, and so does the hollow Author pill', () => {
    expect(toolbarControlVariants({ disabled: true })).toMatch(/forced-colors:\[color:GrayText\]/);
    expect(toolbarControlVariants({ disabled: false })).not.toMatch(/GrayText/);
    expect(DECK_GROUP_PILL_LOCKED).toMatch(/forced-colors:before:border-\[GrayText\]/);
  });

  it('keeps an underline when it is a lens that is on, and no other shaded state does', () => {
    expect(toolbarControlVariants({ state: 'selected', disabled: true })).toMatch(
      /shadow-\[inset_0_-2px_0_0_var\(--muted-foreground\)\]/,
    );
    expect(toolbarControlVariants({ state: 'rest', disabled: true })).not.toMatch(/shadow-\[inset/);
  });
});
