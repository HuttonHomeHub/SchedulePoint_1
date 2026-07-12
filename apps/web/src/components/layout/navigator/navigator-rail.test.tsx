import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NavigatorRail, NavigatorRailCollapsed } from './navigator-rail';

describe('NavigatorRail', () => {
  it('renders the Project Explorer landmark, hinting to pick an org when none is active', () => {
    render(<NavigatorRail />);
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
    expect(screen.getByText(/select an organisation/i)).toBeInTheDocument();
  });

  it('shows a collapse control (pinned rail) that fires onCollapse', () => {
    const onCollapse = vi.fn();
    render(<NavigatorRail onCollapse={onCollapse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Project Explorer' }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Close Project Explorer' }),
    ).not.toBeInTheDocument();
  });

  it('shows a close control (drawer) that fires onClose', () => {
    const onClose = vi.fn();
    render(<NavigatorRail onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Project Explorer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('NavigatorRailCollapsed', () => {
  it('offers a single control to reopen the rail', () => {
    const onExpand = vi.fn();
    render(<NavigatorRailCollapsed onExpand={onExpand} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Project Explorer' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
