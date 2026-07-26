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
  container,
}: {
  enabled?: boolean;
  modalOpen?: boolean;
  container: HTMLElement;
}): React.ReactElement {
  const onKeyDown = useUndoRedoKeybindings({ enabled, modalOpen, undo, redo });
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
