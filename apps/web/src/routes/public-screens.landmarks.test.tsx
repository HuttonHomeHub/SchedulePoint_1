import type { InvitationPreview, MeResponse } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcceptInviteScreen } from './accept-invite';
import { ForgotPasswordScreen } from './forgot-password';
import { ResetPasswordScreen } from './reset-password';
import { SignInScreen } from './sign-in';
import { SignUpScreen } from './sign-up';
import { VerifyEmailScreen } from './verify-email';

import {
  expectPublicHeading,
  expectSinglePublicLandmark,
} from '@/components/layout/auth-shell-assertions';
import { apiFetch } from '@/lib/api/client';

/**
 * The landmark sweep over the public screens (ADR-0077 M2-T3, step 4).
 *
 * Every landable state has to be a whole page: **one `main`, one `<h1>`, and the `<h1>` describing
 * the state the reader is in.** That third clause is the one that was broken — `/reset-password`
 * kept "Choose a new password" as its heading over a body that had already said the password was
 * changed, because the heading lived in the route and the outcome lived in the form.
 *
 * This is the net for M4, which rebuilds all six screens onto the brand surface. It asserts
 * headings by **text**, never by markup, so the rebuild should pass it unchanged — the property
 * ADR-0062's extraction was proved by.
 *
 * It covers the states reachable from a first render. The submitted/terminal states that need a
 * round trip are asserted in each route's own suite, where the mutation is already mocked.
 */
const search = vi.hoisted<{ value: Record<string, unknown> }>(() => ({ value: {} }));

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ history: { push: vi.fn() }, navigate: vi.fn() }),
  useNavigate: () => vi.fn(),
  useSearch: () => search.value,
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    sendVerificationEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PASSWORD_RESET_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

const MEMBER: MeResponse = {
  user: { id: 'u1', email: 'ada@example.com', name: 'Ada', emailVerified: true, image: null },
  memberships: [],
};

const INVITE: InvitationPreview = {
  email: 'ada@example.com',
  role: 'PLANNER',
  organizationName: 'Hutton Home Hub',
  status: 'PENDING',
  expiresAt: '2030-01-01T00:00:00.000Z',
  requiresEmailVerification: false,
};

function mount(
  screenElement: React.ReactElement,
  params: Record<string, unknown> = {},
  session: MeResponse | null = null,
) {
  search.value = params;
  vi.mocked(apiFetch).mockImplementation((path: string) =>
    Promise.resolve(path === '/me' ? session : INVITE),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{screenElement}</QueryClientProvider>);
}

afterEach(() => {
  search.value = {};
  vi.clearAllMocks();
});

describe('every public screen is one page with one heading', () => {
  it('sign-in', () => {
    mount(<SignInScreen />);
    expectPublicHeading('Sign in');
  });

  it('sign-up', () => {
    mount(<SignUpScreen />);
    expectPublicHeading('Create an account');
  });

  it('forgot-password — the form', async () => {
    mount(<ForgotPasswordScreen />);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expectPublicHeading('Reset your password');
  });

  it('forgot-password — already signed in', async () => {
    mount(<ForgotPasswordScreen />, {}, MEMBER);
    await screen.findByRole('link', { name: 'Go to your account' });
    expectPublicHeading('You are already signed in');
  });

  it('reset-password — no token', () => {
    mount(<ResetPasswordScreen />);
    expectPublicHeading('That link is no longer valid');
  });

  it('reset-password — with a token', () => {
    mount(<ResetPasswordScreen />, { token: 'tok' });
    expectPublicHeading('Choose a new password');
  });

  it('verify-email — verified', () => {
    mount(<VerifyEmailScreen />, { verified: '1' });
    expectPublicHeading('Email verified');
  });

  it('verify-email — the link failed', () => {
    mount(<VerifyEmailScreen />, { error: 'TOKEN_EXPIRED' });
    expectPublicHeading('That link did not work');
  });

  it('verify-email — waiting', () => {
    mount(<VerifyEmailScreen />, { email: 'ada@example.com' });
    expectPublicHeading('Verify your email');
  });

  it('accept-invite — no token', () => {
    mount(<AcceptInviteScreen />, {});
    expectPublicHeading('Invitation not found');
  });

  it('accept-invite — loading has no heading yet, and never two', () => {
    mount(<AcceptInviteScreen />, { token: 'tok' });
    expect(screen.getByText('Loading invitation…')).toBeInTheDocument();
    expectSinglePublicLandmark();
  });

  it('accept-invite — ready to accept', async () => {
    mount(<AcceptInviteScreen />, { token: 'tok' }, MEMBER);
    await screen.findByRole('button', { name: 'Accept and join' });
    expectPublicHeading('Join Hutton Home Hub');
  });

  it('accept-invite — wrong account', async () => {
    mount(
      <AcceptInviteScreen />,
      { token: 'tok' },
      { ...MEMBER, user: { ...MEMBER.user, email: 'grace@example.com' } },
    );
    await screen.findByRole('button', { name: 'Sign out' });
    expectPublicHeading('Wrong account');
  });
});
