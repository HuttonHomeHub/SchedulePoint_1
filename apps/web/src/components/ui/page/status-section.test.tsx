import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusSection } from './status-section';

const polite = (): Element | null => document.querySelector('[aria-live="polite"]');

describe('StatusSection announce', () => {
  // The default is what every caller had before ADR-0178: a sentence that appears is spoken.
  it('speaks a sentence the moment it appears by default', () => {
    const { rerender } = render(
      <StatusSection title="Box" status="">
        x
      </StatusSection>,
    );
    rerender(
      <StatusSection title="Box" status="Done.">
        x
      </StatusSection>,
    );
    expect(polite()).toHaveTextContent('Done.');
  });

  it('with announce="change" keeps the first sentence as plain text, and speaks only a change', () => {
    const { rerender } = render(
      <StatusSection title="Box" status="" announce="change">
        x
      </StatusSection>,
    );
    rerender(
      <StatusSection title="Box" status="First." announce="change">
        x
      </StatusSection>,
    );
    expect(polite()).toHaveTextContent('');
    expect(screen.getByText('First.')).toBeInTheDocument();

    rerender(
      <StatusSection title="Box" status="Second." announce="change">
        x
      </StatusSection>,
    );
    expect(polite()).toHaveTextContent('Second.');
    expect(screen.getAllByText('Second.')).toHaveLength(1);
  });

  it('shows a description under the heading', () => {
    render(
      <StatusSection title="Box" status="" description="What this holds.">
        x
      </StatusSection>,
    );
    expect(screen.getByText('What this holds.')).toBeInTheDocument();
  });
});
