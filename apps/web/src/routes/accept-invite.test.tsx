import type { InvitationPreview, MeResponse } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcceptInviteScreen } from './accept-invite';

import { apiFetch } from '@/lib/api/client';

/**
 * ADR-0077 M0-T1 — the ten `accept-invite` states (spec §2.2 rows 28–37), driven through the
 * **route** rather than the card, because one of them (no token) belongs to the route and had no
 * test at all.
 *
 * Two things this file is deliberately doing.
 *
 * **1. It asserts behaviour and accessible names, never structure.** M4 rebuilds every one of these
 * screens onto the `brand` surface. A suite that pins markup would have to be rewritten alongside
 * the thing it exists to protect, which is no protection. ADR-0062's extraction was proved correct
 * by every pre-existing suite passing through it unchanged; that is the bar.
 *
 * **2. Four tests are `it.fails`, and they are the point.** Every landable state must offer at
 * least one operable control — otherwise the reader's only way forward is the browser's Back
 * button, on a screen reached from an email. Rows 28, 30, 31 and 34 offer none today. They are
 * written as expected failures rather than omitted, so the suite states the defect instead of
 * being green by not looking; **when M1-T1 lands they turn red and must be un-`.fails`ed**, which
 * is how the fix and its evidence are forced into the same commit.
 *
 * The loading state (row 29) is exempt from that rule and says so below: it is transient, and a
 * control on a screen that is about to be replaced is worse than none.
 */
const search = vi.hoisted<{ value: Record<string, unknown> }>(() => ({ value: {} }));

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: vi.fn() }),
  useSearch: () => search.value,
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function invite(overrides: Partial<InvitationPreview> = {}): InvitationPreview {
  return {
    email: 'ada@example.com',
    role: 'PLANNER',
    organizationName: 'Hutton Home Hub',
    status: 'PENDING',
    expiresAt: '2030-01-01T00:00:00.000Z',
    requiresEmailVerification: false,
    ...overrides,
  };
}

function member(overrides: Partial<MeResponse['user']> = {}): MeResponse {
  return {
    user: {
      id: 'u1',
      email: 'ada@example.com',
      name: 'Ada',
      emailVerified: true,
      image: null,
      ...overrides,
    },
    memberships: [],
  };
}

/**
 * Wire the two reads the card makes. `session: null` is the signed-out answer — `useSession`
 * resolves a 401 to `null` rather than erroring, so callers branch on the value.
 */
function renderScreen({
  token = 'tok',
  preview = invite(),
  session = member(),
  accept,
}: {
  token?: string | null;
  preview?: InvitationPreview | Error;
  session?: MeResponse | null;
  /**
   * A **factory**, not a promise. Building a rejected promise at call-set-up time leaves it
   * unhandled until the click arrives, and vitest reports that as an unhandled rejection — a
   * failure in the harness that looks like a failure in the product.
   */
  accept?: () => Promise<unknown>;
} = {}) {
  search.value = token === null ? {} : { token };
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === '/me') return Promise.resolve(session);
    if (path === '/invitations/preview') {
      return preview instanceof Error ? Promise.reject(preview) : Promise.resolve(preview);
    }
    if (path === '/invitations/accept') return accept ? accept() : new Promise(() => {});
    throw new Error(`unexpected path ${path}`);
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AcceptInviteScreen />
    </QueryClientProvider>,
  );
}

/**
 * Everything a reader can act on, by role rather than by tag — a `<Link>` styled as a button is a
 * link, and both count.
 */
function operableControls(): HTMLElement[] {
  return [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')];
}

afterEach(() => {
  search.value = {};
  vi.clearAllMocks();
});

describe('accept-invite — the states that explain themselves', () => {
  it('row 29: says it is loading while the invitation resolves', () => {
    // Transient, and deliberately NOT held to the operable-control rule: this screen is on its way
    // to being replaced by one of the nine below.
    renderScreen();

    expect(screen.getByText('Loading invitation…')).toBeInTheDocument();
  });

  it('row 32: signed out — offers both ways to become the invited person', async () => {
    renderScreen({ session: null });

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('row 33: unverified and the server enforces it — offers the resend', async () => {
    renderScreen({
      preview: invite({ requiresEmailVerification: true }),
      session: member({ emailVerified: false }),
    });

    expect(await screen.findByText('Confirm your email address first')).toBeInTheDocument();
    expect(operableControls().length).toBeGreaterThan(0);
  });

  it('row 35: ready — names the organisation and offers Accept', async () => {
    renderScreen();

    expect(await screen.findByRole('button', { name: 'Accept and join' })).toBeEnabled();
    expect(screen.getByText('Join Hutton Home Hub')).toBeInTheDocument();
  });

  it('row 36: accepting — the button keeps focus and refuses a second submit', async () => {
    // ADR-0077 M1-T3. Written to fail against `disabled={accept.isPending}`: a native disabled
    // control blurs to `<body>` the moment the request starts and flips back when it settles, so a
    // keyboard reader loses their place twice per action (WCAG 2.4.3). `aria-disabled` keeps focus
    // and does NOT prevent activation — the `onClick` guard is what does, which is why both halves
    // are asserted here.
    let accepts = 0;
    renderScreen({
      accept: () => {
        accepts += 1;
        return new Promise(() => {});
      },
    });
    const button = await screen.findByRole('button', { name: 'Accept and join' });
    button.focus();
    button.click();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Joining…' })).toBeInTheDocument(),
    );
    const busy = screen.getByRole('button', { name: 'Joining…' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(busy);

    busy.click();
    expect(accepts).toBe(1);
  });

  it('row 37: accept failed — says so and leaves the button to try again', async () => {
    renderScreen({ accept: () => Promise.reject(new Error('That invitation has expired.')) });
    const button = await screen.findByRole('button', { name: 'Accept and join' });
    button.click();

    expect(await screen.findByRole('alert')).toHaveTextContent('That invitation has expired.');
    expect(screen.getByRole('button', { name: 'Accept and join' })).toBeInTheDocument();
  });
});

describe('accept-invite — the states that were dead ends (ADR-0077 M1-T2)', () => {
  // These four asserted `it.fails` when this suite was written at M0-T1: a title, a sentence and
  // nothing to press, on screens reached from an email. M1-T2 gave each of them a control, and the
  // assertions were un-`.fails`ed in the same commit — which is what `it.fails` is for.

  it('row 28: no token — explains, and offers the way in', async () => {
    renderScreen({ token: null });

    expect(await screen.findByText('Invitation not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(operableControls().length).toBeGreaterThan(0);
  });

  it('row 30: invitation not found — offers the way in', async () => {
    renderScreen({ preview: new Error('404'), session: null });

    await screen.findByText('Invitation not found');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument();
  });

  it('row 31: invitation no longer valid — offers the way in', async () => {
    renderScreen({ preview: invite({ status: 'ACCEPTED' }), session: null });

    await screen.findByText('This invitation is no longer valid');
    expect(operableControls().length).toBeGreaterThan(0);
  });

  it('rows 30/31: a signed-in reader is sent into the app, not to a sign-in form', async () => {
    // `/sign-in` has no already-signed-in guard, so offering it to somebody who is signed in is a
    // control that is present and wrong — the same class of defect as none at all.
    renderScreen({ preview: invite({ status: 'ACCEPTED' }) });

    await screen.findByText('This invitation is no longer valid');
    expect(screen.getByRole('link', { name: 'Go to SchedulePoint' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('row 34: wrong account — offers the sign-out the copy asks for', async () => {
    // The sharpest of the four: the copy said "Sign out and use the invited account" on a screen
    // with no sign-out. An instruction with no control is a dead end wearing help's face.
    renderScreen({ session: member({ email: 'grace@example.com' }) });

    await screen.findByText('Wrong account');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
