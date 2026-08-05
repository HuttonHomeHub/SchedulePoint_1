import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthShell } from './auth-shell';

import { useAnnounce } from '@/components/ui/announcer';
import { InviteShell } from '@/features/members';

/**
 * ADR-0074 M2-T1 — the shell convergence.
 *
 * The extraction's real proof is that every pre-existing sign-in / sign-up / accept-invite suite
 * passes **unchanged** (the ADR-0062 precedent). These add the one property those suites could not
 * have asserted, because it did not exist: a public screen can announce.
 */
function Announcer({ message }: { message: string }): React.ReactElement {
  const announce = useAnnounce();
  return (
    <button
      type="button"
      onClick={() => {
        announce(message);
      }}
    >
      announce
    </button>
  );
}

describe('AuthShell', () => {
  it('renders one main landmark with the heading as the title', () => {
    render(<AuthShell title="Sign in">body</AuthShell>);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('omits the header when the children bring their own', () => {
    render(
      <AuthShell>
        <h2>Own heading</h2>
      </AuthShell>,
    );
    expect(screen.getByRole('heading', { name: 'Own heading' })).toBeInTheDocument();
  });

  it('mounts an announcer on every variant — including the title-less one', () => {
    const { rerender } = render(<AuthShell title="Sign in">body</AuthShell>);
    expect(screen.getByTestId('announcer')).toBeInTheDocument();

    rerender(<AuthShell>body</AuthShell>);
    expect(screen.getByTestId('announcer')).toBeInTheDocument();
  });

  it('gives InviteShell the same announcer — one implementation, not two', () => {
    render(<InviteShell>body</InviteShell>);
    // The whole reason for the convergence: `InviteShell` had drifted on exactly this, and three
    // new callers were about to make it five callers on two implementations.
    expect(screen.getByTestId('announcer')).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('reflects `busy` on the landmark so a resolving outcome is not read as settled', () => {
    render(
      <AuthShell title="Sign in" busy>
        body
      </AuthShell>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });

  it('routes a child announcement into the polite region', async () => {
    render(
      <AuthShell title="Sign in">
        <Announcer message="Check your email" />
      </AuthShell>,
    );
    screen.getByRole('button', { name: 'announce' }).click();
    await expect(
      screen.findByText('Check your email', { selector: '[data-testid="announcer"]' }),
    ).resolves.toBeInTheDocument();
  });
});
