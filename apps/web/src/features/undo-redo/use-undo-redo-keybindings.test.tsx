import { fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUndoRedoKeybindings } from './use-undo-redo-keybindings';

/**
 * M3.2 keybindings (ADR-0048): `Cmd/Ctrl+Z` = undo, `Cmd/Ctrl+Shift+Z` / `Ctrl+Y` = redo, scoped to
 * the workspace root, suppressing the browser default via `preventDefault` (the Alt+←/→ nudge
 * pattern, TECH_DEBT #25). No-op when disabled, when focus is in a text field, or under a modal.
 *
 * The host renders a **portalled** child alongside an in-tree one, because that is the case the
 * hook exists to survive (ADR-0055 §3): the chrome band portals the toolbar out of the workspace
 * root's DOM subtree, and a native `keydown` listener would go silently deaf there. Every binding
 * is asserted from BOTH children — an in-tree pass with a portal fail is precisely the regression
 * this suite is here to catch.
 */

const undo = vi.fn();
const redo = vi.fn();

/** The workspace root, plus a portalled control that is a React child but not a DOM descendant. */
function Host({
  enabled = true,
  modalOpen = false,
  onBlocked,
  container,
}: {
  enabled?: boolean;
  modalOpen?: boolean;
  onBlocked?: (direction: 'undo' | 'redo') => boolean;
  container: HTMLElement;
}): React.ReactElement {
  const onKeyDown = useUndoRedoKeybindings({
    enabled,
    modalOpen,
    undo,
    redo,
    ...(onBlocked ? { onBlocked } : {}),
  });
  return (
    // An event-delegation root, mirroring the production workspace root: no role, no tabIndex
    // and no click handler, so it is never focusable and never behaves like a control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={onKeyDown} data-testid="root">
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

function mount(enabled = true, modalOpen = false): void {
  render(<Host enabled={enabled} modalOpen={modalOpen} container={portalHost} />);
}

/** Fire a cancelable keydown from `target` and report whether it was suppressed. */
function press(init: KeyboardEventInit, target: HTMLElement): boolean {
  return !fireEvent.keyDown(target, { bubbles: true, cancelable: true, ...init });
}

/** Both the in-tree control and the portalled one — the pair every binding must satisfy. */
function targets(): HTMLElement[] {
  return [screen.getByRole('button', { name: 'in-tree' }), screen.getByTestId('portalled')];
}

beforeEach(() => {
  vi.clearAllMocks();
  portalHost = document.createElement('div');
  document.body.appendChild(portalHost);
});
afterEach(() => portalHost.remove());

describe('useUndoRedoKeybindings', () => {
  it('Ctrl+Z and Cmd+Z invoke undo and preventDefault, from in-tree AND portalled focus', () => {
    mount();
    for (const target of targets()) {
      expect(press({ key: 'z', ctrlKey: true }, target)).toBe(true);
      expect(press({ key: 'z', metaKey: true }, target)).toBe(true);
    }
    expect(undo).toHaveBeenCalledTimes(4);
    expect(redo).not.toHaveBeenCalled();
  });

  it('Ctrl/Cmd+Shift+Z and Ctrl+Y invoke redo (and preventDefault) from both', () => {
    mount();
    for (const target of targets()) {
      expect(press({ key: 'z', ctrlKey: true, shiftKey: true }, target)).toBe(true);
      expect(press({ key: 'y', ctrlKey: true }, target)).toBe(true);
    }
    expect(redo).toHaveBeenCalledTimes(4);
    expect(undo).not.toHaveBeenCalled();
  });

  it('ignores an Alt chord — AltGr is Ctrl+Alt on Windows and types a character', () => {
    mount();
    for (const target of targets()) {
      expect(press({ key: 'z', ctrlKey: true, altKey: true }, target)).toBe(false);
      expect(press({ key: 'y', ctrlKey: true, altKey: true }, target)).toBe(false);
    }
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it('does nothing for a bare Z (no modifier) and never preventDefaults it', () => {
    mount();
    for (const target of targets()) expect(press({ key: 'z' }, target)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it('does nothing while focus is in a text field (native edit-undo owns it)', () => {
    mount();
    expect(press({ key: 'z', ctrlKey: true }, screen.getByLabelText('note'))).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it('no-ops when disabled (flag off / read-only) — byte-identical', () => {
    mount(false);
    for (const target of targets()) expect(press({ key: 'z', ctrlKey: true }, target)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it('does nothing while a modal dialog is open (undo/redo must not fire under a modal)', () => {
    // A confirm/edit dialog is open — e.g. focus on a ConfirmDialog's Cancel button (not a text
    // field), so the field guard wouldn't catch it; the modalOpen guard must (B2).
    mount(true, true);
    const [target] = targets();
    expect(press({ key: 'z', ctrlKey: true }, target!)).toBe(false);
    expect(press({ key: 'z', ctrlKey: true, shiftKey: true }, target!)).toBe(false);
    expect(press({ key: 'y', ctrlKey: true }, target!)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it('resumes firing once the modal closes (live guard, no re-subscribe needed)', () => {
    const { rerender } = render(<Host modalOpen container={portalHost} />);
    const target = screen.getByRole('button', { name: 'in-tree' });
    expect(press({ key: 'z', ctrlKey: true }, target)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    rerender(<Host modalOpen={false} container={portalHost} />);
    expect(press({ key: 'z', ctrlKey: true }, target)).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('does not treat Cmd+Y as redo (a macOS history shortcut, not our binding)', () => {
    mount();
    for (const target of targets()) expect(press({ key: 'y', metaKey: true }, target)).toBe(false);
    expect(redo).not.toHaveBeenCalled();
  });
});

/**
 * M1-T4: a disabled accelerator is not silent when there was a step to refuse. The matrix is the
 * hazard — pre-empting the browser's `Ctrl+Z` is only right when the host has something to say.
 */
describe('useUndoRedoKeybindings — blocked (undo-redo M1-T4)', () => {
  function mountBlocked(onBlocked: (d: 'undo' | 'redo') => boolean, modalOpen = false): void {
    render(
      <Host enabled={false} modalOpen={modalOpen} onBlocked={onBlocked} container={portalHost} />,
    );
  }

  it('reports the direction and suppresses the browser default when there was a step', () => {
    const onBlocked = vi.fn().mockReturnValue(true);
    mountBlocked(onBlocked);
    const target = screen.getByRole('button', { name: 'in-tree' });
    expect(press({ key: 'z', ctrlKey: true }, target)).toBe(true);
    expect(press({ key: 'z', ctrlKey: true, shiftKey: true }, target)).toBe(true);
    expect(press({ key: 'y', ctrlKey: true }, target)).toBe(true);
    expect(onBlocked.mock.calls.map((c) => c[0])).toEqual(['undo', 'redo', 'redo']);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it('works from the portalled toolbar too', () => {
    const onBlocked = vi.fn().mockReturnValue(true);
    mountBlocked(onBlocked);
    expect(press({ key: 'z', ctrlKey: true }, screen.getByTestId('portalled'))).toBe(true);
    expect(onBlocked).toHaveBeenCalledWith('undo');
  });

  it('leaves the key to the browser when there is nothing to refuse', () => {
    mountBlocked(vi.fn().mockReturnValue(false));
    expect(
      press({ key: 'z', ctrlKey: true }, screen.getByRole('button', { name: 'in-tree' })),
    ).toBe(false);
  });

  it('never fires in a text field, under a modal, on a bare key or on an unrelated chord', () => {
    const onBlocked = vi.fn().mockReturnValue(true);
    mountBlocked(onBlocked);
    expect(press({ key: 'z', ctrlKey: true }, screen.getByLabelText('note'))).toBe(false);
    const button = screen.getByRole('button', { name: 'in-tree' });
    expect(press({ key: 'z' }, button)).toBe(false);
    expect(press({ key: 'c', ctrlKey: true }, button)).toBe(false);
    expect(press({ key: 'y', metaKey: true }, button)).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('is inert under a modal', () => {
    const onBlocked = vi.fn().mockReturnValue(true);
    mountBlocked(onBlocked, true);
    expect(
      press({ key: 'z', ctrlKey: true }, screen.getByRole('button', { name: 'in-tree' })),
    ).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
  });
});

/** Undo-redo M5 — which elements keep the browser's own undo (spec US-5). */
describe('useUndoRedoKeybindings — text-entry narrowing (M5)', () => {
  function elementOf(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    const el = host.firstElementChild as HTMLElement;
    screen.getByTestId('root').appendChild(el);
    return el;
  }

  const TEXT_ENTRY = [
    '<input />',
    '<input type="text" />',
    '<input type="search" />',
    '<input type="number" />',
    '<input type="date" />',
    '<input type="time" />',
    '<input type="email" />',
    '<input type="password" />',
    '<input type="bogus" />',
    '<textarea></textarea>',
    '<select><option>a</option></select>',
    '<div contenteditable="true">x</div>',
    '<div contenteditable="">x</div>',
    '<div contenteditable="true"><span>nested</span></div>',
  ];
  const PLAN_UNDO = [
    '<input type="checkbox" />',
    '<input type="radio" />',
    '<input type="range" />',
    '<input type="button" value="b" />',
    '<input type="submit" />',
    '<input type="color" />',
    '<button type="button">b</button>',
    '<div contenteditable="false">x</div>',
    '<div tabindex="0">row</div>',
  ];

  it.each(TEXT_ENTRY)('leaves Ctrl+Z to the browser on %s', (html) => {
    mount();
    const el = elementOf(html);
    const target = el.querySelector('span') ?? el;
    expect(press({ key: 'z', ctrlKey: true }, target)).toBe(false);
    expect(press({ key: 'z', metaKey: true, shiftKey: true }, target)).toBe(false);
    expect(press({ key: 'y', ctrlKey: true }, target)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it.each(PLAN_UNDO)('runs the plan undo on %s (nothing native to protect)', (html) => {
    mount();
    const el = elementOf(html);
    expect(press({ key: 'z', ctrlKey: true }, el)).toBe(true);
    expect(press({ key: 'y', ctrlKey: true }, el)).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });
});

/** Undo-redo M5, spec F-4 — the accelerators work with focus on `<body>`. */
describe('useUndoRedoKeybindings — body fallback (M5)', () => {
  /** A keydown aimed at the page itself — what the browser sends when nothing has focus. */
  function pressOnBody(init: KeyboardEventInit): boolean {
    return !fireEvent.keyDown(document.body, { bubbles: true, cancelable: true, ...init });
  }

  it('undoes and redoes with focus on <body>', () => {
    mount();
    expect(document.activeElement).toBe(document.body);
    expect(pressOnBody({ key: 'z', ctrlKey: true })).toBe(true);
    expect(pressOnBody({ key: 'z', metaKey: true, shiftKey: true })).toBe(true);
    expect(pressOnBody({ key: 'y', ctrlKey: true })).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it('does not double-fire when focus is inside the workspace (the React handler owns it)', () => {
    mount();
    const button = screen.getByRole('button', { name: 'in-tree' });
    button.focus();
    expect(document.activeElement).toBe(button);
    press({ key: 'z', ctrlKey: true }, button);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('does not act when focus is in a text field outside the workspace', () => {
    mount();
    const stray = document.createElement('input');
    document.body.appendChild(stray);
    stray.focus();
    expect(press({ key: 'z', ctrlKey: true }, stray)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    stray.remove();
  });

  it('is inert under a modal, and resumes when it closes', () => {
    const view = render(<Host modalOpen container={portalHost} />);
    expect(pressOnBody({ key: 'z', ctrlKey: true })).toBe(false);
    view.rerender(<Host container={portalHost} />);
    expect(pressOnBody({ key: 'z', ctrlKey: true })).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('is inert while any open <dialog> exists, even if the host did not report a modal', () => {
    mount();
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    expect(pressOnBody({ key: 'z', ctrlKey: true })).toBe(false);
    dialog.remove();
    expect(undo).not.toHaveBeenCalled();
  });

  it('leaves a bare Z and an already-handled key alone', () => {
    mount();
    expect(pressOnBody({ key: 'z' })).toBe(false);
    const handled = (event: KeyboardEvent): void => event.preventDefault();
    document.addEventListener('keydown', handled, { capture: true, once: true });
    pressOnBody({ key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount (leaving the plan)', () => {
    const view = render(<Host container={portalHost} />);
    view.unmount();
    expect(pressOnBody({ key: 'z', ctrlKey: true })).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it('installs one listener however many times the host re-renders', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const view = render(<Host container={portalHost} />);
    view.rerender(<Host container={portalHost} />);
    view.rerender(<Host modalOpen container={portalHost} />);
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    add.mockRestore();
  });

  it('tells the host why when the pen is not held, from the body too', () => {
    const onBlocked = vi.fn().mockReturnValue(true);
    render(<Host enabled={false} onBlocked={onBlocked} container={portalHost} />);
    expect(pressOnBody({ key: 'z', ctrlKey: true })).toBe(true);
    expect(onBlocked).toHaveBeenCalledWith('undo');
  });
});
