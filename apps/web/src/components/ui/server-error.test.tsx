import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { alertBoxClassName } from './alert-box';
import { FormProblemCount } from './form';
import { ServerError } from './server-error';

const SRC = join(__dirname, '..', '..');

/** Every production source file — tests excluded, so a suite may name what it asserts. */
function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

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

describe('one treatment per screen', () => {
  // The problem count used to be asserted to wear the same box as `ServerError`. It is now
  // visually hidden (runbook 1.2, 2026-11-16), so the two can no longer sit side by side as
  // different treatments: what has to hold is that the count is still announced and never seen.
  it('keeps a form problem count in the alert tree while hiding it from the eye', () => {
    render(
      <FormProblemCount
        errors={{
          email: { type: 'required', message: 'Enter an email' },
          password: { type: 'required', message: 'Enter a password' },
        }}
      />,
    );
    const count = screen.getByRole('alert');
    expect(count).toHaveClass('sr-only');
    expect(count).toHaveTextContent('2 problems — check the highlighted fields below.');
  });

  it('never renders the two boxes on one screen', () => {
    // The structural half, and the one that cannot be satisfied by looking at a component alone.
    // `FormErrorSummary` still paints `alertBoxClassName`; `ServerError` paints `Alert`. Neither is
    // wrong, and a file rendering both would show a client-side and a server-side error in visibly
    // different weights — the exact confusion the original assertion existed to prevent.
    const offenders = sourceFiles()
      .map((file) => [relative(SRC, file), readFileSync(file, 'utf8')] as const)
      .filter(([, text]) => /<FormErrorSummary\b/.test(text) && /<ServerError\b/.test(text))
      .map(([path]) => path.split('\\').join('/'));

    expect(offenders).toEqual([]);
  });

  it('still has exactly one declaration of the older box', () => {
    // `alertBoxClassName` was extracted because the string had been written twice. It has one
    // consumer now; this keeps the extraction meaningful rather than letting a second copy reappear.
    expect(alertBoxClassName).toContain('border-destructive-text');
    const consumers = sourceFiles()
      .map((file) => readFileSync(file, 'utf8'))
      .filter((text) => text.includes('alertBoxClassName')).length;
    // The declaration itself plus `form.tsx`. A third is a copy that should have been an import.
    expect(consumers).toBe(2);
  });
});
