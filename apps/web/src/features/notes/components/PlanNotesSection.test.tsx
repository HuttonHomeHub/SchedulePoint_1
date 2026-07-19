import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanNotesSection } from './PlanNotesSection';

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

function renderSection(props: Partial<Parameters<typeof PlanNotesSection>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <PlanNotesSection orgSlug="acme" planId="pl1" {...props} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('PlanNotesSection', () => {
  beforeEach(() => {
    vi.mocked(apiFetchEnvelope).mockReset();
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });
  });

  it('renders the composer for a writer', async () => {
    renderSection({ canWrite: true });
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a note')).toBeInTheDocument();
  });

  it('hides the composer for a read-only viewer (thread only)', async () => {
    renderSection({ canWrite: false });
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a note')).not.toBeInTheDocument();
  });

  it('defaults its heading to h2, and honours an h3 when nested beside sibling h3 sections', async () => {
    const { rerender } = renderSection({ canWrite: false });
    expect(await screen.findByRole('heading', { level: 2, name: 'Notes' })).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AnnouncerProvider>
          <PlanNotesSection orgSlug="acme" planId="pl1" headingLevel={3} />
        </AnnouncerProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Notes' })).toBeInTheDocument();
  });
});
