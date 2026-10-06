import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnnouncerProvider } from './announcer';
import { CopyButton, type CopyButtonProps } from './copy-button';

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'clipboard', original);
  else setClipboard(undefined);
});

function renderButton(props: Partial<CopyButtonProps> = {}) {
  const ui = (extra: Partial<CopyButtonProps> = {}) => (
    <AnnouncerProvider>
      <CopyButton subject="Report" text={() => 'the payload'} {...props} {...extra}>
        Copy report
      </CopyButton>
    </AnnouncerProvider>
  );
  const view = render(ui());
  return { ...view, again: (extra: Partial<CopyButtonProps>) => view.rerender(ui(extra)) };
}

describe('CopyButton', () => {
  it('copies the text, shows a visible "Copied." and announces it once', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));

    expect(writeText).toHaveBeenCalledWith('the payload');
    expect(await screen.findByText('Copied.')).toBeInTheDocument();
    // The visible text is not a live region: the hook's announcement is the only one.
    expect(screen.getByText('Copied.').closest('[aria-live]')).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('announcer')).toHaveTextContent('Report copied.');
    });
  });

  it('says so, in one wording, when the clipboard refuses', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    expect(await screen.findByText(/Couldn’t copy\. Select the text/)).toBeInTheDocument();
  });

  it('says so when the Clipboard API is absent', () => {
    setClipboard(undefined);
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    expect(screen.getByText(/Couldn’t copy\. Select the text/)).toBeInTheDocument();
  });

  describe('with nothing to copy', () => {
    it('is shaded, not disabled: focusable, aria-disabled, and it refuses the press', () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      renderButton({ text: null, unavailableReason: 'Run it first.' });

      const button = screen.getByRole('button', { name: 'Copy report' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
      button.focus();
      expect(button).toHaveFocus();
      fireEvent.click(button);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('never switches the pointer off at rest, and cancels the hover fill instead (#458)', () => {
      renderButton({ text: null });
      const button = screen.getByRole('button', { name: 'Copy report' });
      // The base button's `disabled:pointer-events-none` is the native attribute's; the resting
      // state must not carry the `aria-disabled:` form.
      expect(button.className).not.toContain('aria-disabled:pointer-events-none');
      expect(button.className).toContain('aria-disabled:opacity-60');
      expect(button.className).toContain('aria-disabled:hover:bg-background');
      expect(button.className).toContain('aria-disabled:hover:text-foreground');
    });

    it('shows its reason as visible text and describes the button by it', () => {
      renderButton({ text: null, unavailableReason: 'Run it first.' });
      const reason = screen.getByText('Run it first.');
      expect(reason).not.toHaveClass('sr-only');
      expect(screen.getByRole('button', { name: 'Copy report' })).toHaveAccessibleDescription(
        'Run it first.',
      );
    });

    it('shows no reason, and no description, once there is something to copy', () => {
      renderButton({ unavailableReason: 'Run it first.' });
      expect(screen.queryByText('Run it first.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy report' })).toHaveAttribute(
        'aria-disabled',
        'false',
      );
      expect(screen.getByRole('button', { name: 'Copy report' })).not.toHaveAttribute(
        'aria-describedby',
      );
    });
  });

  it('forgets a confirmation when the caller changes resetKey', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    const { again } = renderButton({ resetKey: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    await screen.findByText('Copied.');

    again({ resetKey: 2 });
    expect(screen.queryByText('Copied.')).not.toBeInTheDocument();
  });

  it('takes an accessible name that carries the visible label', () => {
    renderButton({ 'aria-label': 'Copy report — Sitting 3' });
    expect(screen.getByRole('button', { name: 'Copy report — Sitting 3' })).toBeInTheDocument();
  });
});
