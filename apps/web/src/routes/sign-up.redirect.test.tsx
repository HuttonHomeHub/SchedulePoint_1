import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * **The `?redirect=` guard, through the REAL router** (found in Chromium by the accessibility
 * review). Every other suite mocks `useSearch` and hands the screen a literal, so none of them could
 * see that a non-strict `useSearch` merges the raw query into the route's validated search: a value
 * the route's `validateSearch` dropped still reached the component, which spent it. On `/sign-up`
 * that sent a new user to `/evil.test`, or threw a SecurityError from `pushState`.
 *
 * Fresh module graph per test, as `org-not-found-router.test.tsx` does, because the router is a
 * module-level singleton.
 */
async function boot(url: string) {
  vi.resetModules();
  vi.doMock('@/lib/auth-client', () => ({
    authClient: {
      signUp: { email: vi.fn().mockResolvedValue({ data: { token: 't' }, error: null }) },
    },
  }));
  vi.doMock('@/lib/api/client', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, apiFetch: vi.fn().mockResolvedValue(null) };
  });
  const React = await import('react');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { RouterProvider, createMemoryHistory } = await import('@tanstack/react-router');
  const { fireEvent, render, screen, waitFor } = await import('@testing-library/react');
  const { router } = await import('@/app/router');
  const { sessionKeys } = await import('@/features/auth');

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(sessionKeys.session, null);
  router.update({
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient },
  });
  const push = vi.spyOn(router.history, 'push').mockImplementation(() => {});
  render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(RouterProvider, { router }),
    ),
  );
  await screen.findByRole('heading', { name: 'Create an account' });

  const submit = async (): Promise<void> => {
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-horse-battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
  };
  return { screen, push, submit };
}

const HOSTILE = [
  '//evil.test',
  'https://evil.test',
  '/\\evil.test',
  'javascript:alert(1)',
  '/\t/evil.test',
];

describe('/sign-up with a ?redirect= through the real router', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/auth-client');
    vi.doUnmock('@/lib/api/client');
    vi.restoreAllMocks();
  });

  it.each(HOSTILE)('ignores %j: no redirect on Sign in, and sign-up lands on /', async (value) => {
    const { screen, push, submit } = await boot(`/sign-up?redirect=${encodeURIComponent(value)}`);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    await submit();
    expect(push).toHaveBeenCalledWith('/');
  });

  it('keeps a real invitation path, spends it after sign-up and carries it to Sign in', async () => {
    const redirect = '/accept-invite?token=abc_DEF-123';
    const { screen, push, submit } = await boot(
      `/sign-up?redirect=${encodeURIComponent(redirect)}`,
    );

    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toContain(
      `redirect=${encodeURIComponent(redirect)}`,
    );
    await submit();
    expect(push).toHaveBeenCalledWith(redirect);
  });

  it('takes the invitation token out of the address bar once it has been captured', async () => {
    const redirect = '/accept-invite?token=abc';
    const { screen } = await boot(`/sign-up?redirect=${encodeURIComponent(redirect)}`);
    const { router } = await import('@/app/router');

    await vi.waitFor(() => expect(router.state.location.search).toEqual({}));
    // …and the captured value still drives the link.
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toContain(
      encodeURIComponent(redirect),
    );
  });
});
