import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ServerError } from './server-error';

/** ADR-0077 M2-T1 — the server failure gets the weight, the announcement and the focus. */
describe('ServerError', () => {
  it('renders nothing when there is no failure', () => {
    const { container } = render(<ServerError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces and takes focus when a failure appears', () => {
    const { rerender } = render(<ServerError message={null} />);
    rerender(<ServerError message="Could not sign in. Check your details." />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not sign in. Check your details.');
    // One node carries both the role and the focus. Two would read the sentence twice
    // (ADR-0074 M5-T1).
    expect(document.activeElement).toBe(alert);
  });

  it('does not steal focus back on a later re-render', () => {
    const { rerender } = render(<ServerError message={null} />);
    rerender(<ServerError message="Could not sign in." />);
    const alert = screen.getByRole('alert');
    (document.activeElement as HTMLElement | null)?.blur();

    rerender(<ServerError message="Could not sign in." />);

    // Refocusing on every render would yank the reader out of the field they moved to in order to
    // fix the problem the message describes.
    expect(document.activeElement).not.toBe(alert);
  });
});
