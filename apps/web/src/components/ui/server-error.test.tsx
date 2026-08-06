import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { alertBoxClassName } from './alert-box';
import { FormErrorSummary } from './form';
import { ServerError } from './server-error';

/** ADR-0077 M2-T1 — the server failure gets the weight and the announcement. */
describe('ServerError', () => {
  it('renders nothing when there is no failure', () => {
    const { container } = render(<ServerError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces a failure without moving focus off the field being edited', () => {
    // The regression this pins (ADR-0077 M6-T2, accessibility review). It shipped calling
    // `useOutcomeFocus`, which exists to recover focus when the control the reader was using has
    // been **unmounted**. A `ServerError` unmounts nothing: at `/sign-in`, pressing Enter in the
    // password field submits **without moving focus**, so a wrong password used to take the reader
    // off the field they had just typed into and park them on an inert div, from which Tab goes
    // forward to Email. WCAG 2.4.3, and `role="alert"` already reaches a screen reader regardless
    // of focus — so nothing was bought with it.
    render(
      <form>
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" />
      </form>,
    );
    const field = screen.getByLabelText('Password');
    field.focus();
    expect(document.activeElement).toBe(field);

    const { rerender } = render(<ServerError message={null} />);
    rerender(<ServerError message="Could not sign in. Check your details." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not sign in. Check your details.');
    expect(document.activeElement).toBe(field);
  });

  it('is not itself a focus stop', () => {
    render(<ServerError message="Could not sign in." />);
    // No `tabIndex`, because nothing focuses it any more. Leaving `tabIndex={-1}` behind would be
    // a programmatic focus target with no programme.
    expect(screen.getByRole('alert')).not.toHaveAttribute('tabindex');
  });
});

describe('the alert-box treatment is declared once', () => {
  // The component review's finding: `ServerError` and `FormErrorSummary` carried byte-identical
  // copies of the bordered/tinted class string — the same defect `textLinkVariants` was introduced
  // in this epic to remove. Two copies drift the moment one is touched for a contrast fix, and
  // nothing fails: each looks right alone, and only a reader who saw a client-side and a
  // server-side error side by side would notice one was a version behind (the ADR-0062 shape).
  it('is the same on a server failure and on a validation summary', () => {
    const { unmount } = render(<ServerError message="Server said no." />);
    const server = screen.getByRole('alert').className;
    unmount();

    render(
      <FormErrorSummary errors={{ email: { type: 'required', message: 'Enter an email' } }} />,
    );
    expect(screen.getByRole('alert').className).toBe(server);
    expect(server).toContain(alertBoxClassName);
  });
});
