import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlanWorkspaceKeyScope } from './use-plan-workspace-key-scope';

/**
 * The workspace keyboard scope (ADR-0055 S2-F1). Two shipped bindings — the `?` shortcuts sheet
 * and the ADR-0048 undo/redo accelerators — were native `keydown` listeners on the workspace root.
 * Native listeners follow the DOM tree, so portalling the toolbar into the chrome band would have
 * made both go silently deaf whenever a toolbar control had focus.
 *
 * Every assertion below therefore fires from a **portalled** control as well as an in-tree one.
 * That is the whole point of the milestone's ordering: this lands before the portal exists, so the
 * portal cannot introduce a regression that nothing catches.
 */
const onShowShortcuts = vi.fn();
const undo = vi.fn();
const redo = vi.fn();
const onCopy = vi.fn();
const onPaste = vi.fn();

function Host({
  modalOpen = false,
  undoRedoEnabled = true,
  clipboardEnabled = true,
  container,
}: {
  modalOpen?: boolean;
  undoRedoEnabled?: boolean;
  clipboardEnabled?: boolean;
  container: HTMLElement;
}): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const onKeyDown = usePlanWorkspaceKeyScope({
    rootRef,
    modalOpen,
    onShowShortcuts,
    undoRedoEnabled,
    undo,
    redo,
    clipboardEnabled,
    onCopy,
    onPaste,
  });
  return (
    // An event-delegation root, mirroring the production workspace root: no role, no tabIndex
    // and no click handler, so it is never focusable and never behaves like a control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button">in-tree</button>
      <input aria-label="note" />
      {createPortal(
        <button type="button" data-testid="portalled">
          portalled
        </button>,
        container,
      )}
    </div>
  );
}

let portalHost: HTMLDivElement;

function press(init: KeyboardEventInit, target: HTMLElement): boolean {
  return !fireEvent.keyDown(target, { bubbles: true, cancelable: true, ...init });
}

function targets(): HTMLElement[] {
  return [screen.getByRole('button', { name: 'in-tree' }), screen.getByTestId('portalled')];
}

beforeEach(() => {
  vi.clearAllMocks();
  portalHost = document.createElement('div');
  document.body.appendChild(portalHost);
});
afterEach(() => portalHost.remove());

describe('usePlanWorkspaceKeyScope', () => {
  it.each([
    ['?', { key: '?' }, () => onShowShortcuts],
    ['Cmd/Ctrl+Z', { key: 'z', ctrlKey: true }, () => undo],
    ['Cmd/Ctrl+Shift+Z', { key: 'z', ctrlKey: true, shiftKey: true }, () => redo],
    ['Ctrl+Y', { key: 'y', ctrlKey: true }, () => redo],
    // The clipboard pair. Composed here in the M5 enablement pass and covered by nothing until the
    // test review said so: `Host` had gained the three new params while the matrix still only
    // pressed `?`, z and y — so forgetting `onClipboardKeyDown(event)` inside the composed handler
    // would have passed every test in this file, and the shortcut would simply not exist.
    ['Cmd/Ctrl+C', { key: 'c', ctrlKey: true }, () => onCopy],
    ['Cmd/Ctrl+V', { key: 'v', ctrlKey: true }, () => onPaste],
  ] as const)('%s fires from in-tree AND portalled focus', (_name, init, fn) => {
    render(<Host container={portalHost} />);
    for (const target of targets()) expect(press(init, target)).toBe(true);
    expect(fn()).toHaveBeenCalledTimes(2);
  });

  it('the two handlers cannot swallow each other', () => {
    // `?` returns early on ANY modifier; undo/redo returns early WITHOUT one. Composition order is
    // therefore irrelevant — which is the property worth having, rather than a documented ordering
    // someone has to remember to preserve.
    render(<Host container={portalHost} />);
    const [target] = targets();
    press({ key: '?' }, target!);
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();

    press({ key: 'z', ctrlKey: true }, target!);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it('both bindings go inert under a modal', () => {
    render(<Host modalOpen container={portalHost} />);
    const [target] = targets();
    expect(press({ key: '?' }, target!)).toBe(false);
    expect(press({ key: 'z', ctrlKey: true }, target!)).toBe(false);
    expect(onShowShortcuts).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
  });

  it('neither binding hijacks typing in a field', () => {
    render(<Host container={portalHost} />);
    const field = screen.getByLabelText('note');
    expect(press({ key: '?' }, field)).toBe(false);
    expect(press({ key: 'z', ctrlKey: true }, field)).toBe(false);
    expect(onShowShortcuts).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
  });

  it('leaves `?` live when undo/redo is disabled — they gate independently', () => {
    render(<Host undoRedoEnabled={false} container={portalHost} />);
    const [target] = targets();
    expect(press({ key: '?' }, target!)).toBe(true);
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    expect(press({ key: 'z', ctrlKey: true }, target!)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it('leaves Alt-modified keys alone, so the time-nudge still owns Alt+←/→', () => {
    render(<Host container={portalHost} />);
    const [target] = targets();
    expect(press({ key: 'ArrowLeft', altKey: true }, target!)).toBe(false);
    expect(press({ key: 'ArrowRight', altKey: true }, target!)).toBe(false);
    expect(onShowShortcuts).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });
});

/**
 * **The one document fallback** (ADR-0218 D2): the keys also act when focus is on nothing, on `<body>`,
 * or on an element that CONTAINS the workspace root — the shell's `<main tabIndex={-1}>`, where a press
 * on a non-focusable part of the diagram, the foot row or the Gantt leaves focus. Never inside the root
 * (the React handler owns that, so the two cannot both fire), never in a text field, never under a
 * dialog or a modal flag, and never for a key something already handled.
 */
describe('usePlanWorkspaceKeyScope — the document fallback', () => {
  /** The shell: `<main tabIndex=-1>` above the workspace root, as `app-shell.tsx` renders it. */
  function Shell({
    modalOpen = false,
    undoRedoEnabled = true,
  }: {
    modalOpen?: boolean;
    undoRedoEnabled?: boolean;
  }): React.ReactElement {
    return (
      <main tabIndex={-1} data-testid="main">
        <Host modalOpen={modalOpen} undoRedoEnabled={undoRedoEnabled} container={portalHost} />
        <button type="button">outside-root-in-main</button>
      </main>
    );
  }

  /** A keydown aimed where the browser aims one: at the focused element, or the body when none. */
  function pressWhereFocused(init: KeyboardEventInit): boolean {
    const target = document.activeElement ?? document.body;
    return !fireEvent.keyDown(target, { bubbles: true, cancelable: true, ...init });
  }

  it.each([
    ['?', { key: '?' }, () => onShowShortcuts],
    ['Cmd/Ctrl+Z', { key: 'z', ctrlKey: true }, () => undo],
    ['Cmd/Ctrl+Shift+Z', { key: 'z', metaKey: true, shiftKey: true }, () => redo],
    ['Ctrl+Y', { key: 'y', ctrlKey: true }, () => redo],
    ['Cmd/Ctrl+C', { key: 'c', ctrlKey: true }, () => onCopy],
    ['Cmd/Ctrl+V', { key: 'v', ctrlKey: true }, () => onPaste],
  ] as const)('%s fires with focus on <body>', (_name, init, fn) => {
    render(<Shell />);
    expect(document.activeElement).toBe(document.body);
    expect(pressWhereFocused(init)).toBe(true);
    expect(fn()).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Cmd/Ctrl+Z', { key: 'z', ctrlKey: true }, () => undo],
    ['Cmd/Ctrl+C', { key: 'c', ctrlKey: true }, () => onCopy],
    ['Cmd/Ctrl+V', { key: 'v', ctrlKey: true }, () => onPaste],
  ] as const)('%s fires with focus on <main>, an ancestor of the root', (_name, init, fn) => {
    render(<Shell />);
    screen.getByTestId('main').focus();
    expect(document.activeElement).toBe(screen.getByTestId('main'));
    expect(pressWhereFocused(init)).toBe(true);
    expect(fn()).toHaveBeenCalledTimes(1);
  });

  it('does not double-fire with focus inside the root: the React handler owns it', () => {
    render(<Shell />);
    screen.getByRole('button', { name: 'in-tree' }).focus();
    pressWhereFocused({ key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('does not double-fire with focus on a portalled control: in the React tree, not an ancestor', () => {
    render(<Shell />);
    screen.getByTestId('portalled').focus();
    pressWhereFocused({ key: 'c', ctrlKey: true });
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('stands down for a sibling of the root that is not an ancestor of it', () => {
    render(<Shell />);
    screen.getByRole('button', { name: 'outside-root-in-main' }).focus();
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it('does not act in a text field outside the workspace', () => {
    render(<Shell />);
    const stray = document.createElement('input');
    document.body.appendChild(stray);
    stray.focus();
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(false);
    expect(pressWhereFocused({ key: 'c', ctrlKey: true })).toBe(false);
    expect(pressWhereFocused({ key: '?' })).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
    stray.remove();
  });

  it('does not act from a contenteditable above the root either', () => {
    render(<Shell />);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.tabIndex = 0;
    document.body.appendChild(editable);
    editable.focus();
    expect(pressWhereFocused({ key: 'v', ctrlKey: true })).toBe(false);
    expect(onPaste).not.toHaveBeenCalled();
    editable.remove();
  });

  it('is inert under the modal flag, and resumes when it clears', () => {
    const view = render(<Shell modalOpen />);
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(false);
    view.rerender(<Shell />);
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('is inert while any open <dialog> exists, even if the host reported no modal', () => {
    render(<Shell />);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(false);
    expect(pressWhereFocused({ key: 'c', ctrlKey: true })).toBe(false);
    dialog.remove();
    expect(undo).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('is inert while the create popover is open, though it is a plain form', () => {
    render(<Shell />);
    const form = document.createElement('form');
    form.setAttribute('data-key-scope-block', '');
    document.body.appendChild(form);
    screen.getByTestId('main').focus();
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(false);
    expect(pressWhereFocused({ key: 'v', ctrlKey: true })).toBe(false);
    expect(pressWhereFocused({ key: '?' })).toBe(false);
    form.remove();
    expect(undo).not.toHaveBeenCalled();
    expect(onPaste).not.toHaveBeenCalled();
    expect(onShowShortcuts).not.toHaveBeenCalled();
  });

  it('is not silenced by a closed <dialog> that carries a dialog role', () => {
    render(<Shell />);
    const closed = document.createElement('dialog');
    closed.setAttribute('role', 'alertdialog');
    document.body.appendChild(closed);
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(true);
    closed.remove();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('is inert while a role=menu is open', () => {
    render(<Shell />);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    screen.getByTestId('main').focus();
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(false);
    expect(pressWhereFocused({ key: 'c', ctrlKey: true })).toBe(false);
    menu.remove();
    expect(undo).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('leaves a bare key and an already-handled key alone', () => {
    render(<Shell />);
    expect(pressWhereFocused({ key: 'z' })).toBe(false);
    const handled = (event: KeyboardEvent): void => event.preventDefault();
    document.addEventListener('keydown', handled, { capture: true, once: true });
    pressWhereFocused({ key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('copy stands down for a live text selection, wherever focus is', () => {
    render(<Shell />);
    const paragraph = document.createElement('p');
    paragraph.textContent = 'some text';
    document.body.appendChild(paragraph);
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    expect(pressWhereFocused({ key: 'c', ctrlKey: true })).toBe(false);
    expect(onCopy).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
    paragraph.remove();
  });

  it('still says why when the pen is not held, from <main> too', () => {
    const onBlocked = vi.fn().mockReturnValue(true);
    function Blocked(): React.ReactElement {
      const rootRef = useRef<HTMLDivElement>(null);
      const onKeyDown = usePlanWorkspaceKeyScope({
        rootRef,
        modalOpen: false,
        onShowShortcuts,
        undoRedoEnabled: false,
        undo,
        redo,
        onUndoRedoBlocked: onBlocked,
        clipboardEnabled: false,
        onCopy,
        onPaste,
      });
      return (
        <main tabIndex={-1}>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div ref={rootRef} onKeyDown={onKeyDown} />
        </main>
      );
    }
    const view = render(<Blocked />);
    view.container.querySelector('main')?.focus();
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(true);
    expect(onBlocked).toHaveBeenCalledWith('undo');
    expect(undo).not.toHaveBeenCalled();
  });

  it('installs one listener however often the host re-renders, and removes it on unmount', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const view = render(<Shell />);
    view.rerender(<Shell modalOpen />);
    view.rerender(<Shell />);
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    add.mockRestore();
    view.unmount();
    expect(pressWhereFocused({ key: 'z', ctrlKey: true })).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });
});
