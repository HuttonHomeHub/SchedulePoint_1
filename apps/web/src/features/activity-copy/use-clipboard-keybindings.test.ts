import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useClipboardKeybindings } from './use-clipboard-keybindings';

/**
 * **The guard matrix** (`docs/specs/activity-copy-paste/` M3-T2).
 *
 * The plan names this the whole point of the milestone's tests, and the reason is one row: a planner
 * selects label text in the activities table, with focus on a **table row** rather than a text
 * field, and presses `Ctrl+C`. The undo hook's `closest('input, textarea, …')` guard passes that
 * through — a row is not a text field — so without the selection guard the planner's text copy is
 * silently replaced by an activity copy, and their system clipboard still holds whatever was in it
 * before. Nothing on screen contradicts it.
 */
const onCopy = vi.fn();
const onPaste = vi.fn();

afterEach(() => {
  onCopy.mockReset();
  onPaste.mockReset();
  vi.restoreAllMocks();
});

function handler(over: { enabled?: boolean; modalOpen?: boolean } = {}) {
  return renderHook(() => useClipboardKeybindings({ enabled: true, onCopy, onPaste, ...over }))
    .result.current;
}

/** A synthetic-event stand-in carrying only what the handler reads. */
function keyEvent(
  key: string,
  over: {
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    target?: unknown;
  } = {},
) {
  const preventDefault = vi.fn();
  const event = {
    key,
    ctrlKey: over.ctrlKey ?? true,
    metaKey: over.metaKey ?? false,
    shiftKey: over.shiftKey ?? false,
    altKey: over.altKey ?? false,
    target: over.target ?? { closest: () => null },
    preventDefault,
  } as unknown as React.KeyboardEvent<HTMLElement>;
  return { event, preventDefault };
}

/** Pretend the document has (or has not) a live text selection. */
function withSelection(collapsed: boolean) {
  vi.spyOn(window, 'getSelection').mockReturnValue({
    isCollapsed: collapsed,
  } as unknown as Selection);
}

describe('useClipboardKeybindings — fires', () => {
  it('copies with focus on a canvas listbox or a table row and nothing selected', () => {
    withSelection(true);
    const { event, preventDefault } = keyEvent('c');
    handler()(event);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('pastes on Ctrl+V', () => {
    const { event, preventDefault } = keyEvent('v');
    handler()(event);
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('accepts Cmd as well as Ctrl', () => {
    withSelection(true);
    handler()(keyEvent('c', { ctrlKey: false, metaKey: true }).event);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('pastes even with a live text selection — there is no browser paste to hijack', () => {
    // Deliberately asymmetric with copy. Outside a text field `Ctrl+V` has nothing to paste into,
    // so a selection is not evidence of intent; standing down would make the shortcut work or not
    // depending on whether the planner happened to have text selected.
    withSelection(false);
    handler()(keyEvent('v').event);
    expect(onPaste).toHaveBeenCalledTimes(1);
  });
  it('copies when getSelection returns null rather than a collapsed selection', () => {
    // Non-browser and some embedded environments return null. Treating that as "there IS a
    // selection" would make copy silently dead; treating it as "no selection" is the documented
    // choice, and this pins which one.
    vi.spyOn(window, 'getSelection').mockReturnValue(null);
    handler()(keyEvent('c').event);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('copies with a null event target — no element to be inside means no form field', () => {
    withSelection(true);
    handler()(keyEvent('c', { target: null }).event);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});

describe('useClipboardKeybindings — does NOT fire', () => {
  it('with a non-collapsed document selection — the planner is copying TEXT', () => {
    // THE row this milestone exists for. Focus is on a table row, not a text field, so the
    // undo hook's guard would let this through and silently swap the planner's clipboard.
    withSelection(false);
    const { event, preventDefault } = keyEvent('c');
    handler()(event);
    expect(onCopy).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
    [
      'contenteditable',
      () => {
        const el = document.createElement('div');
        el.setAttribute('contenteditable', 'true');
        return el;
      },
    ],
  ])('with focus inside a real <%s>', (_name, make: () => HTMLElement) => {
    // **Real elements, calling the real `closest`.** The first version stubbed `closest` as
    // `q.includes(selector.slice(0, 5))`, which never simulated DOM matching at all: the production
    // selector string is one fixed literal, identical on every iteration, so all four cases asserted
    // the same substring. It passed against a wrong implementation — mistype `select` as
    // `selectable` and a real <select> stops matching in a browser while
    // `'…, selectable, …'.includes('selec')` stays true. Found by the M5 test review.
    withSelection(true);
    const target = make();
    handler()(keyEvent('c', { target }).event);
    handler()(keyEvent('v', { target }).event);
    expect(onCopy).not.toHaveBeenCalled();
    expect(onPaste).not.toHaveBeenCalled();
  });

  it('while a modal is open', () => {
    // Otherwise a paste writes plan state from beneath an open ConfirmDialog or activity editor.
    withSelection(true);
    handler({ modalOpen: true })(keyEvent('c').event);
    handler({ modalOpen: true })(keyEvent('v').event);
    expect(onCopy).not.toHaveBeenCalled();
    expect(onPaste).not.toHaveBeenCalled();
  });

  it('when disabled — the flag is off, or the planner cannot create activities', () => {
    withSelection(true);
    handler({ enabled: false })(keyEvent('c').event);
    handler({ enabled: false })(keyEvent('v').event);
    expect(onCopy).not.toHaveBeenCalled();
    expect(onPaste).not.toHaveBeenCalled();
  });

  it('on a bare C or V with no modifier', () => {
    withSelection(true);
    handler()(keyEvent('c', { ctrlKey: false }).event);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('on Shift+Ctrl+C — that is the devtools inspector chord, not ours', () => {
    withSelection(true);
    handler()(keyEvent('c', { shiftKey: true }).event);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('on Ctrl+Alt+C — claimed by assistive software', () => {
    withSelection(true);
    handler()(keyEvent('c', { altKey: true }).event);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('on an unrelated modified key', () => {
    withSelection(true);
    const { event, preventDefault } = keyEvent('x');
    handler()(event);
    expect(onCopy).not.toHaveBeenCalled();
    expect(onPaste).not.toHaveBeenCalled();
    // And it must not swallow the keystroke either — Ctrl+X belongs to whatever else wants it.
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe('useClipboardKeybindings — preventDefault', () => {
  it('is called on every handled combo, so the browser copy never fires alongside ours', () => {
    withSelection(true);
    for (const key of ['c', 'v']) {
      const { event, preventDefault } = keyEvent(key);
      handler()(event);
      expect(preventDefault, key).toHaveBeenCalledTimes(1);
    }
  });
});
