import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRefreshStaffPageReads } from '@/features/staff/api/refresh-page-reads';
import { STAFF_PAGE_READS } from '@/features/staff/model/page-reads';

/**
 * One press is six audited reads whatever state the UI was in. Verified red against a bare
 * `refetchQueries`, whose default is to cancel the request in flight and start another: two
 * overlapping calls then made twelve reads.
 */
describe('useRefreshStaffPageReads', () => {
  it('joins the reads already in flight when called twice, so each key is read once', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const calls = new Map<string, number>();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let seeded = false;
    for (const queryKey of STAFF_PAGE_READS) {
      const id = queryKey.join('/');
      // Seeded without a gate so the query exists with its function; every later read is held.
      await client.fetchQuery({
        queryKey,
        queryFn: async () => {
          calls.set(id, (calls.get(id) ?? 0) + 1);
          if (seeded) await gate;
          // The accounts key holds an infinite query's shape, which the hook reads before refetching.
          return { pages: [], pageParams: [] };
        },
      });
    }
    seeded = true;
    calls.clear();

    const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRefreshStaffPageReads(), { wrapper });

    const first = result.current();
    const second = result.current();
    release();
    await Promise.all([first, second]);

    expect([...calls.values()]).toEqual(STAFF_PAGE_READS.map(() => 1));
  });
});
