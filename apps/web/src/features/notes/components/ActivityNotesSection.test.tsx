import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
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

  // The Logic dialog's toolbar **Add note** reveal (toolbar quick-wins U4/A4) needs the Notes heading to
  // be programmatically focusable via `headingRef` — mirroring PlanNotesSection's Comments reveal.
  it('makes the heading focusable out of the tab order when a headingRef is passed (U4/A4)', () => {
    const headingRef = createRef<HTMLHeadingElement>();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AnnouncerProvider>
          <ActivityNotesSection
            orgSlug="acme"
            planId="pl1"
            activity={activity}
            canWrite
            enabled
            headingRef={headingRef}
          />
        </AnnouncerProvider>
      </QueryClientProvider>,
    );
    const heading = screen.getByRole('heading', { name: 'Notes' });
    expect(heading).toBe(headingRef.current);
    expect(heading).toHaveAttribute('tabindex', '-1');
    heading.focus();
    expect(heading).toHaveFocus();
  });

  it('leaves the heading a plain, non-focusable h3 when no headingRef is passed', () => {
    renderSection(true);
    expect(screen.getByRole('heading', { name: 'Notes' })).not.toHaveAttribute('tabindex');
  });
});
