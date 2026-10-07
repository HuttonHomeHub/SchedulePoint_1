import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundScreen } from './not-found-screen';

interface FakeSession {
  isSuccess: boolean;
  data: unknown;
}

const h = vi.hoisted(() => {
  const session: FakeSession = { isSuccess: true, data: null };
  return { session };
});

// The screen's only dependency on the session is "known absent or not", so the hook is replaced
// rather than a QueryClient wired up around a component that makes no request of its own.
vi.mock('@/features/auth', () => ({ useSession: () => h.session }));

describe('NotFoundScreen', () => {
  beforeEach(() => {
    document.title = 'SchedulePoint';
    h.session = { isSuccess: true, data: null };
  });

  it('is one titled page with one main, one focused h1 and one link', () => {
    render(<NotFoundScreen />);
    expect(document.title).toBe('Page not found · SchedulePoint');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    const heading = screen.getByRole('heading', { level: 1, name: 'Page not found' });
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(heading).toHaveFocus();
    expect(screen.getByText('There is nothing at this address.')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('offers Sign in when the session is known absent', () => {
    render(<NotFoundScreen />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
  });

  it('offers the home page when signed in', () => {
    h.session = { isSuccess: true, data: { user: { id: 'u1' } } };
    render(<NotFoundScreen />);
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  });

  it('offers the home page while the session is still resolving', () => {
    h.session = { isSuccess: false, data: undefined };
    render(<NotFoundScreen />);
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  });

  it('does not change the link under a keyboard user who has focused it', () => {
    h.session = { isSuccess: false, data: undefined };
    const { rerender } = render(<NotFoundScreen />);
    const link = screen.getByRole('link', { name: 'Go to the home page' });
    link.focus();

    h.session = { isSuccess: true, data: null };
    rerender(<NotFoundScreen />);

    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('settles to Sign in when nobody has focused the link', () => {
    h.session = { isSuccess: false, data: undefined };
    const { rerender } = render(<NotFoundScreen />);
    h.session = { isSuccess: true, data: null };
    rerender(<NotFoundScreen />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
