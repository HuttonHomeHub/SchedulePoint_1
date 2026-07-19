import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUndoRedoKeybindings } from './use-undo-redo-keybindings';

/**
 * M3.2 keybindings (ADR-0048): `Cmd/Ctrl+Z` = undo, `Cmd/Ctrl+Shift+Z` / `Ctrl+Y` = redo, scoped to
 * the workspace root, suppressing the browser default via `preventDefault` (the Alt+←/→ nudge pattern,
 * TECH_DEBT #25). No-op when disabled or when focus is in a text field.
 */

let root: HTMLDivElement;
let input: HTMLInputElement;
const undo = vi.fn();
const redo = vi.fn();

function mount(enabled = true) {
  return renderHook(() =>
    useUndoRedoKeybindings({ rootRef: { current: root }, enabled, undo, redo }),
  );
}

/** Dispatch a cancelable keydown from `target` (defaults to the root) and return whether it was suppressed. */
function press(init: KeyboardEventInit, target: HTMLElement = root): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  vi.clearAllMocks();
  root = document.createElement('div');
  input = document.createElement('input');
  root.appendChild(input);
  document.body.appendChild(root);
});
afterEach(() => root.remove());

describe('useUndoRedoKeybindings', () => {
  it('Ctrl+Z and Cmd+Z invoke undo and preventDefault (Back/Forward + native-undo suppression)', () => {
    mount();
    expect(press({ key: 'z', ctrlKey: true })).toBe(true);
    expect(press({ key: 'z', metaKey: true })).toBe(true);
    expect(undo).toHaveBeenCalledTimes(2);
    expect(redo).not.toHaveBeenCalled();
  });

  it('Ctrl/Cmd+Shift+Z and Ctrl+Y invoke redo (and preventDefault)', () => {
    mount();
    expect(press({ key: 'z', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(press({ key: 'z', metaKey: true, shiftKey: true })).toBe(true);
    expect(press({ key: 'y', ctrlKey: true })).toBe(true);
    expect(redo).toHaveBeenCalledTimes(3);
    expect(undo).not.toHaveBeenCalled();
  });

  it('does nothing for a bare Z (no modifier) and never preventDefaults it', () => {
    mount();
    expect(press({ key: 'z' })).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it('does nothing while focus is in a text field (native edit-undo owns it)', () => {
    mount();
    expect(press({ key: 'z', ctrlKey: true }, input)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it('attaches no listener when disabled (flag off / read-only) — byte-identical', () => {
    mount(false);
    expect(press({ key: 'z', ctrlKey: true })).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it('does not treat Cmd+Y as redo (a macOS history shortcut, not our binding)', () => {
    mount();
    expect(press({ key: 'y', metaKey: true })).toBe(false);
    expect(redo).not.toHaveBeenCalled();
  });
});
