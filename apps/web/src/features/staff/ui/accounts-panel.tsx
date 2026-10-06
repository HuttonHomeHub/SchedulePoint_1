import { useCallback, useMemo } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { QueryPanel } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { useStaffAccounts, type UnverifiedAccount } from '@/features/staff/api/staff-panels';
import { CHECK_SECTION_ID } from '@/features/staff/model/console-status';
import { formatTimestamp } from '@/lib/format-date';

/**
 * Who cannot sign in.
 *
 * **Paginated, and that is a fix rather than a feature.** The API returned `hasMore: true` and the
 * screen printed "More exist" with no way to reach them — a capability declared and not honoured,
 * found independently by the API and UX reviews. It matters most in exactly the case it was built
 * for: "did enforcing verification strand thirty existing accounts?"
 *
 * **Paging appends, and the button never leaves.** Each page used to be its own query: pressing
 * *Show older* made the whole body pending, so the button that had focus was unmounted for a spinner
 * (focus fell to `<body>`) and the new page then replaced the rows the reader was reading. Now the
 * rows accumulate under one query, and the button stays where it is — shaded with a reason while a
 * page loads and once there is nothing older (ADR-0082, ADR-0145 D6).
 */
export function AccountsPanel(): React.ReactElement {
  const accounts = useStaffAccounts();
  const announce = useAnnounce();
  const columns: Column<UnverifiedAccount>[] = [
    { header: 'Address', cell: (row) => row.email, cellClassName: 'py-2 pr-4 break-all md:w-96' },
    {
      header: 'Registered',
      cell: (row) => formatTimestamp(row.createdAt),
    },
  ];

  // De-duplicated by id: a cursor page is a position in a list that other people are changing, so a
  // row can land at the end of one page and the start of the next.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: UnverifiedAccount[] = [];
    for (const page of accounts.data?.pages ?? []) {
      for (const row of page.unverified) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
      }
    }
    return out;
  }, [accounts.data]);
  const pages = accounts.data?.pages ?? [];
  const total = pages.at(-1)?.unverifiedTotal ?? 0;

  const { fetchNextPage, isFetchingNextPage, hasNextPage } = accounts;
  const showOlder = useCallback(() => {
    // The guard the shading promises: `aria-disabled` stops no click.
    if (isFetchingNextPage || !hasNextPage) return;
    void fetchNextPage().then((result) => {
      if (result.isError) return;
      const shown = new Set(result.data?.pages.flatMap((p) => p.unverified.map((r) => r.id)));
      announce(`${String(shown.size)} of ${String(total)} unverified accounts shown.`);
    });
  }, [announce, fetchNextPage, hasNextPage, isFetchingNextPage, total]);

  return (
    <QueryPanel
      title="Unverified accounts"
      id={CHECK_SECTION_ID.accounts}
      query={{
        isPending: accounts.isPending,
        // A failed *Show older* keeps the rows on screen and reports itself beside the button.
        isError: accounts.isError && !accounts.isFetchNextPageError,
        data: accounts.data,
        refetch: () => accounts.refetch(),
      }}
      skeleton={<Spinner label="Loading accounts…" />}
      errorLabel="Could not read accounts."
      errorStatus="Accounts could not be read."
      settledStatus={() => `${String(total)} unverified accounts.`}
    >
      {() => (
        <>
          <p className="text-muted-foreground text-sm">
            {total === 0
              ? 'Every account has verified its address.'
              : `${String(total)} account${total === 1 ? '' : 's'} cannot complete verification-gated sign-in.`}
          </p>
          <DataTable
            caption="Unverified accounts, oldest first"
            columns={columns}
            query={{
              isPending: false,
              isError: false,
              data: rows,
              refetch: () => accounts.refetch(),
            }}
            getRowKey={(row) => row.id}
            loadingLabel="Loading accounts…"
            empty={<></>}
          />
          {accounts.isFetchNextPageError && (
            <p role="alert" className="text-destructive text-sm">
              Could not load more accounts. Press Show older to try again.
            </p>
          )}
          {(hasNextPage || pages.length > 1) && (
            <Button
              variant="outline"
              size="sm"
              aria-disabled={isFetchingNextPage || !hasNextPage}
              aria-busy={isFetchingNextPage}
              // Resting-shaded once nothing older exists, so no `pointer-events-none` (#458); the
              // hover fill is cancelled instead and `showOlder` refuses the press.
              className="aria-disabled:hover:bg-background aria-disabled:hover:text-foreground aria-disabled:opacity-60"
              onClick={showOlder}
            >
              {isFetchingNextPage
                ? 'Loading more accounts…'
                : hasNextPage
                  ? 'Show older'
                  : `All ${String(rows.length)} are shown.`}
            </Button>
          )}
        </>
      )}
    </QueryPanel>
  );
}
