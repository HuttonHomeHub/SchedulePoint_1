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
    // BOTH slots (ADR-0097 D1b) — asserted by name, because they sit in different places and a
    // bare `[data-chrome-slot]` query would be satisfied by either one.
    expect(band!.querySelector('[data-chrome-slot="rows"]')).not.toBeNull();
    expect(band!.querySelector('[data-chrome-slot="identity"]')).not.toBeNull();
    // The identity slot is INSIDE the header row, which is the whole point of the merge: a plan's
    // identity line costs the band no height of its own.
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
    expect(slot('identity').childElementCount).toBe(0);

    rerender(
      <ChromeBand>
        <ChromePortal>
          <div data-testid="toolbar-rows" />
        </ChromePortal>
        <ChromePortal name="identity">
          <div data-testid="plan-identity" />
        </ChromePortal>
      </ChromeBand>,
    );
    expect(slot('rows')).toContainElement(screen.getByTestId('toolbar-rows'));
    // Each portal lands in ITS OWN slot. Asserting both ways round matters: a `name` that fell
    // through to the default would put the identity line in the rows slot, which paints in a
    // plausible-looking place and silently undoes the merge.
    expect(slot('identity')).toContainElement(screen.getByTestId('plan-identity'));
    expect(slot('rows')).not.toContainElement(screen.getByTestId('plan-identity'));
  });
});
