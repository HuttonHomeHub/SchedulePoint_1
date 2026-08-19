import type { OrganisationOverview, OrganizationRole } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverviewScreen } from './OverviewScreen';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetch } from '@/lib/api/client';

/**
 * The overview screen's states, and the two things that are easy to get wrong here.
 *
 * **The role matrix is asserted by ABSENCE, not by hiding.** "Needs your attention" is not rendered
 * at all for a Viewer or a Contributor — spec §2 US-2 says no heading, no empty box, no shaded
 * placeholder — so every one of those assertions queries for the heading and expects `null`. A test
 * that only checked the items would pass against an empty frame, which is the defect the rule
 * exists to prevent.
 *
 * **An absent count and a zero count are different facts and are tested separately.** The endpoint
 * omits `pendingInvitationCount` for a reader who may not see it and sends `0` for a reader who may
 * see it and has none. A component testing `!count` collapses those, and both look identical on
 * screen — so the retention-off case asserts the item is absent while a real zero also renders
 * nothing, and the distinction lives in what the payload carries.
 */
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

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

const ORG_SLUG = 'acme';

function overview(over: Partial<OrganisationOverview> = {}): OrganisationOverview {
  return {
    organisationName: 'Acme Construction',
    isNewOrganisation: false,
    hasPlans: true,
    recentlyChanged: [],
    attention: { heldLocks: [] },
    ...over,
  };
}

function plan(over: Partial<OrganisationOverview['recentlyChanged'][number]> = {}) {
  return {
    planId: 'p1',
    planName: 'Northgate — Phase 1',
    projectId: 'pr1',
    projectName: 'Northgate',
    clientName: 'Bellway',
    status: 'ACTIVE' as const,
    changedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    changedBy: { kind: 'MEMBER' as const, name: 'Sarah Okonkwo' },
    ...over,
  };
}

/**
 * Renders the screen with the org list resolved to `role` and the overview resolved to `payload`
 * (or left pending / rejected). One mock serves both endpoints because `useOrgRole` reads the
 * already-loaded organisations query rather than issuing one of its own.
 */
function renderScreen({
  role = 'PLANNER',
  payload,
  pending = false,
  fail = false,
}: {
  role?: OrganizationRole;
  payload?: OrganisationOverview;
  pending?: boolean;
  fail?: boolean;
} = {}): void {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === '/organizations') {
      return Promise.resolve([{ id: 'o1', name: 'Acme Construction', slug: ORG_SLUG, role }]);
    }
    if (pending) return new Promise(() => {});
    if (fail) return Promise.reject(new Error('boom'));
    return Promise.resolve(payload ?? overview());
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AnnouncerProvider>
        <OverviewScreen orgSlug={ORG_SLUG} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('OverviewScreen — frame', () => {
  it('renders the organisation name as the only h1, and adds no landmark', async () => {
    renderScreen({ payload: overview({ recentlyChanged: [plan()] }) });

    await screen.findByRole('heading', { level: 1, name: 'Acme Construction' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // The app shell owns the single <main>; a second one here would give every authenticated
    // screen two landmarks with nothing to tell a reader which held the content.
    expect(screen.queryByRole('main')).toBeNull();
  });

  it('shows the sections as h2, below the page heading', async () => {
    renderScreen({ payload: overview({ recentlyChanged: [plan()] }) });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Recently changed' }),
    ).toBeVisible();
  });
});

describe('OverviewScreen — states', () => {
  it('shows skeletons while loading, and no rows', () => {
    renderScreen({ pending: true });

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: /Northgate/ })).toBeNull();
  });

  it('offers one Retry when the request fails, keeping the heading', async () => {
    renderScreen({ fail: true });

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    // A failed page is not a page that pretends the attention section is empty.
    expect(screen.queryByRole('heading', { name: 'Needs your attention' })).toBeNull();
  });

  it('renders a plan with its project, client, actor and an exact instant', async () => {
    const changedAt = '2026-08-19T09:00:00.000Z';
    renderScreen({ payload: overview({ recentlyChanged: [plan({ changedAt })] }) });

    expect(await screen.findByRole('link', { name: 'Northgate — Phase 1' })).toBeVisible();
    expect(screen.getByText(/Northgate · Bellway/)).toBeVisible();
    expect(screen.getByText('Sarah Okonkwo')).toBeVisible();
    expect(document.querySelector('time')).toHaveAttribute('datetime', changedAt);
  });

  it('names a draft, and says nothing about an active plan', async () => {
    renderScreen({
      payload: overview({
        recentlyChanged: [plan({ status: 'DRAFT' }), plan({ planId: 'p2', planName: 'Live' })],
      }),
    });

    expect(await screen.findByText('Draft')).toBeVisible();
    expect(screen.queryByText('Active')).toBeNull();
  });
});

describe('OverviewScreen — who changed it', () => {
  it('names a member', async () => {
    renderScreen({ payload: overview({ recentlyChanged: [plan()] }) });
    expect(await screen.findByText('Sarah Okonkwo')).toBeVisible();
  });

  it('does not disclose the name of somebody who has left', async () => {
    renderScreen({
      payload: overview({ recentlyChanged: [plan({ changedBy: { kind: 'FORMER_MEMBER' } })] }),
    });
    expect(await screen.findByText('A former member')).toBeVisible();
  });

  it('says Unknown rather than dropping an unattributed row', async () => {
    renderScreen({
      payload: overview({ recentlyChanged: [plan({ changedBy: { kind: 'UNKNOWN' } })] }),
    });
    expect(await screen.findByText('Unknown')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Northgate — Phase 1' })).toBeVisible();
  });
});

describe('OverviewScreen — the two empties are different facts', () => {
  it('says the list is empty when the organisation has plans but none listed', async () => {
    renderScreen({ payload: overview({ hasPlans: true, recentlyChanged: [] }) });

    expect(await screen.findByText('No plans have changed here yet.')).toBeVisible();
    expect(screen.queryByText('No plans yet')).toBeNull();
  });

  it('says the organisation has no plans instead of listing an empty section', async () => {
    renderScreen({ payload: overview({ hasPlans: false }) });

    expect(await screen.findByText('No plans yet')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Recently changed' })).toBeNull();
  });
});

describe('OverviewScreen — the new organisation, role-aware', () => {
  it('offers a writer the first client', async () => {
    renderScreen({
      role: 'PLANNER',
      payload: overview({ isNewOrganisation: true, hasPlans: false }),
    });

    expect(await screen.findByText('This organisation is empty')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add your first client' })).toBeVisible();
  });

  it('offers a Viewer no action, and says who can act', async () => {
    renderScreen({
      role: 'VIEWER',
      payload: overview({ isNewOrganisation: true, hasPlans: false }),
    });

    expect(await screen.findByText('This organisation is empty')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Add your first client' })).toBeNull();
    expect(screen.getByText('Ask a Planner or Org Admin to add the first client.')).toBeVisible();
  });
});

describe('OverviewScreen — needs your attention', () => {
  const HELD = overview({
    recentlyChanged: [plan()],
    attention: {
      heldLocks: [{ planId: 'p1', planName: 'Northgate — Phase 1', requestedBy: null }],
    },
  });

  it('tells a Planner they are holding the pen', async () => {
    renderScreen({ role: 'PLANNER', payload: HELD });

    expect(await screen.findByRole('heading', { name: 'Needs your attention' })).toBeVisible();
    expect(screen.getByText('You are holding the editing lock.')).toBeVisible();
  });

  it('names the peer waiting for control', async () => {
    renderScreen({
      role: 'ORG_ADMIN',
      payload: overview({
        recentlyChanged: [plan()],
        attention: {
          heldLocks: [
            {
              planId: 'p1',
              planName: 'Northgate — Phase 1',
              requestedBy: { kind: 'MEMBER', name: 'Priya' },
            },
          ],
        },
      }),
    });

    expect(await screen.findByText(/has asked for control/)).toBeVisible();
    expect(screen.getByText('Priya')).toBeVisible();
  });

  it.each(['VIEWER', 'CONTRIBUTOR'] as const)(
    'renders no section at all for a %s — not an empty one',
    async (role) => {
      renderScreen({ role, payload: HELD });

      await screen.findByRole('heading', { name: 'Recently changed' });
      expect(screen.queryByRole('heading', { name: 'Needs your attention' })).toBeNull();
      expect(screen.queryByText('Nothing needs you right now.')).toBeNull();
    },
  );

  it('settles on a fact, not an empty state, when a writer has nothing waiting', async () => {
    renderScreen({ role: 'PLANNER', payload: overview({ recentlyChanged: [plan()] }) });

    expect(await screen.findByText('Nothing needs you right now.')).toBeVisible();
  });

  it('links pending invitations to Members', async () => {
    renderScreen({
      role: 'ORG_ADMIN',
      payload: overview({
        recentlyChanged: [plan()],
        attention: { heldLocks: [], pendingInvitationCount: 3 },
      }),
    });

    expect(
      await screen.findByRole('link', { name: '3 invitations are still pending' }),
    ).toBeVisible();
  });

  it('shows no expiry item when the count is absent — retention off on this host', async () => {
    renderScreen({
      role: 'ORG_ADMIN',
      payload: overview({
        recentlyChanged: [plan()],
        attention: { heldLocks: [], pendingInvitationCount: 0 },
      }),
    });

    await screen.findByText('Nothing needs you right now.');
    expect(screen.queryByText(/removed for good/)).toBeNull();
    // A zero invitation count is a fact about the organisation and still renders nothing —
    // the item exists to be acted on, and there is nothing to act on.
    expect(screen.queryByText(/still pending/)).toBeNull();
  });

  it('warns about work about to be removed for good', async () => {
    renderScreen({
      role: 'ORG_ADMIN',
      payload: overview({
        recentlyChanged: [plan()],
        attention: { heldLocks: [], expiringDeletedCount: 2 },
      }),
    });

    expect(
      await screen.findByRole('link', { name: '2 deleted items are about to be removed for good' }),
    ).toBeVisible();
  });
});

describe('OverviewScreen — announcements', () => {
  it('announces the settled count once, after a skeleton', async () => {
    renderScreen({ payload: overview({ recentlyChanged: [plan(), plan({ planId: 'p2' })] }) });

    await waitFor(() => {
      expect(screen.getByTestId('announcer')).toHaveTextContent('2 recently changed plans.');
    });
  });
});
