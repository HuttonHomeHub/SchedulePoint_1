import type { InvitationPreview, MeResponse } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcceptInvitationCard } from './AcceptInvitationCard';

import { apiFetch } from '@/lib/api/client';

/**
 * ADR-0074 M2-T6 — the fourth first-class refusal.
 *
 * Fails against the pre-ADR-0074 card, which held `user.emailVerified` and never read it: the
 * Accept button rendered, the server's 403 fired on the click, and the reason landed in the generic
 * error paragraph with no way forward. **Not reachable today** — the server guard is itself gated
 * on `requireEmailVerification` — which is why it is a latent dead end and why the test asserts the
 * state directly rather than waiting for a server that will not refuse.
 */
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: vi.fn() }),
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

const PREVIEW: InvitationPreview = {
  email: 'ada@example.com',
  role: 'PLANNER',
  organizationName: 'Hutton Home Hub',
  status: 'PENDING',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

function me(emailVerified: boolean): MeResponse {
  return {
    user: { id: 'u1', email: 'ada@example.com', name: 'Ada', emailVerified, image: null },
    memberships: [],
  };
}

function renderCard(session: MeResponse) {
  vi.mocked(apiFetch).mockImplementation((path: string) =>
    Promise.resolve(path === '/me' ? session : PREVIEW),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AcceptInvitationCard token="tok" />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('AcceptInvitationCard — the unverified refusal', () => {
  it('explains and offers a resend instead of an Accept the server would refuse', async () => {
    renderCard(me(false));

    expect(await screen.findByText('Confirm your email address first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send another verification email/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /accept and join/i })).not.toBeInTheDocument();
  });

  it('offers Accept normally once the address is verified', async () => {
    renderCard(me(true));

    expect(await screen.findByRole('button', { name: /accept and join/i })).toBeVisible();
    expect(screen.queryByText('Confirm your email address first')).not.toBeInTheDocument();
  });
});
