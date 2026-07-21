import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  useCreateShare,
  useRevokeShare,
  useShares,
  type CreatedShare,
  type CreateShareInput,
  type ShareLink,
} from '../api/use-shares';
import {
  createShareErrorMessage,
  expiryDateToInstant,
  isoDaysFromToday,
  makeCreateShareSchema,
  MAX_EXPIRY_DAYS,
  type CreateShareValues,
} from '../schemas/share-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/form';
import { formatCalendarDate, formatTimestamp } from '@/lib/format-date';

/** Human state for a link — active, revoked, or expired (a link past its `expiresAt` but not revoked). */
function shareState(share: ShareLink): { label: string; variant: 'neutral' | 'critical' } {
  if (share.revokedAt !== null) return { label: 'Revoked', variant: 'critical' };
  if (!share.active) return { label: 'Expired', variant: 'critical' };
  return { label: 'Active', variant: 'neutral' };
}

/**
 * The one-time guest URL surface, shown once after a successful create (ADR-0051 §2): the raw token
 * lives in the URL FRAGMENT and is returned exactly once — only its hash is stored — so it must be
 * copied now. A read-only field + a Copy button (Clipboard API); the token is never logged.
 */
function CreatedLinkPanel({ created }: { created: CreatedShare }): React.ReactElement {
  const announce = useAnnounce();
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    // The URL carries the token in its fragment — copy it, never log it.
    void navigator.clipboard.writeText(created.url).then(
      () => {
        setCopied(true);
        announce('Share link copied to the clipboard.');
      },
      () => announce('Couldn’t copy the link. Select and copy it manually.'),
    );
  };

  return (
    <div role="status" className="border-border bg-muted flex flex-col gap-2 rounded-lg border p-4">
      <p className="text-sm font-medium">Share link created</p>
      <p className="text-muted-foreground text-sm">
        Copy this link now — it’s shown only once. Anyone with it can view this plan read-only until
        you revoke it.
      </p>
      <div className="flex items-center gap-2">
        <TextField
          label="Guest link"
          readOnly
          value={created.url}
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono text-xs"
          // The field's own label is enough context; keep the row compact.
        />
      </div>
      <div>
        <Button type="button" size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
}

/**
 * The member-facing **Share links** dialog (ADR-0051 F-M4 Task 1). Lists a plan's External-Guest share
 * links (label / created / expiry / state / last accessed), creates one (optional label + optional,
 * bounded expiry) and shows its one-time guest URL to copy, and revokes any link. Mounted behind
 * `GUEST_SHARE_LINKS_ENABLED` and only opened for a caller holding `plan:share` — but the API is the
 * sole trust boundary (it re-checks the permission + org-scopes the plan). States/a11y mirror the
 * `CreateBaselineDialog` / `BaselinesPanel` precedent (shared `Dialog`, `DataTable`, `ConfirmDialog`).
 */
export function ShareLinksDialog({
  orgSlug,
  planId,
  open,
  onClose,
}: {
  orgSlug: string;
  planId: string;
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const shares = useShares(orgSlug, planId);
  const create = useCreateShare(orgSlug, planId);
  const revoke = useRevokeShare(orgSlug, planId);
  const announce = useAnnounce();

  // The just-created link (its one-time URL), shown until the dialog closes or another is created.
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [revoking, setRevoking] = useState<ShareLink | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Bound the expiry picker + schema to today … +1yr (ADR-0051 §5 / F-M2 CQ-4: no forced server max TTL,
  // but the picker still bounds absurd values so an effectively-permanent bearer credential isn't a
  // one-click mistake). Recomputed only while the dialog is open (a fresh Date on each open is fine).
  const { schema, minDate, maxDate } = useMemo(() => {
    const now = new Date();
    return {
      schema: makeCreateShareSchema(now),
      minDate: isoDaysFromToday(1, now),
      maxDate: isoDaysFromToday(MAX_EXPIRY_DAYS, now),
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- recompute the bounds on each open

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateShareValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', expiryDate: '' },
  });

  // Reset the form + the create-mutation error on each open (RHF/mutation resets are external-store
  // updates, so they belong in the effect). The one-time-URL + revoke-error React state is cleared in
  // {@link handleClose} instead — clearing it here would be a setState-synchronously-in-effect smell.
  useEffect(() => {
    if (open) {
      reset({ label: '', expiryDate: '' });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open
  }, [open]);

  // Closing clears the transient React state (the shown one-time URL + any revoke error) so the next
  // open starts clean, then delegates to the parent's `onClose`.
  const handleClose = (): void => {
    setCreated(null);
    setRevokeError(null);
    onClose();
  };

  const onSubmit = handleSubmit((values) => {
    // Build the request with only the keys that carry a value (`exactOptionalPropertyTypes`): an empty
    // label / blank expiry means "omitted", not an explicit `undefined`.
    const label = values.label.trim();
    const expiresAt = expiryDateToInstant(values.expiryDate);
    const input: CreateShareInput = {
      ...(label === '' ? {} : { label }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    };
    create.mutate(input, {
      onSuccess: (result) => {
        setCreated(result);
        reset({ label: '', expiryDate: '' });
        announce('Share link created. Copy it now — it’s shown only once.');
      },
    });
  });

  const confirmRevoke = (): void => {
    if (!revoking) return;
    const label = revoking.label ?? 'this link';
    revoke.mutate(revoking.id, {
      onSuccess: () => {
        setRevoking(null);
        setRevokeError(null);
        announce(`Revoked ${label}.`);
      },
      onError: (err) =>
        setRevokeError(err instanceof Error ? err.message : 'Couldn’t revoke this link.'),
    });
  };

  const columns: Column<ShareLink>[] = [
    {
      header: 'Label',
      cell: (s) => {
        const state = shareState(s);
        return (
          <span className="flex items-center gap-2">
            <span className="font-medium">{s.label ?? 'Untitled link'}</span>
            <Badge variant={state.variant}>{state.label}</Badge>
          </span>
        );
      },
    },
    { header: 'Created', cell: (s) => formatTimestamp(s.createdAt) },
    { header: 'Expires', cell: (s) => (s.expiresAt ? formatCalendarDate(s.expiresAt) : 'Never') },
    {
      header: 'Last opened',
      cell: (s) => (s.lastAccessedAt ? formatTimestamp(s.lastAccessedAt) : 'Never'),
    },
    {
      header: 'Actions',
      srHeader: true,
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (s) =>
        s.revokedAt === null ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRevokeError(null);
              setRevoking(s);
            }}
            aria-label={`Revoke ${s.label ?? 'this link'}`}
          >
            Revoke
          </Button>
        ) : (
          <span className="text-muted-foreground text-sm">Revoked</span>
        ),
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      size="lg"
      title="Share links"
      description="Create revocable, read-only links so people outside your organisation can view this plan. Anyone with a link can see the schedule until you revoke it."
    >
      <div className="flex flex-col gap-6">
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          {create.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {createShareErrorMessage(create.error)}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Label (optional)"
              autoComplete="off"
              placeholder="e.g. Client review – Acme"
              error={errors.label?.message}
              {...register('label')}
            />
            <TextField
              label="Expires (optional)"
              type="date"
              min={minDate}
              max={maxDate}
              hint={`Leave blank for no expiry. Up to a year out (by ${formatCalendarDate(maxDate)}).`}
              error={errors.expiryDate?.message}
              {...register('expiryDate')}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create link'}
            </Button>
          </div>
        </form>

        {created ? <CreatedLinkPanel created={created} /> : null}

        <DataTable
          caption="Share links"
          columns={columns}
          query={shares}
          getRowKey={(s) => s.id}
          loadingLabel="Loading share links…"
          errorLabel="Couldn’t load share links. Please try again."
          empty={
            <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              No share links yet. Create one to give someone read-only access to this plan.
            </div>
          }
        />

        <ConfirmDialog
          open={revoking !== null}
          onClose={() => {
            setRevoking(null);
            setRevokeError(null);
          }}
          onConfirm={confirmRevoke}
          title="Revoke share link"
          description={
            revoking
              ? `Revoke “${revoking.label ?? 'this link'}”? Anyone using it will immediately lose access, and it can’t be restored.`
              : ''
          }
          confirmLabel="Revoke"
          pending={revoke.isPending}
          pendingLabel="Revoking…"
          error={revokeError}
        />
      </div>
    </Dialog>
  );
}
