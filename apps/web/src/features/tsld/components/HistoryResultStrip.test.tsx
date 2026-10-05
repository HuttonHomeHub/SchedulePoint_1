import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HISTORY_RESULT_TIMEOUT_MS, HistoryResultStrip } from './HistoryResultStrip';

function renderStrip(overrides: Partial<React.ComponentProps<typeof HistoryResultStrip>> = {}) {
  const calls: string[] = [];
  const props = {
    kind: 'success' as const,
    message: 'Undid add “Foundations”.',
    action: { label: 'Redo', onClick: vi.fn(() => calls.push('action')) },
    onDismiss: vi.fn(() => calls.push('dismiss')),
    restoreFocus: vi.fn(() => calls.push('focus')),
    ...overrides,
  };
  render(<HistoryResultStrip {...props} />);
  return { ...props, calls };
}

describe('HistoryResultStrip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // One utterance per event (ADR-0132): the success sentence was announced by the workspace.
  it('a success has no live-region role', () => {
    renderStrip();
    const strip = screen.getByTestId('canvas-history-result');
    expect(strip).not.toHaveAttribute('role');
    expect(strip).toHaveTextContent('Undid add “Foundations”.');
  });

  it('a failure is an alert, and the only voice for it', () => {
    renderStrip({ kind: 'failure', message: 'Couldn’t undo just now. Please try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t undo just now.');
  });

  it('hands focus on before the action and before Dismiss remove the strip', () => {
    const { calls } = renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(calls).toEqual(['focus', 'action', 'focus', 'dismiss']);
  });

  it('a success withdraws itself after the timeout', () => {
    const { onDismiss } = renderStrip();
    act(() => {
      vi.advanceTimersByTime(HISTORY_RESULT_TIMEOUT_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('a failure never times out', () => {
    const { onDismiss } = renderStrip({ kind: 'failure' });
    act(() => {
      vi.advanceTimersByTime(HISTORY_RESULT_TIMEOUT_MS * 10);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('the timeout waits while the pointer is over the strip, and restarts when it leaves', () => {
    const { onDismiss } = renderStrip();
    const strip = screen.getByTestId('canvas-history-result');
    fireEvent.pointerEnter(strip);
    act(() => {
      vi.advanceTimersByTime(HISTORY_RESULT_TIMEOUT_MS * 3);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(strip);
    act(() => {
      vi.advanceTimersByTime(HISTORY_RESULT_TIMEOUT_MS);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('the timeout waits while focus is inside the strip', () => {
    const { onDismiss } = renderStrip();
    fireEvent.focus(screen.getByRole('button', { name: 'Redo' }));
    act(() => {
      vi.advanceTimersByTime(HISTORY_RESULT_TIMEOUT_MS * 3);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByRole('button', { name: 'Redo' }), { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(HISTORY_RESULT_TIMEOUT_MS);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('omits the follow-up button when there is none', () => {
    renderStrip({ action: undefined });
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  // ADR-0135 / WCAG 2.4.3: `Ctrl+Z` with focus on Redo replaces the strip (a new result re-keys it).
  it('hands focus on when the strip is replaced while focus is inside it', () => {
    const props = {
      kind: 'success' as const,
      message: 'Undid add “Foundations”.',
      action: { label: 'Redo', onClick: vi.fn() },
      onDismiss: vi.fn(),
      restoreFocus: vi.fn(),
    };
    const { rerender } = render(<HistoryResultStrip key={1} {...props} />);
    screen.getByRole('button', { name: 'Redo' }).focus();
    rerender(<HistoryResultStrip key={2} {...props} />);
    expect(props.restoreFocus).toHaveBeenCalledOnce();
  });

  it('does not touch focus when the strip goes with focus elsewhere', () => {
    const { unmount, restoreFocus } = (() => {
      const restoreFocus = vi.fn();
      const view = render(
        <HistoryResultStrip
          kind="success"
          message="Undid x."
          onDismiss={vi.fn()}
          restoreFocus={restoreFocus}
        />,
      );
      return { unmount: view.unmount, restoreFocus };
    })();
    unmount();
    expect(restoreFocus).not.toHaveBeenCalled();
  });

  it('hands focus on when the follow-up button vanishes under focus', () => {
    const props = {
      kind: 'success' as const,
      message: 'Undid add “Foundations”.',
      onDismiss: vi.fn(),
      restoreFocus: vi.fn(),
    };
    const { rerender } = render(
      <HistoryResultStrip {...props} action={{ label: 'Redo', onClick: vi.fn() }} />,
    );
    screen.getByRole('button', { name: 'Redo' }).focus();
    rerender(<HistoryResultStrip {...props} action={undefined} />);
    expect(props.restoreFocus).toHaveBeenCalledOnce();
  });

  // The host re-keys the strip per result, so a press made with focus on `Redo` REPLACES the strip.
  // When the replacement is a skipped step it has no button at all — nothing to land on — so the old
  // strip's unmount is the only moment focus can be handed to the plan surface instead of `<body>`.
  it('hands focus to the plan surface when a no-action set-aside strip replaces the focused one', () => {
    const restoreFocus = vi.fn();
    const base = { onDismiss: vi.fn(), restoreFocus };
    const { rerender } = render(
      <HistoryResultStrip
        key={1}
        {...base}
        kind="success"
        message="Undid add “Foundations”."
        action={{ label: 'Redo', onClick: vi.fn() }}
      />,
    );
    screen.getByRole('button', { name: 'Redo' }).focus();
    rerender(
      <HistoryResultStrip
        key={2}
        {...base}
        kind="failure"
        message="Couldn’t undo move “Excavate” — Excavate was changed after your edit, so that step was skipped."
      />,
    );
    expect(restoreFocus).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull();
  });

  it('shows the full sentence as a tooltip for a success, whose message truncates', () => {
    renderStrip();
    expect(screen.getByTestId('canvas-history-result')).toHaveAttribute(
      'title',
      'Undid add “Foundations”.',
    );
  });
});
