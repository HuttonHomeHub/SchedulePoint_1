import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert } from './alert';

/** ADR-0077 §9 — the one treatment a message gets, and the two things about it that are load-bearing. */
describe('Alert', () => {
  it('derives an assertive role for an error and a polite one for the rest', () => {
    // Not a preference and not a prop: an error interrupts a task in progress, a success reports
    // one already finished. A `role` prop would let two call sites answer this differently, which
    // is exactly how the auth screens ended up with two alert boxes firing at once.
    const { rerender } = render(
      <Alert purpose="event" tone="error">
        Wrong password
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong password');

    rerender(
      <Alert purpose="event" tone="success">
        Password changed
      </Alert>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Password changed');

    rerender(
      <Alert purpose="event" tone="info">
        Check your email
      </Alert>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Check your email');
  });

  it('defaults to the error tone', () => {
    render(<Alert purpose="event">Something failed</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('hides its icon from assistive technology', () => {
    // The icon restates what the role and the sentence already carry. Left exposed it costs a
    // screen-reader user a stop that tells them nothing.
    const { container } = render(
      <Alert purpose="event" tone="success">
        Done
      </Alert>,
    );
    const icon = container.querySelector('svg');

    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status')).toHaveAccessibleName('');
  });

  it('carries the old app’s left accent bar rather than a full border', () => {
    // The distinguishing mark of the previous product's alerts (`static/css/auth.css:99-104`), and
    // the reason this is asserted: a "tidy-up" to `border` would look almost right in a diff and
    // would quietly discard the thing the product owner asked to have back.
    render(
      <Alert purpose="event" tone="info">
        Note
      </Alert>,
    );
    const box = screen.getByRole('status');

    expect(box.className).toContain('border-l-4');
    expect(box.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
  });

  it('takes a ref and a tabIndex, so an outcome can be focused', () => {
    // `useOutcomeFocus` moves focus into the element that replaced what the reader was using. An
    // Alert that could not receive a ref would force those call sites back to a hand-rolled box.
    render(
      <Alert purpose="event" tone="success" tabIndex={-1} data-testid="outcome">
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
    const { container } = render(
      <Alert purpose="event" tone="error">
        x
      </Alert>,
    );
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(/);
  });

  /**
   * **G1 — `purpose` decides whether this is a live region at all, and `tone` still decides how
   * urgent an event is** (ADR-0132).
   *
   * The absence is asserted as a **missing attribute**, never as a `queryByRole` miss. Those fail
   * for different reasons: `queryByRole('alert')` also returns null when the element was never
   * rendered, so a passing assertion would be satisfied by a component that returned `null`. Only
   * `not.toHaveAttribute('role')` says "this element is here and carries no role", which is the
   * claim.
   */
  describe('purpose', () => {
    const TONES = [
      ['error', 'alert'],
      ['success', 'status'],
      ['info', 'status'],
    ] as const;

    it.each(TONES)('an event with tone %s announces as %s', (tone, role) => {
      render(
        <Alert purpose="event" tone={tone} data-testid="a">
          x
        </Alert>,
      );
      expect(screen.getByTestId('a')).toHaveAttribute('role', role);
    });

    it.each(TONES)('a condition with tone %s carries no role at all', (tone) => {
      render(
        <Alert purpose="condition" tone={tone} data-testid="a">
          x
        </Alert>,
      );
      expect(screen.getByTestId('a')).not.toHaveAttribute('role');
    });

    it('a condition keeps the tone’s icon — only the announcement is withheld', () => {
      const { container } = render(
        <Alert purpose="condition" tone="info">
          x
        </Alert>,
      );
      // `tone` owns the icon and the colour whatever the purpose is; withholding the icon too would
      // make a standing condition unreadable rather than merely quiet.
      expect(container.querySelector('svg')).not.toBeNull();
    });
  });
});
