import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { CanvasLoading, WorkspaceSkeleton } from './workspace-skeleton';

describe('WorkspaceSkeleton', () => {
  it('speaks the plan phase once, under StrictMode too', () => {
    render(
      <StrictMode>
        <WorkspaceSkeleton />
      </StrictMode>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading plan…');
  });

  it('draws only aria-hidden material, nothing focusable', () => {
    const { container } = render(<WorkspaceSkeleton />);
    const shapes = [...container.querySelectorAll('[data-skeleton]')];
    expect(shapes.length).toBeGreaterThan(2);
    expect(shapes.every((node) => node.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(container.querySelector('button, a, input, [tabindex]')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<WorkspaceSkeleton />);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('CanvasLoading', () => {
  it('is the activities phase: its sentence is plain text, not a second announcement', () => {
    render(<CanvasLoading />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Loading the plan…')).toHaveClass('sr-only');
  });
});
