import type { MeResponse, MyInvitation } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingScreen } from './onboarding';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { ApiFetchError, apiFetch, apiFetchAllPages } from '@/lib/api/client';

/**
 * ADR-0221 M2: the first screen offers the invitations waiting for the confirmed address. With none
 * (or with the read failing) it is exactly the create-an-organisation screen it always was.
 */
const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ navigate }) }));

vi.mock('@/features/organizations', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CreateOrganizationForm: () => <p>create form</p> };
});

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn(), apiFetchAllPages: vi.fn() };
});

const ME: MeResponse = {
  user: { id: 'u1', email: 'ada@example.com', name: 'Ada', emailVerified: true, image: null },
  memberships: [],
};

const HUTTON: MyInvitation = {
  id: 'i1',
  organizationName: 'Hutton Home Hub',
  role: 'PLANNER',
  expiresAt: '2030-01-01T00:00:00.000Z',
};
const ACME: MyInvitation = { ...HUTTON, id: 'i2', organizationName: 'Acme', role: 'VIEWER' };

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <OnboardingScreen />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

function serve(invitations: MyInvitation[] | Error) {
  vi.mocked(apiFetch).mockImplementation((path: string) =>
    Promise.resolve(path === '/me' ? ME : undefined),
  );
  vi.mocked(apiFetchAllPages).mockImplementation(() =>
    invitations instanceof Error ? Promise.reject(invitations) : Promise.resolve(invitations),
  );
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('OnboardingScreen — invitations', () => {
  it('is today’s screen exactly when nothing is waiting', async () => {
    serve([]);
    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your organisation' }),
    ).toBeVisible();
    expect(screen.queryByText(/you.ve been invited/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('announcer')).toBeEmptyDOMElement();
  });

  it('holds one loading shape, then draws the offer and the form together', async () => {
    let settle: (rows: MyInvitation[]) => void = () => {};
    vi.mocked(apiFetch).mockResolvedValue(ME);
    vi.mocked(apiFetchAllPages).mockReturnValue(new Promise((resolve) => (settle = resolve)));
    renderScreen();

    expect(document.querySelector('[data-loading-shape]')).not.toBeNull();
    expect(screen.queryByText('create form')).not.toBeInTheDocument();

    settle([HUTTON]);
    expect(await screen.findByText('Join Hutton Home Hub')).toBeVisible();
    expect(screen.getByText('create form')).toBeVisible();
    expect(document.querySelector('[data-loading-shape]')).toBeNull();
  });

  it('lists each invitation with its own named button, under one h1', async () => {
    serve([HUTTON, ACME]);
    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 1, name: /you.ve been invited/i }),
    ).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('You’ve been invited as Planner.')).toBeVisible();
    expect(screen.getByText('You’ve been invited as Viewer.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept and join Hutton Home Hub' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept and join Acme' })).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Create your organisation' }),
    ).toBeVisible();
  });

  it('announces the count once', async () => {
    serve([HUTTON, ACME]);
    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('You have 2 invitations waiting.'),
    );
  });

  it('accepts by id, then enters the organisation', async () => {
    serve([HUTTON]);
    renderScreen();
    vi.mocked(apiFetch).mockImplementation((path: string) =>
      Promise.resolve(
        path === '/me/invitations/i1/accept'
          ? { id: 'o1', slug: 'hutton', name: 'Hutton Home Hub', role: 'PLANNER' }
          : ME,
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: /accept and join/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/orgs/$orgSlug',
        params: { orgSlug: 'hutton' },
      }),
    );
    expect(apiFetch).toHaveBeenCalledWith('/me/invitations/i1/accept', { method: 'POST' });
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('Joined Hutton Home Hub.'),
    );
  });

  it.each([
    [410, 'This invitation has expired.'],
    [410, 'This invitation is no longer valid.'],
    [409, 'You are already a member of this organisation.'],
    [404, 'Invitation not found.'],
  ])('shows the server’s sentence for a %i: %s', async (status, message) => {
    serve([HUTTON]);
    renderScreen();
    vi.mocked(apiFetch).mockImplementation((path: string) =>
      path === '/me/invitations/i1/accept'
        ? Promise.reject(new ApiFetchError(status, { code: 'X', message }))
        : Promise.resolve(ME),
    );

    fireEvent.click(await screen.findByRole('button', { name: /accept and join/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    // A re-focused button reads the reason, not only its name.
    expect(screen.getByRole('button', { name: /accept and join/i })).toHaveAccessibleDescription(
      message,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says plainly that the limit was hit on a 429', async () => {
    serve([HUTTON]);
    renderScreen();
    vi.mocked(apiFetch).mockImplementation((path: string) =>
      path === '/me/invitations/i1/accept'
        ? Promise.reject(
            new ApiFetchError(429, { code: 'THROTTLED', message: 'ThrottlerException' }),
          )
        : Promise.resolve(ME),
    );

    fireEvent.click(await screen.findByRole('button', { name: /accept and join/i }));

    expect(await screen.findByRole('alert')).not.toHaveTextContent('ThrottlerException');
  });

  it('settles a failed read as none, so the form is still there', async () => {
    serve(new Error('network down'));
    renderScreen();

    expect(await screen.findByText('create form')).toBeVisible();
    expect(screen.queryByText(/you.ve been invited/i)).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
});
