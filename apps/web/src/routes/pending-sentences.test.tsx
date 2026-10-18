import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MembersScreen } from './members';

import { ClientsTable } from '@/features/clients/components/ClientsTable';

/**
 * **A pending page speaks one sentence per pending surface, and never inside `aria-busy`**
 * (loading-skeletons spec §4.7 rule 2; second reading in `m7-after-measurement.md`).
 *
 * Every read here never resolves, so the page stays in its pending picture. The second reading
 * found several regions per site, and this pins what the product itself mounts at once: the extras
 * were a `RoutePending` status that had unmounted before the page existed and sibling sections that
 * had already settled, both counted by an instrument that never asked whether a region was still
 * there. A page with two reads in flight (the members roster and its invitations) owns two
 * surfaces and so two sentences, each naming its own subject; a page with one owns one.
 */
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({ orgSlug: 'acme' }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock('@/hooks/use-org-role', () => ({
  useOrgRole: () => 'ORG_ADMIN',
  canAdministerInvitations: () => true,
}));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(() => new Promise(() => {})) }));

function inQueryClient(ui: React.ReactElement): React.ReactElement {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>
  );
}

function sentences(): string[] {
  const regions = screen.queryAllByRole('status');
  for (const region of regions) expect(region.closest('[aria-busy="true"]')).toBeNull();
  return regions.map((r) => r.textContent ?? '');
}

describe('a pending page speaks one sentence per pending surface', () => {
  it('the clients table: exactly one, naming clients', () => {
    render(inQueryClient(<ClientsTable orgSlug="acme" canWrite />));
    expect(sentences()).toEqual(['Loading clients…']);
  });

  it('the members page: one for the roster and one for the invitations, nothing generic', () => {
    render(inQueryClient(<MembersScreen />));
    expect(sentences().sort()).toEqual(['Loading invitations…', 'Loading members…']);
  });
});
