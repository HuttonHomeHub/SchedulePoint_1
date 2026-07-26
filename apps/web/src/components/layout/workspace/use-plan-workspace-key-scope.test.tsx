import { fireEvent, render, screen } from '@testing-library/react';
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

function Host({
  modalOpen = false,
  undoRedoEnabled = true,
  container,
}: {
  modalOpen?: boolean;
  undoRedoEnabled?: boolean;
  container: HTMLElement;
}): React.ReactElement {
  const onKeyDown = usePlanWorkspaceKeyScope({
    modalOpen,
    onShowShortcuts,
    undoRedoEnabled,
    undo,
    redo,
  });
  return (
    // An event-delegation root, mirroring the production workspace root: no role, no tabIndex
    // and no click handler, so it is never focusable and never behaves like a control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={onKeyDown}>
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
