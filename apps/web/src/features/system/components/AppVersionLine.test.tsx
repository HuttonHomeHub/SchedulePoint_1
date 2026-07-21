import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppVersionLine } from './AppVersionLine';

import { APP_VERSION } from '@/config/env';
import { apiFetch } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetch: vi.fn() };
});

function renderLine() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppVersionLine />
    </QueryClientProvider>,
  );
}

describe('AppVersionLine', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('renders the web version immediately, with the API half pending', () => {
    // Never resolves during this test — the API half stays a placeholder.
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    renderLine();
    const line = screen.getByLabelText('Application versions');
    expect(line).toHaveTextContent(`web ${APP_VERSION} · api …`);
  });

  it('shows the API version once the query resolves', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ version: '9.9.9' });
    renderLine();
    await waitFor(() =>
      expect(screen.getByLabelText('Application versions')).toHaveTextContent(
        `web ${APP_VERSION} · api 9.9.9`,
      ),
    );
    expect(apiFetch).toHaveBeenCalledWith('/version');
  });
});
