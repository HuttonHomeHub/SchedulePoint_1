import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { Spinner } from './spinner';

describe('Spinner', () => {
  it('announces the label it is given, not a default', () => {
    render(<Spinner label="Calculating float paths…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Calculating float paths…');
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('mounts its status without the sentence, so the text arrives as a change', () => {
    const html = renderToString(<Spinner label="Checking the plan…" />);
    expect(html).toMatch(/role="status"/);
    expect(html).not.toContain('Checking the plan…');
  });

  it('holds exactly one status with one sentence under StrictMode', () => {
    render(
      <StrictMode>
        <Spinner label="Comparing…" showLabel />
      </StrictMode>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Comparing…');
  });

  it('keeps the sentence screen-reader-only unless showLabel puts it on screen', () => {
    const { rerender } = render(<Spinner label="Loading plans…" />);
    expect(screen.getByText('Loading plans…')).toHaveClass('sr-only');
    rerender(<Spinner label="Loading plans…" showLabel />);
    expect(screen.getByText('Loading plans…')).not.toHaveClass('sr-only');
  });

  it('makes the visible sentence and the announcement one element', () => {
    // The defect this fixes: an icon with a dropped `aria-hidden` announced "Loading…" while the
    // visible sentence beside it sat in no live region.
    render(<Spinner label="Calculating float paths…" showLabel />);
    const status = screen.getByRole('status');
    expect(status).toContainElement(screen.getByText('Calculating float paths…'));
  });

  it('has no axe violations', async () => {
    const { container } = render(<Spinner label="Loading…" showLabel />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
