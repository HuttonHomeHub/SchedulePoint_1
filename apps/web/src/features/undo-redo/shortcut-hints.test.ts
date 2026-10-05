import { afterEach, describe, expect, it, vi } from 'vitest';

import { isApplePlatform, undoRedoHints } from './shortcut-hints';

describe('undo/redo shortcut hints', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows glyphs and both modifiers to AT on an Apple platform', () => {
    expect(undoRedoHints(true)).toEqual({
      undo: { display: '⌘Z', aria: 'Meta+Z Control+Z' },
      redo: { display: '⇧⌘Z', aria: 'Meta+Shift+Z Control+Shift+Z' },
    });
  });

  it('advertises Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z elsewhere', () => {
    const hints = undoRedoHints(false);
    expect(hints.undo).toEqual({ display: 'Ctrl+Z', aria: 'Control+Z' });
    expect(hints.redo.display).toBe('Ctrl+Y or Ctrl+Shift+Z');
    expect(hints.redo.aria).toBe('Control+Y Control+Shift+Z');
  });

  it.each([
    ['MacIntel', true],
    ['iPhone', true],
    ['Win32', false],
    ['Linux x86_64', false],
  ])('detects %s as apple=%s', (platform, expected) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    expect(isApplePlatform()).toBe(expected);
    expect(undoRedoHints().undo.display).toBe(expected ? '⌘Z' : 'Ctrl+Z');
  });
});
