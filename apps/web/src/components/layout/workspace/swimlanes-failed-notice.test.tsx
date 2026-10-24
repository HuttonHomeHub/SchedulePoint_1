import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SwimlanesFailedNotice, SwimlanesFailedRegion } from './swimlanes-failed-notice';

describe('SwimlanesFailedNotice', () => {
  it('says the diagram is shown without swimlanes, and Try again calls the retry', () => {
    const onRetry = vi.fn();
    render(<SwimlanesFailedNotice onRetry={onRetry} restoreFocus={vi.fn()} />);
    expect(screen.getByTestId('swimlanes-failed-notice')).toHaveTextContent(
      "Couldn't load swimlanes. The diagram is shown without them.",
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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

  it('mounts its one live region before the failure and the sentence arrives inside it', () => {
    const props = { onRetry: vi.fn(), restoreFocus: vi.fn() };
    const { rerender } = render(<SwimlanesFailedRegion failed={false} {...props} />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    rerender(<SwimlanesFailedRegion failed {...props} />);
    expect(screen.getAllByRole('status')).toEqual([region]);
    expect(region).toHaveTextContent("Couldn't load swimlanes. The diagram is shown without them.");
  });
});
