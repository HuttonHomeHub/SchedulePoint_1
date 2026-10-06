import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { QueryPanel } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { useStaffAccounts, type UnverifiedAccount } from '@/features/staff/api/staff-panels';
import { CHECK_SECTION_ID } from '@/features/staff/model/console-status';
import { ACCOUNTS } from '@/features/staff/model/panel-copy';
import { formatTimestamp } from '@/lib/format-date';

/**
 * Unconfirmed accounts: who has signed up but cannot sign in yet.
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
 * page loads (ADR-0082, ADR-0145 D6).
 *
 * **At the end the button gives way to a plain sentence, not to a shaded button.** "All 168 are
 * shown." is a statement, and a control that can never be pressed again is a control that says so by
 * being one. Focus is handed to the sentence when the press that reached the end removes the button
 * from under it (ADR-0135), so it never falls to `<body>`; and when a Refresh later trims the list and
 * removes the sentence while it has focus, focus goes to the box.
 */
export function AccountsPanel(): React.ReactElement {
  const accounts = useStaffAccounts();
  const announce = useAnnounce();
  const columns: Column<UnverifiedAccount>[] = [
    { header: 'Email', cell: (row) => row.email, width: 'bounded', wrap: 'anywhere' },
    { header: 'Signed up', cell: (row) => formatTimestamp(row.createdAt), width: 'fit' },
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
  // The newest response's total: it can change between pages.
  const total = pages.at(-1)?.unverifiedTotal ?? 0;

  const { fetchNextPage, isFetchingNextPage, hasNextPage } = accounts;
  const atEnd = !hasNextPage && pages.length > 1;
  const pressed = useRef(false);
  const endRef = useRef<HTMLParagraphElement | null>(null);
  const endHadFocus = useRef(false);

  // React runs a ref's cleanup while the node is still attached, which is the only moment its
  // focus can be read: once the sentence is removed the browser has already moved focus to `<body>`.
  const setEnd = useCallback((node: HTMLParagraphElement | null) => {
    endRef.current = node;
    if (node === null) return;
    return () => {
      if (document.activeElement === node) endHadFocus.current = true;
    };
  }, []);

  useEffect(() => {
    if (atEnd) {
      if (!pressed.current) return;
      pressed.current = false;
      endRef.current?.focus();
      return;
    }
    // A Refresh sent the list back to its first page and took the sentence out from under a reader
    // who was on it (ADR-0135): hand focus to the box, which is a focus target by its `id`.
    if (!endHadFocus.current) return;
    endHadFocus.current = false;
    document.getElementById(CHECK_SECTION_ID.accounts)?.focus();
  }, [atEnd]);

  const showMore = useCallback(() => {
    // The guard the shading promises: `aria-disabled` stops no click.
    if (isFetchingNextPage || !hasNextPage) return;
    pressed.current = true;
    void fetchNextPage().then((result) => {
      if (result.isError) return;
      const shown = new Set(result.data?.pages.flatMap((p) => p.unverified.map((r) => r.id)));
      announce(ACCOUNTS.announceShown(shown.size, total));
    });
  }, [announce, fetchNextPage, hasNextPage, isFetchingNextPage, total]);

  return (
    <QueryPanel
      title="Unconfirmed accounts"
      id={CHECK_SECTION_ID.accounts}
      query={{
        isPending: accounts.isPending,
        // A failed *Show more* keeps the rows on screen and reports itself beside the button.
        isError: accounts.isError && !accounts.isFetchNextPageError,
        data: accounts.data,
        isFetching: accounts.isFetching && !accounts.isFetchingNextPage,
        refetch: () => accounts.refetch(),
      }}
      skeleton={<Spinner label="Loading accounts…" />}
      errorLabel="Couldn't load accounts."
      errorStatus="Accounts couldn't be loaded."
      settledStatus={() =>
        total === 0
          ? 'No unconfirmed accounts.'
          : `${String(total)} unconfirmed ${total === 1 ? 'account' : 'accounts'}.`
      }
    >
      {() => (
        <>
          <p className="text-muted-foreground text-sm">
            {total === 0 ? ACCOUNTS.none : ACCOUNTS.some(total)}
          </p>
          {total === 0 ? null : (
            <DataTable
              caption={ACCOUNTS.caption}
              columns={columns}
              query={{
                isPending: false,
                isError: false,
                data: rows,
                refetch: () => undefined,
              }}
              getRowKey={(row) => row.id}
              loadingLabel="Loading accounts…"
              empty={<></>}
            />
          )}
          {accounts.isFetchNextPageError && (
            <p role="alert" className="text-destructive text-sm">
              Couldn&rsquo;t load more accounts. Press Show more to try again.
            </p>
          )}
          {hasNextPage ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button
                variant="outline"
                size="sm"
                aria-disabled={isFetchingNextPage}
                aria-busy={isFetchingNextPage}
                // Transient shading while a page loads: no `pointer-events-none` needed (#458), the
                // hover fill is cancelled and `showMore` refuses the press.
                className="aria-disabled:hover:bg-background aria-disabled:hover:text-foreground aria-disabled:opacity-60"
                onClick={showMore}
              >
                {isFetchingNextPage ? ACCOUNTS.loadingMore : 'Show more'}
              </Button>
              <span className="text-muted-foreground text-sm">
                {ACCOUNTS.showing(rows.length, total)}
              </span>
            </div>
          ) : atEnd ? (
            <p
              ref={setEnd}
              tabIndex={-1}
              className="text-muted-foreground focus-visible:ring-ring rounded-sm text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              {ACCOUNTS.allShown(rows.length)}
            </p>
          ) : null}
        </>
      )}
    </QueryPanel>
  );
}
