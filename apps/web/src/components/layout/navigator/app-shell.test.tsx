import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './app-shell';

/** The shell reads the org role via a query (RBAC gate), so it needs a client. */
function renderShell(): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppShell />
    </QueryClientProvider>,
  );
}

// The workspace Outlet + route params are external routing — stub them (no active
// org here, so the rail shows its fallback; the tree itself is tested separately).
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Outlet: () => <div data-testid="workspace">workspace</div>,
  useParams: () => ({}),
}));

// The real AppHeader pulls in session/org queries; the shell wiring is what we test,
// so stub the header down to the drawer toggle it exposes via shell context.
vi.mock('@/components/layout/app-header', async () => {
  const { useShell } = await import('./shell-context');
  return {
    AppHeader: (): React.ReactElement => {
      const shell = useShell();
      return (
        <button type="button" onClick={() => shell?.openDrawer()}>
          Open Explorer Drawer
        </button>
      );
    },
  };
});

beforeEach(() => localStorage.clear());

describe('AppShell', () => {
  it('mounts the workspace outlet and the pinned Project Explorer rail', () => {
    renderShell();
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
  });

  it('collapses and expands the pinned rail, moving focus to the acting control', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Project Explorer' }));

    const show = screen.getByRole('button', { name: 'Show Project Explorer' });
    expect(show).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Project Explorer' })).not.toBeInTheDocument();
    expect(show).toHaveFocus(); // focus followed the collapse, not dropped to <body>

    fireEvent.click(show);
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse Project Explorer' })).toHaveFocus();
  });

  it('opens the rail as a drawer from the header toggle and closes it', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open Explorer Drawer' }));

    const drawer = screen.getByRole('dialog', { name: 'Project Explorer' });
    expect(
      within(drawer).getByRole('button', { name: 'Close Project Explorer' }),
    ).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close Project Explorer' }));
    expect(
      screen.queryByRole('button', { name: 'Close Project Explorer' }),
    ).not.toBeInTheDocument();
  });
});
