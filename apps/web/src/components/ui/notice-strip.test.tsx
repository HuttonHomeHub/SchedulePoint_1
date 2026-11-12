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

  it('gives the destructive tone its own fill and text pair', () => {
    const { container } = render(<NoticeStrip tone="destructive" message="x" />);
    const strip = container.firstElementChild;
    expect(strip?.className).toContain('bg-destructive/10');
    expect(strip?.className).toContain('text-destructive-text');
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

  it('lets the strip shrink below its content, so a truncating sentence cannot push its buttons out', () => {
    // jsdom lays nothing out, so this is a tripwire on the class; the behaviour is the dock journey's
    // ("a dock message with long names"). Both fits: `grow` strips share the outlet's flex row.
    const { container, rerender } = render(<NoticeStrip message="x" />);
    expect(container.firstElementChild).toHaveClass('min-w-0');
    rerender(<NoticeStrip message="x" messageFit="grow" />);
    expect(container.firstElementChild).toHaveClass('min-w-0');
  });

  describe('messageFit="wrap"', () => {
    it('wraps the strip, floors the sentence and groups the buttons so they drop under it together', () => {
      const { container } = render(
        <NoticeStrip message="A long sentence." messageFit="wrap" density="comfortable">
          <button type="button">One</button>
          <button type="button">Two</button>
        </NoticeStrip>,
      );
      const strip = container.firstElementChild;
      // **Verified red** by giving `wrap` the `truncate` markup: the root loses `flex-wrap`, the
      // paragraph truncates and the buttons are direct children. jsdom has no layout, so the classes
      // are the checkable half; the journeys measure the lines.
      expect(strip).toHaveClass('flex-wrap', 'min-w-0');
      const paragraph = screen.getByText('A long sentence.');
      expect(paragraph).toHaveClass('flex-1', 'min-w-[min(16rem,100%)]');
      expect(paragraph).not.toHaveClass('truncate');
      const group = screen.getByRole('button', { name: 'One' }).parentElement;
      expect(group).toBe(screen.getByRole('button', { name: 'Two' }).parentElement);
      expect(group).toHaveClass(
        'ml-auto',
        'flex',
        'max-w-full',
        'flex-wrap',
        'justify-end',
        'gap-2',
      );
      expect(group?.parentElement).toBe(strip);
    });

    it('renders no empty group when there are no buttons', () => {
      const { container } = render(
        <NoticeStrip message="x" messageFit="wrap">
          {false}
          {null}
        </NoticeStrip>,
      );
      expect(container.firstElementChild?.children).toHaveLength(1);
    });

    it('leaves grow and truncate byte-identical: no wrapper, no wrap class', () => {
      const { container, rerender } = render(
        <NoticeStrip message="x">
          <button type="button">Go</button>
        </NoticeStrip>,
      );
      const strip = (): Element | null => container.firstElementChild;
      expect(strip()).not.toHaveClass('flex-wrap');
      expect(screen.getByText('x')).toHaveClass('min-w-0', 'truncate');
      expect(screen.getByRole('button').parentElement).toBe(strip());
      rerender(
        <NoticeStrip message="x" messageFit="grow">
          <button type="button">Go</button>
        </NoticeStrip>,
      );
      expect(strip()).not.toHaveClass('flex-wrap');
      expect(screen.getByText('x').className).toBe('flex-1');
      expect(screen.getByRole('button').parentElement).toBe(strip());
    });
  });
});
