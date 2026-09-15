import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { useClipboardCopy, type UseClipboardCopyOptions } from '@/hooks/use-clipboard-copy';

function Probe(options: UseClipboardCopyOptions): React.ReactElement {
  const clipboard = useClipboardCopy(options);
  return (
    <div>
      <button
        onClick={() => {
          clipboard.copy('the payload');
        }}
      >
        Copy
      </button>
      <button onClick={clipboard.reset}>Reset</button>
      <span data-testid="state">{clipboard.state}</span>
    </div>
  );
}

const MESSAGES = { copiedMessage: 'Copied it.', failedMessage: 'Could not copy it.' };

function renderProbe(options: Partial<UseClipboardCopyOptions> = {}): void {
  render(
    <AnnouncerProvider>
      <Probe {...MESSAGES} {...options} />
    </AnnouncerProvider>,
  );
}

/** The announcer clears then re-announces on a frame, so the region settles asynchronously. */
function announced(): Promise<string> {
  return waitFor(() => {
    const text = screen.getByTestId('announcer').textContent ?? '';
    expect(text).not.toBe('');
    return text;
  });
}

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'clipboard', original);
  else setClipboard(undefined);
  vi.useRealTimers();
});

describe('useClipboardCopy', () => {
  it('writes the text and announces the success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('the payload');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('copied'));
    await expect(announced()).resolves.toBe('Copied it.');
  });

  /**
   * **The branch three of the five call sites could not report.** Each answered a rejection by
   * setting its `copied` flag back to `false`, which is what the state looks like when nothing has
   * been pressed — so a reader on a browser that refuses clipboard access got no visible change and
   * nothing announced (WCAG 4.1.3).
   */
  it('announces a refusal, and says so in its state', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('failed'));
    await expect(announced()).resolves.toBe('Could not copy it.');
  });

  /**
   * **The guard only one call site had, and the reason it is not belt-and-braces.** In an insecure
   * context `navigator.clipboard` is `undefined`, so `navigator.clipboard.writeText(…)` throws
   * SYNCHRONOUSLY — the `.then(onError)` the other four relied on never runs at all, which means
   * their failure branch could not fire in the one configuration it exists for.
   */
  it('reports a failure rather than throwing when there is no Clipboard API', async () => {
    setClipboard(undefined);
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('failed'));
    await expect(announced()).resolves.toBe('Could not copy it.');
  });

  it('returns to idle after the revert window, when one is asked for', async () => {
    vi.useFakeTimers();
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    renderProbe({ revertAfterMs: 2000 });

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await vi.waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('copied'));

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
  });

  it('stays settled when no revert window is asked for', async () => {
    vi.useFakeTimers();
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await vi.waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('copied'));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('copied');
  });

  it('can be reset without copying', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('copied'));

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
  });
});
