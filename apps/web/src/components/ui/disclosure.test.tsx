import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Disclosure } from './disclosure';

/**
 * The mechanism `CoverageDisclosure` measured and this promotes. The two modes are the whole
 * contract, so each is pinned in both states.
 */
describe('Disclosure — collapsed="described"', () => {
  it('keeps the content in the DOM and the accessibility tree while folded, clipped rather than hidden', () => {
    render(
      <Disclosure label="What this records" collapsed="described" contentId="rule">
        The rule text
      </Disclosure>,
    );
    const content = document.getElementById('rule');
    // Not `hidden`, not unmounted: this is an `aria-describedby` target, and a closed `<details>`
    // was measured to resolve no description at all (ADR-0145 D5).
    expect(content).toHaveTextContent('The rule text');
    expect(content).toHaveClass('sr-only');
    expect(content).not.toHaveAttribute('hidden');
    const button = screen.getByRole('button', { name: 'What this records' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'rule');
  });

  it('shows the content when opened and folds it again', () => {
    render(
      <Disclosure label="What this records" collapsed="described" contentId="rule">
        The rule text
      </Disclosure>,
    );
    const button = screen.getByRole('button', { name: 'What this records' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('rule')).not.toHaveClass('sr-only');
    fireEvent.click(button);
    expect(document.getElementById('rule')).toHaveClass('sr-only');
  });
});

describe('Disclosure — collapsed="hidden"', () => {
  it('does not render the content while folded, so nothing focusable hides in it', () => {
    render(
      <Disclosure label="How to fix" collapsed="hidden">
        <button>Inside</button>
      </Disclosure>,
    );
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
  });

  it('names no controlled element while folded, rather than a dangling id', () => {
    render(
      <Disclosure label="How to fix" collapsed="hidden">
        Steps
      </Disclosure>,
    );
    const button = screen.getByRole('button', { name: 'How to fix' });
    expect(button).not.toHaveAttribute('aria-controls');
    fireEvent.click(button);
    const controlled = button.getAttribute('aria-controls');
    expect(controlled).not.toBeNull();
    expect(document.getElementById(controlled!)).toHaveTextContent('Steps');
  });

  it('can start open', () => {
    render(
      <Disclosure label="How to fix" collapsed="hidden" defaultOpen>
        Steps
      </Disclosure>,
    );
    expect(screen.getByRole('button', { name: 'How to fix' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Steps')).toBeInTheDocument();
  });

  it('keeps focus on its button through a toggle (the APG disclosure contract)', () => {
    render(
      <Disclosure label="How to fix" collapsed="hidden">
        Steps
      </Disclosure>,
    );
    const button = screen.getByRole('button', { name: 'How to fix' });
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(button).toHaveFocus();
  });
});
