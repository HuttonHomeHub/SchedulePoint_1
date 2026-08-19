import type { RecentPlan } from '@repo/types';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { JumpBackInSection } from './JumpBackInSection';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
    params?: unknown;
  }) => (
    <a href={typeof to === 'string' ? to : '/'} {...props}>
      {children}
    </a>
  ),
}));

function plan(over: Partial<RecentPlan> = {}): RecentPlan {
  return {
    planId: 'p1',
    planName: 'Northgate — Phase 1',
    projectName: 'Northgate',
    clientName: 'Bellway',
    ...over,
  };
}

describe('JumpBackInSection', () => {
  it('renders the server’s order, which is the order the browser asked in', () => {
    render(
      <JumpBackInSection
        orgSlug="acme"
        plans={[plan({ planId: 'p2', planName: 'Second' }), plan({ planName: 'First' })]}
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Second', 'First']);
  });

  it('renders nothing at all when there is nothing to offer', () => {
    // Absent, not empty. A second device, a new browser, private mode and a first sign-in all
    // land here, and a permanently blank section addressed to the reader personally is worse
    // than no section — the same rule "Needs your attention" follows one section along.
    const { container } = render(<JumpBackInSection orgSlug="acme" plans={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading', { name: 'Jump back in' })).toBeNull();
  });

  it('shows the name the SERVER sent, never one a browser cached', () => {
    // The regression test for the failure named when this was approved: the store holds ids only,
    // so a renamed plan must render its current name. There is no client-side name to disagree.
    render(<JumpBackInSection orgSlug="acme" plans={[plan({ planName: 'Renamed since' })]} />);
    expect(screen.getByRole('link', { name: 'Renamed since' })).toBeVisible();
  });

  it('is a named region like every other section', () => {
    render(<JumpBackInSection orgSlug="acme" plans={[plan()]} />);
    expect(screen.getByRole('region', { name: 'Jump back in' })).toBeInTheDocument();
  });
});
