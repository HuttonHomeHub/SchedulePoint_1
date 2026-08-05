import type { InvitationPreview, MeResponse } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcceptInvitationCard } from './AcceptInvitationCard';

import { apiFetch } from '@/lib/api/client';

/**
 * ADR-0074 M2-T6 — the fourth first-class refusal, and (M5) the defect this suite failed to catch.
 *
 * The refusal exists because the pre-ADR-0074 card held `user.emailVerified` and never read it: the
 * Accept button rendered, the server's 403 fired on the click, and the reason landed in the generic
 * error paragraph with no way forward.
 *
 * **This file originally asserted only `emailVerified`, with no case for the server's setting — so
 * it passed while the card blocked every invitee in the running deployment.** With
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` off, every account is unverified; the card refused on that
 * alone, and the base Playwright journey found it. The fixture is now parameterised on
 * `requiresEmailVerification`, which is what the server reports about **itself**, and the case that
 * was broken — enforcement off, address unverified, Accept offered — is the first test below.
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

function preview(requiresEmailVerification: boolean): InvitationPreview {
  return {
    email: 'ada@example.com',
    role: 'PLANNER',
    organizationName: 'Hutton Home Hub',
    status: 'PENDING',
    expiresAt: '2030-01-01T00:00:00.000Z',
    requiresEmailVerification,
  };
}

function me(emailVerified: boolean): MeResponse {
  return {
    user: { id: 'u1', email: 'ada@example.com', name: 'Ada', emailVerified, image: null },
    memberships: [],
  };
}

function renderCard({ emailVerified, enforced }: { emailVerified: boolean; enforced: boolean }) {
  const session = me(emailVerified);
  vi.mocked(apiFetch).mockImplementation((path: string) =>
    Promise.resolve(path === '/me' ? session : preview(enforced)),
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
  it('offers Accept to an unverified invitee when the server does NOT enforce verification', async () => {
    // The defect (ADR-0074 M5). This is the running deployment: enforcement off, so **every**
    // account is unverified. Refusing here blocked every invitee in the product, and this suite
    // could not see it because it had no case where the two inputs disagreed.
    renderCard({ emailVerified: false, enforced: false });

    expect(await screen.findByRole('button', { name: /accept and join/i })).toBeVisible();
    expect(screen.queryByText('Confirm your email address first')).not.toBeInTheDocument();
  });

  it('explains and offers a resend when the server WOULD refuse', async () => {
    renderCard({ emailVerified: false, enforced: true });

    expect(await screen.findByText('Confirm your email address first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send another verification email/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /accept and join/i })).not.toBeInTheDocument();
  });

  it('offers Accept once the address is verified, enforced or not', async () => {
    renderCard({ emailVerified: true, enforced: true });

    expect(await screen.findByRole('button', { name: /accept and join/i })).toBeVisible();
    expect(screen.queryByText('Confirm your email address first')).not.toBeInTheDocument();
  });
});
