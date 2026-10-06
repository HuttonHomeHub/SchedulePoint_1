import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback } from 'react';

import { STAFF_ACCOUNTS_KEY, type StaffAccounts } from '@/features/staff/api/staff-panels';
import { STAFF_PAGE_READS } from '@/features/staff/model/page-reads';

export interface RefreshResult {
  /**
   * How many unconfirmed accounts the first page held, when a longer list was sent back to it; null
   * when the list was already one page. The announcement says so, because the rows below the first
   * page disappearing is otherwise a change nobody told the reader about.
   */
  firstPageSize: number | null;
}

/**
 * Read the page again: exactly the six reads a load makes, and nothing else.
 *
 * **The accounts list goes back to its first page BEFORE the refetch.** It is one infinite query,
 * and refetching an infinite query refetches every page it has loaded, one request each. A planner
 * who had pressed *Show more* twice would then make three audited reads for one press of Refresh,
 * and "exactly six" would be true only for people who had not used the page. Trimming the cached
 * pages first makes the refetch one request however far the list had been read (spec D-5, SC-5).
 *
 * `exact: true` and a key per read, from `STAFF_PAGE_READS`: a prefix would take Diagnostics with it.
 * `refetchQueries` does not reject on a failed read, so each box reports its own failure and the
 * rest still refresh.
 */
export function useRefreshStaffPageReads(): () => Promise<RefreshResult> {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    const accounts =
      queryClient.getQueryData<InfiniteData<StaffAccounts, string | undefined>>(STAFF_ACCOUNTS_KEY);
    const first = accounts?.pages[0];
    let firstPageSize: number | null = null;
    if (accounts !== undefined && first !== undefined && accounts.pages.length > 1) {
      firstPageSize = first.unverified.length;
      queryClient.setQueryData<InfiniteData<StaffAccounts, string | undefined>>(
        STAFF_ACCOUNTS_KEY,
        { pages: [first], pageParams: accounts.pageParams.slice(0, 1) },
      );
    }
    await Promise.all(
      STAFF_PAGE_READS.map((queryKey) => queryClient.refetchQueries({ queryKey, exact: true })),
    );
    return { firstPageSize };
  }, [queryClient]);
}
