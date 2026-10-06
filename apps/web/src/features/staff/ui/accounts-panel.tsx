import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { QueryPanel } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { useStaffAccounts, type UnverifiedAccount } from '@/features/staff/api/staff-panels';
import { CHECK_SECTION_ID } from '@/features/staff/model/console-status';

/**
 * Who cannot sign in.
 *
 * **Paginated, and that is a fix rather than a feature.** The API returned `hasMore: true` and the
 * screen printed "More exist" with no way to reach them — a capability declared and not honoured,
 * found independently by the API and UX reviews. It matters most in exactly the case it was built
 * for: "did enforcing verification strand thirty existing accounts?"
 */
export function AccountsPanel(): React.ReactElement {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const accounts = useStaffAccounts(cursor);
  const columns: Column<UnverifiedAccount>[] = [
    { header: 'Address', cell: (row) => row.email, cellClassName: 'py-2 pr-4 break-all md:w-96' },
    {
      header: 'Registered',
      cell: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <QueryPanel
      title="Unverified accounts"
      id={CHECK_SECTION_ID.accounts}
      query={accounts}
      skeleton={<Spinner label="Loading accounts…" />}
      errorLabel="Could not read accounts."
      errorStatus="Accounts could not be read."
      settledStatus={(page) => `${String(page.unverifiedTotal)} unverified accounts.`}
    >
      {(page) => (
        <>
          <p className="text-muted-foreground text-sm">
            {page.unverifiedTotal === 0
              ? 'Every account has verified its address.'
              : `${String(page.unverifiedTotal)} account${page.unverifiedTotal === 1 ? '' : 's'} cannot complete verification-gated sign-in.`}
          </p>
          <DataTable
            caption="Unverified accounts, oldest first"
            columns={columns}
            query={{
              isPending: false,
              isError: false,
              data: page.unverified,
              refetch: () => accounts.refetch(),
            }}
            getRowKey={(row) => row.id}
            loadingLabel="Loading accounts…"
            empty={<></>}
          />
          {page.nextCursor !== null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCursor(page.nextCursor ?? undefined);
              }}
            >
              Show older
            </Button>
          )}
        </>
      )}
    </QueryPanel>
  );
}
