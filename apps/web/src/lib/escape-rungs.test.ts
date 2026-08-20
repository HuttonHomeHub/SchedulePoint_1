import { afterEach, describe, expect, it, vi } from 'vitest';

import { aNativeModalIsOpen, handleDrawerEscape } from './escape-rungs';

/**
 * **The drawer's Escape rung, and the guard the M10 fallout patch shipped without.**
 *
 * The rung was written as an inline `onKeyDown` prop of a component that needs the whole plan model
 * to mount, so the only way to test it was to reproduce it — which is a second implementation of one
 * rule, and this repository has recorded that drifting often enough to know better. It is one
 * exported function now, and these cases drive the product's copy rather than a likeness of it.
 *
 * The second case is the defect: the editor's "Discard unsaved changes?" and the Notes tab's
 * "Delete note" are native modal `<dialog>`s rendered **inside** the portalled drawer subtree, and a
 * modal is in the top layer for painting and hit-testing — not for event propagation. So their
 * Escape keydown bubbles through the rung, which answered it. Verified red against the pre-fix
 * handler: without the guard, dismissing either confirmation also closed the whole editor.
 */
function press(key: string, defaultPrevented = false) {
  const preventDefault = vi.fn();
  return { event: { key, defaultPrevented, preventDefault }, preventDefault };
}

afterEach(() => {
  document.querySelectorAll('dialog').forEach((d) => d.remove());
});

describe('handleDrawerEscape', () => {
  it('closes the editor and claims the press', () => {
    const close = vi.fn();
    const { event, preventDefault } = press('Escape');
    handleDrawerEscape(event, close);
    expect(close).toHaveBeenCalledOnce();
    // Claiming it is what makes this a rung: the shell's outer handler checks `defaultPrevented`,
    // so one press cannot both close the editor and collapse the panel behind it.
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('leaves the press alone when a nested native modal is open', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);

    const close = vi.fn();
    const { event, preventDefault } = press('Escape');
    handleDrawerEscape(event, close);

    expect(
      close,
      'Escape aimed at a confirmation must not close the editor under it',
    ).not.toHaveBeenCalled();
    // And the default must survive, or the browser cannot close the dialog the reader was dismissing.
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('defers to anything inner that already answered', () => {
    const close = vi.fn();
    const { event } = press('Escape', true);
    handleDrawerEscape(event, close);
    expect(close).not.toHaveBeenCalled();
  });

  it('ignores every other key', () => {
    const close = vi.fn();
    handleDrawerEscape(press('Enter').event, close);
    handleDrawerEscape(press('Tab').event, close);
    expect(close).not.toHaveBeenCalled();
  });
});

describe('aNativeModalIsOpen', () => {
  it('reads the attribute the browser itself acts on', () => {
    expect(aNativeModalIsOpen()).toBe(false);
    const shut = document.createElement('dialog');
    document.body.append(shut);
    // A `<dialog>` in the DOM is not an open one — `showModal()` is what sets `[open]`.
    expect(aNativeModalIsOpen()).toBe(false);
    shut.setAttribute('open', '');
    expect(aNativeModalIsOpen()).toBe(true);
  });
});
