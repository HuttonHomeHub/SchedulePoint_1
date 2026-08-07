import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert } from './alert';

/** ADR-0077 §9 — the one treatment a message gets, and the two things about it that are load-bearing. */
describe('Alert', () => {
  it('derives an assertive role for an error and a polite one for the rest', () => {
    // Not a preference and not a prop: an error interrupts a task in progress, a success reports
    // one already finished. A `role` prop would let two call sites answer this differently, which
    // is exactly how the auth screens ended up with two alert boxes firing at once.
    const { rerender } = render(<Alert tone="error">Wrong password</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong password');

    rerender(<Alert tone="success">Password changed</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Password changed');

    rerender(<Alert tone="info">Check your email</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Check your email');
  });

  it('defaults to the error tone', () => {
    render(<Alert>Something failed</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('hides its icon from assistive technology', () => {
    // The icon restates what the role and the sentence already carry. Left exposed it costs a
    // screen-reader user a stop that tells them nothing.
    const { container } = render(<Alert tone="success">Done</Alert>);
    const icon = container.querySelector('svg');

    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status')).toHaveAccessibleName('');
  });

  it('carries the old app’s left accent bar rather than a full border', () => {
    // The distinguishing mark of the previous product's alerts (`static/css/auth.css:99-104`), and
    // the reason this is asserted: a "tidy-up" to `border` would look almost right in a diff and
    // would quietly discard the thing the product owner asked to have back.
    render(<Alert tone="info">Note</Alert>);
    const box = screen.getByRole('status');

    expect(box.className).toContain('border-l-4');
    expect(box.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
  });

  it('takes a ref and a tabIndex, so an outcome can be focused', () => {
    // `useOutcomeFocus` moves focus into the element that replaced what the reader was using. An
    // Alert that could not receive a ref would force those call sites back to a hand-rolled box.
    render(
      <Alert tone="success" tabIndex={-1} data-testid="outcome">
        Sent
      </Alert>,
    );
    const box = screen.getByTestId('outcome');
    box.focus();

    expect(box).toHaveFocus();
  });

  it('paints from tokens only — no colour literal survives into the class list', () => {
    // The lint rule catches literals at author time; this catches a value arriving through a prop
    // at runtime, which the rule cannot see. A literal is invisible to the contrast matrix.
    const { container } = render(<Alert tone="error">x</Alert>);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(/);
  });
});
