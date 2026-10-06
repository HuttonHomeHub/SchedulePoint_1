import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConditionStrip } from './condition-strip';

describe('ConditionStrip', () => {
  it('is a condition, not an event: it has no live role of its own', () => {
    render(
      <ConditionStrip verdict="Disabled" tone="error">
        Mail is not being sent.
      </ConditionStrip>,
    );
    // ADR-0132: the state was true when the reader arrived, so it interrupts nobody.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Disabled. Mail is not being sent.')).toBeInTheDocument();
  });

  it('carries the verdict in the same weight as the sentence (no bold lead-in)', () => {
    const { container } = render(
      <ConditionStrip verdict="Failing">Retention did not run.</ConditionStrip>,
    );
    expect(container.querySelector('strong, b')).toBeNull();
  });

  it('offers no How to fix when there is none', () => {
    render(<ConditionStrip verdict="Idle">Nothing to do.</ConditionStrip>);
    expect(screen.queryByRole('button', { name: 'How to fix' })).not.toBeInTheDocument();
  });

  it('keeps the remedy behind How to fix until asked, and renders none of it while folded', () => {
    render(
      <ConditionStrip verdict="Disabled" howToFix={<code>MAIL_SMTP_URL</code>}>
        Mail is not being sent.
      </ConditionStrip>,
    );
    const button = screen.getByRole('button', { name: 'How to fix' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('MAIL_SMTP_URL')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('MAIL_SMTP_URL')).toBeInTheDocument();
  });
});
