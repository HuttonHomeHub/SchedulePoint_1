import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SwimlanesFailedNotice } from './swimlanes-failed-notice';

describe('SwimlanesFailedNotice', () => {
  it('says the diagram is shown without swimlanes, and Try again calls the retry', () => {
    const onRetry = vi.fn();
    render(<SwimlanesFailedNotice onRetry={onRetry} restoreFocus={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      "Couldn't load swimlanes. The diagram is shown without them.",
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hands focus to the plan surface when a successful retry removes the strip under it', () => {
    const restoreFocus = vi.fn();
    function Host() {
      const [failed, setFailed] = useState(true);
      return failed ? (
        <SwimlanesFailedNotice onRetry={() => setFailed(false)} restoreFocus={restoreFocus} />
      ) : null;
    }
    render(<Host />);
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    expect(restoreFocus).toHaveBeenCalledTimes(1);
  });

  it('does not move focus when the strip goes while focus is elsewhere', () => {
    const restoreFocus = vi.fn();
    const { unmount } = render(
      <>
        <button type="button">Elsewhere</button>
        <SwimlanesFailedNotice onRetry={vi.fn()} restoreFocus={restoreFocus} />
      </>,
    );
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    unmount();
    expect(restoreFocus).not.toHaveBeenCalled();
  });
});
