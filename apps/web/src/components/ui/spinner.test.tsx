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
        <Spinner label="Comparing…" labelOnScreen />
      </StrictMode>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Comparing…');
  });

  it('keeps the sentence screen-reader-only unless labelOnScreen puts it on screen', () => {
    const { rerender } = render(<Spinner label="Loading plans…" />);
    expect(screen.getByText('Loading plans…')).toHaveClass('sr-only');
    rerender(<Spinner label="Loading plans…" labelOnScreen />);
    const [visible] = screen
      .getAllByText('Loading plans…')
      .filter((el) => !el.classList.contains('sr-only'));
    expect(visible).toBeDefined();
  });

  it('draws the visible sentence on the first frame and still announces it once', () => {
    // The status is filled after mount, so the visible copy must not wait for that write: before
    // this the on-screen sentence was the late-filled status itself, and the first paint was an
    // icon with an empty gap beside it.
    const html = renderToString(<Spinner label="Calculating float paths…" labelOnScreen />);
    expect(html).toContain('Calculating float paths…');
    render(<Spinner label="Calculating float paths…" labelOnScreen />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Calculating float paths…');
    const visible = screen.getAllByText('Calculating float paths…').find((el) => el !== status);
    expect(visible).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Spinner label="Loading…" labelOnScreen />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
