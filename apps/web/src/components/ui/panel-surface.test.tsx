import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PanelSurface } from './surface';

/**
 * `PanelSurface` renders BOTH halves of the panel pairing — ground and edge border — as one
 * primitive (TECH_DEBT #210). The pairing was a four-site copied literal that drifted once (the
 * `#172` fix copied only the ground half), so every case here asserts the two halves together.
 */
describe('PanelSurface', () => {
  it('renders the panel ground with the trailing (end) border by default', () => {
    render(<PanelSurface data-testid="panel">content</PanelSurface>);
    const panel = screen.getByTestId('panel');
    expect(panel).toHaveAttribute('data-surface', 'panel');
    expect(panel).toHaveAttribute('data-panel-border', 'end');
    expect(panel).toHaveClass('border-border', 'border-r', 'bg-background');
    expect(panel).not.toHaveClass('border-l');
  });

  it('border="start" puts the border on the leading edge (the context drawer)', () => {
    render(
      <PanelSurface border="start" data-testid="panel">
        content
      </PanelSurface>,
    );
    const panel = screen.getByTestId('panel');
    expect(panel).toHaveAttribute('data-panel-border', 'start');
    expect(panel).toHaveClass('border-border', 'border-l');
    expect(panel).not.toHaveClass('border-r');
  });

  it('passes through element type, layout classes and attributes like Surface', () => {
    render(
      <PanelSurface as="aside" aria-label="Details" className="flex h-full" data-testid="panel">
        content
      </PanelSurface>,
    );
    const panel = screen.getByRole('complementary', { name: 'Details' });
    expect(panel).toHaveClass('flex', 'h-full', 'border-r');
  });
});
