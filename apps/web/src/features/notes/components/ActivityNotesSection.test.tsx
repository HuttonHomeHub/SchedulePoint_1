import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityNotesSection } from './ActivityNotesSection';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetchEnvelope } from '@/lib/api/client';
import type * as ApiClient from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetchEnvelope: vi.fn() };
});

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } } }),
}));

const activity = { id: 'act1' } as ActivitySummary;

function renderSection(canWrite: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <ActivityNotesSection
          orgSlug="acme"
          planId="pl1"
          activity={activity}
          canWrite={canWrite}
          enabled
        />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('ActivityNotesSection role gating', () => {
  beforeEach(() => {
    vi.mocked(apiFetchEnvelope).mockReset();
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });
  });

  it('renders the composer for a writer', async () => {
    renderSection(true);
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a note')).toBeInTheDocument();
  });

  it('hides the composer for a read-only viewer (thread only)', async () => {
    renderSection(false);
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a note')).not.toBeInTheDocument();
  });
});
