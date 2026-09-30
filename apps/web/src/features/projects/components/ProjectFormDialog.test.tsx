import type { ProjectSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectFormDialog } from './ProjectFormDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const PROJECT: ProjectSummary = {
  id: 'p1',
  clientId: 'c1',
  name: 'Riverside',
  description: 'Phase one',
  version: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function tree(
  queryClient: QueryClient,
  props: Partial<React.ComponentProps<typeof ProjectFormDialog>>,
) {
  return (
    <QueryClientProvider client={queryClient}>
      <ProjectFormDialog orgSlug="acme" clientId="c1" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  );
}

describe('ProjectFormDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(PROJECT);
  });

  it('PATCHes an edited project with the row version', async () => {
    render(tree(new QueryClient(), { project: PROJECT }));
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Riverside');

    fireEvent.change(name, { target: { value: 'Riverside North' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/projects/p1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toMatchObject({ name: 'Riverside North', version: 2 });
  });

  // See the client dialog's twin of this test for why the probe is a layout effect (#420).
  it('is born holding the edited project’s name, not seeded by a later effect', () => {
    const born: string[] = [];
    function Probe(): null {
      useLayoutEffect(() => {
        const input = document.querySelector<HTMLInputElement>('input[name="name"]');
        if (input) born.push(input.value);
      }, []);
      return null;
    }
    render(
      <>
        {tree(new QueryClient(), { project: PROJECT })}
        <Probe />
      </>,
    );

    expect(born).toEqual(['Riverside']);
  });

  it('starts clean when reopened after a failed save', async () => {
    vi.mocked(apiFetch).mockReset().mockRejectedValue(new Error('Name already taken'));
    const queryClient = new QueryClient();
    const view = render(tree(queryClient, {}));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Quay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name already taken');

    view.rerender(tree(queryClient, { open: false }));
    view.rerender(tree(queryClient, {}));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('seeds a different row afresh when the target changes', () => {
    const queryClient = new QueryClient();
    const view = render(tree(queryClient, { project: PROJECT }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'half-typed' } });

    view.rerender(tree(queryClient, { project: { ...PROJECT, id: 'p2', name: 'Quay' } }));

    expect(screen.getByLabelText('Name')).toHaveValue('Quay');
  });
});
