import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChromeBand } from './chrome-band';
import { ChromePortal } from './chrome-slot';

/**
 * The band's structure (ADR-0055 §3): one full-bleed chrome band carrying the header row and a slot,
 * with everything else below it. The band is deliberately not plan-aware — it owns a slot, and a
 * plan workspace decides whether to portal anything into it, so the shell stays ignorant of plans
 * (ADR-0029) and does not remount when one opens.
 */
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({}),
  useRouterState: () => '/',
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { email: 'ada@example.com' } } }),
  useSignOut: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/organizations', () => ({ OrgSwitcher: () => null }));
vi.mock('@/hooks/use-org-role', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOrgRole: () => 'PLANNER',
}));
// The band suites are about STRUCTURE; the chip has its own suite and needs a theme provider.
vi.mock('@/components/layout/account-chip', () => ({
  AccountChip: () => <button type="button">Account</button>,
}));

describe('ChromeBand', () => {
  it('wraps the header and the slot in ONE chrome surface', () => {
    const { container } = render(
      <ChromeBand>
        <div data-testid="below" />
      </ChromeBand>,
    );
    const band = container.querySelector('[data-surface="chrome"]');
    expect(band).not.toBeNull();
    expect(band).toContainElement(screen.getByRole('banner'));
    expect(band!.querySelector('[data-chrome-slot="rows"]')).not.toBeNull();
    // **Two slots again** (the one-row header, 2026-08-26). ADR-0097 D1b added an `identity` slot so
    // a plan's identity line could reach the app header row; Graphite M3 deleted that row and merged
    // the line into the mode row, which the workspace rendered itself, so this assertion read
    // `toBeNull()` from then until now. The header row exists at every width again and it wraps, so
    // the identity is portalled back into it and the band no longer carries a row of its own for it.
    expect(band!.querySelector('[data-chrome-slot="identity"]')).not.toBeNull();
    // And it is INSIDE the header landmark, not merely inside the band — which is what makes it one
    // row rather than two.
    expect(screen.getByRole('banner')).toContainElement(
      band!.querySelector('[data-chrome-slot="identity"]'),
    );
    // Everything else is BELOW the band, not inside it.
    expect(band).not.toContainElement(screen.getByTestId('below'));
  });

  it('goes full-bleed — the measure cap belongs to content, not to chrome', () => {
    const { container } = render(
      <ChromeBand>
        <div />
      </ChromeBand>,
    );
    expect(container.querySelector('header .max-w-6xl')).toBeNull();
  });

  it('is one row with nothing portalled, and grows when a plan portals its toolbar', () => {
    // Height is content-driven rather than fixed: a fixed band would either waste a strip on
    // every non-plan screen or clip the toolbar (R4).
    const { rerender, container } = render(
      <ChromeBand>
        <div />
      </ChromeBand>,
    );
    const slot = (name: string) => container.querySelector(`[data-chrome-slot="${name}"]`)!;
    expect(slot('rows').childElementCount).toBe(0);

    rerender(
      <ChromeBand>
        <ChromePortal>
          <div data-testid="toolbar-rows" />
        </ChromePortal>
      </ChromeBand>,
    );
    expect(slot('rows')).toContainElement(screen.getByTestId('toolbar-rows'));
  });
});
