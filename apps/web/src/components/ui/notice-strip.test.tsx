import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NoticeStrip } from './notice-strip';

describe('NoticeStrip', () => {
  it('renders the message in its own paragraph, so an action is never read as part of it', () => {
    render(
      <NoticeStrip message="This plan has no activities yet.">
        <button type="button">Draw the first activity</button>
      </NoticeStrip>,
    );
    const paragraph = screen.getByText('This plan has no activities yet.');
    expect(paragraph.tagName).toBe('P');
    expect(paragraph).not.toContainElement(screen.getByRole('button'));
  });

  it('has NO role by default', () => {
    // The mode band relies on this: the surface around it already announces every transition
    // through the app's single polite region, and a second live region would say it twice.
    const { container } = render(<NoticeStrip message="Adding task — click the diagram." />);
    expect(container.firstElementChild).not.toHaveAttribute('role');
  });

  it('takes the role the caller passes, rather than deriving one from the tone', () => {
    // A rejected write is assertive; a succeeded-but-note is polite. Same component, and the
    // difference is the caller's to make.
    const { rerender, container } = render(<NoticeStrip tone="warning" role="alert" message="x" />);
    expect(container.firstElementChild).toHaveAttribute('role', 'alert');
    rerender(<NoticeStrip tone="info" role="status" message="x" />);
    expect(container.firstElementChild).toHaveAttribute('role', 'status');
  });

  it('carries tone and emphasis as separate axes', () => {
    // A dashed border says "nothing here yet"; that is orthogonal to whether the thing is neutral,
    // a warning, or an armed tool — which is why they are not one `variant` list.
    const { container } = render(<NoticeStrip tone="warning" emphasis="dashed" message="x" />);
    const strip = container.firstElementChild;
    expect(strip?.className).toContain('border-dashed');
    expect(strip?.className).toContain('bg-warning/10');
  });

  it('renders nothing extra when there are no actions', () => {
    render(<NoticeStrip message="Linked A → B (FS)." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('passes className through so a caller can position it without restating the chrome', () => {
    const { container } = render(<NoticeStrip message="x" className="mt-2" />);
    expect(container.firstElementChild).toHaveClass('mt-2');
    expect(container.firstElementChild?.className).toContain('rounded-md');
  });
});
