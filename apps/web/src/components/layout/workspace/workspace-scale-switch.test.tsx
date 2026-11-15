import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readActualSize, resetActualSizeForTests } from './workspace-scale-pref';
import * as provider from './workspace-scale-provider';
import { WORKSPACE_SCALE_TIP, WorkspaceScaleSwitch } from './workspace-scale-switch';

/** What the provider would say, for a window the tests do not have to lay out. */
function state(over: Partial<provider.WorkspaceScaleState>, inWorkspace = true): void {
  vi.spyOn(provider, 'useInWorkspace').mockReturnValue(inWorkspace);
  vi.spyOn(provider, 'useWorkspaceScale').mockReturnValue({
    scale: 1,
    wouldScale: false,
    actualSize: false,
    window: null,
    frame: null,
    ...over,
  });
}

beforeEach(() => {
  localStorage.clear();
  resetActualSizeForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the workspace scale switch', () => {
  it('is absent in a window that fits, and outside a workspace', () => {
    state({});
    const { container, rerender } = render(<WorkspaceScaleSwitch />);
    expect(container).toBeEmptyDOMElement();

    state({ scale: 0.8, wouldScale: true }, false);
    rerender(<WorkspaceScaleSwitch />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is absent where a guard has already made the scale 1', () => {
    // Enlarged text or browser zoom: the scale is 1 and the window would not scale.
    state({ scale: 1, wouldScale: false, actualSize: false });
    const { container } = render(<WorkspaceScaleSwitch />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says what the scale is, is named for the subject, and is not pressed while scaled', () => {
    state({ scale: 0.8, wouldScale: true });
    render(<WorkspaceScaleSwitch />);
    const toggle = screen.getByRole('button', { name: 'Workspace scale: Scaled to 80 %' });
    expect(toggle).toHaveTextContent('Scaled to 80 %');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('rounds the live figure', () => {
    state({ scale: 0.781, wouldScale: true });
    render(<WorkspaceScaleSwitch />);
    expect(screen.getByRole('button')).toHaveTextContent('Scaled to 78 %');
  });

  it('stays, pressed and reading "Actual size", while the reader holds actual size in a window that would scale', () => {
    state({ scale: 1, wouldScale: true, actualSize: true });
    render(<WorkspaceScaleSwitch />);
    const toggle = screen.getByRole('button', { name: 'Workspace scale: Actual size' });
    expect(toggle).toHaveTextContent('Actual size');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps its visible words inside its accessible name (WCAG 2.5.3)', () => {
    state({ scale: 0.9, wouldScale: true });
    render(<WorkspaceScaleSwitch />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toContain(button.textContent ?? '');
  });

  it('chooses actual size on a press and the scaled layout on the next, stored per device', () => {
    state({ scale: 0.8, wouldScale: true });
    const { rerender } = render(<WorkspaceScaleSwitch />);
    fireEvent.click(screen.getByRole('button'));
    expect(readActualSize()).toBe(true);
    expect(localStorage.getItem('schedulepoint:workspace-actual-size')).toBe('1');

    // The provider re-renders the switch with the new state, as it does in the app.
    state({ scale: 1, wouldScale: true, actualSize: true });
    rerender(<WorkspaceScaleSwitch />);
    fireEvent.click(screen.getByRole('button'));
    expect(readActualSize()).toBe(false);
    expect(localStorage.getItem('schedulepoint:workspace-actual-size')).toBeNull();
  });

  it('is a native button, so Enter and Space press it and it is a tab stop', () => {
    state({ scale: 0.8, wouldScale: true });
    render(<WorkspaceScaleSwitch />);
    const button = screen.getByRole('button');
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('tabindex', '-1');
  });

  it('carries the sentence the spec gives as its description', () => {
    expect(WORKSPACE_SCALE_TIP).toBe(
      'Shrinks the plan view to fit this window. Choose actual size if you have zoomed the browser.',
    );
    state({ scale: 0.8, wouldScale: true });
    render(<WorkspaceScaleSwitch />);
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(WORKSPACE_SCALE_TIP);
  });
});
