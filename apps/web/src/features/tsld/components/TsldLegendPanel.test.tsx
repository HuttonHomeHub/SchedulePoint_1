import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

// This is the BASE / flag-OFF legend suite: pin `VITE_CANVAS_DIRECT_MANIPULATION` off (it now
// defaults ON, ADR-0052) so the key stays the pre-refresh vocabulary — the M4/M5 visual-refresh
// rows have their own flag-on suite (TsldLegend.visual-refresh.test.tsx).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DIRECT_MANIPULATION_ENABLED: false,
}));

import { TsldLegendPanel } from './TsldLegendPanel';

describe('TsldLegendPanel', () => {
  it('renders nothing while closed', () => {
    const { container } = render(
      <TsldLegendPanel open={false} position={null} onClose={vi.fn()} onPositionChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the labelled key and a hide control while open', () => {
    render(<TsldLegendPanel open position={null} onClose={vi.fn()} onPositionChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Diagram legend' })).toBeInTheDocument();
    // The key itself is the shared TsldLegend list.
    expect(screen.getByRole('list', { name: 'Legend' })).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    // Flag-off parity (ADR-0052 M4/M5, pinned off above): none of the visual-refresh rows render
    // without `VITE_CANVAS_DIRECT_MANIPULATION` — the rollback key is byte-identical to the
    // pre-refresh one.
    expect(screen.queryByText('Level of effort')).not.toBeInTheDocument();
    expect(screen.queryByText('WBS summary')).not.toBeInTheDocument();
    expect(screen.queryByText('Progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Lag (waiting time)')).not.toBeInTheDocument();
  });

  it('closes via the hide button', () => {
    const onClose = vi.fn();
    render(<TsldLegendPanel open position={null} onClose={onClose} onPositionChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide legend' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies the saved drag position as an inline offset', () => {
    render(
      <TsldLegendPanel
        open
        position={{ x: 40, y: 24 }}
        onClose={vi.fn()}
        onPositionChange={vi.fn()}
      />,
    );
    const panel = screen.getByRole('group', { name: 'Diagram legend' });
    expect(panel).toHaveStyle({ left: '40px', top: '24px' });
  });

  it('has no axe violations while open', async () => {
    const { container } = render(
      <TsldLegendPanel open position={null} onClose={vi.fn()} onPositionChange={vi.fn()} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
