import { describe, expect, it } from 'vitest';

import { containerShouldStandDown, TOOLBAR_NAV_KEYS, vetoesKey } from './toolbar-keyboard';

/**
 * **One rule, shared by `Deck` and `Toolbar`, tested once.**
 *
 * Both primitives previously carried their own copy. The copy in `Deck` was fixed for a WCAG 2.2
 * §2.1.1 defect and the copy in `Toolbar` was not, so this file exists as much to make the
 * duplication impossible as to assert the rule.
 */
function el(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe('vetoesKey', () => {
  it('a single-line text field keeps only its caret keys', () => {
    const input = el('<input type="text" />');
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(vetoesKey(input, key), `${key} must stay with the caret`).toBe(true);
    }
    for (const key of ['ArrowUp', 'ArrowDown']) {
      expect(vetoesKey(input, key), `${key} is the route out of the field`).toBe(false);
    }
  });

  it('treats an absent or unknown type as text, never as permissive', () => {
    for (const html of ['<input />', '<input type="wibble" />', '<input type="SEARCH" />']) {
      const input = el(html);
      expect(vetoesKey(input, 'ArrowLeft'), html).toBe(true);
      expect(vetoesKey(input, 'ArrowUp'), html).toBe(false);
    }
  });

  /**
   * **The regression this module was extracted for.** `docs/TECH_DEBT.md` #192.
   *
   * The shipped `Go to date` control renders `<input type="date">` and is `row: 'strip'`, so `Deck`
   * renders it. A date input steps its focused segment with the vertical arrows. The tag-name-only
   * guard returned false for them, so the toolbar called `preventDefault()` and moved roving focus
   * — the day did not change and the open popover lost its focus to an unrelated command.
   *
   * Verified red against that guard: every ArrowUp/ArrowDown case below returned `false`.
   */
  it('a value-stepping or group-navigating input owns every navigation key', () => {
    for (const type of [
      'date',
      'datetime-local',
      'month',
      'number',
      'radio',
      'range',
      'time',
      'week',
    ]) {
      const input = el(`<input type="${type}" />`);
      for (const key of TOOLBAR_NAV_KEYS) {
        expect(vetoesKey(input, key), `${type} must keep ${key}`).toBe(true);
      }
    }
  });

  it('textarea, select and contenteditable navigate vertically and keep everything', () => {
    const targets = [el('<textarea></textarea>'), el('<select></select>')];
    const editable = el('<div contenteditable="true"></div>');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    for (const target of [...targets, editable]) {
      for (const key of TOOLBAR_NAV_KEYS) {
        expect(vetoesKey(target, key), `${target.tagName} ${key}`).toBe(true);
      }
    }
  });

  it('a control with no claim on the arrows keeps none of them', () => {
    for (const html of ['<button></button>', '<input type="checkbox" />', '<a href="#"></a>']) {
      const target = el(html);
      for (const key of TOOLBAR_NAV_KEYS) {
        expect(vetoesKey(target, key), `${html} ${key}`).toBe(false);
      }
    }
  });

  it('a non-element target claims nothing', () => {
    expect(vetoesKey(null, 'ArrowUp')).toBe(false);
  });
});

describe('containerShouldStandDown', () => {
  /**
   * A `ToolbarSplitButton` caret, a `Menu` and a `Combobox` all call `preventDefault()` without
   * `stopPropagation()`, so the event still reaches the container through the React tree — from a
   * portal too, since React events follow the React tree and not the DOM.
   */
  it('stands down when a descendant already handled the key', () => {
    expect(containerShouldStandDown({ defaultPrevented: true, nativeEvent: {} })).toBe(true);
    expect(containerShouldStandDown({ defaultPrevented: false, nativeEvent: {} })).toBe(false);
  });

  it('stands down mid-IME-composition, because the vertical arrows are now live over a field', () => {
    expect(
      containerShouldStandDown({ defaultPrevented: false, nativeEvent: { isComposing: true } }),
    ).toBe(true);
  });
});
