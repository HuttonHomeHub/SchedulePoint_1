import type { DeletedHierarchyItem } from '@repo/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { useDeletedItems, useRestoreItem } from '../api/use-deleted-items';
import { expirySentence, expirySummary } from '../model/expiry-copy';
import { describeMembers, groupDeletions, type DeletionGroup } from '../model/group-deletions';

import { RestoreAncestorDialog } from './RestoreAncestorDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { formatTimestamp } from '@/lib/format-date';

/** The retention caveat's id, so the table can point at it rather than merely sit under it. */
const RETENTION_RULE_ID = 'recently-deleted-retention-rule';

/** Human labels for each hierarchy level. */
const KIND_LABEL: Record<DeletedHierarchyItem['kind'], string> = {
  client: 'Client',
  project: 'Project',
  plan: 'Plan',
};

/**
 * The organisation's recycle bin, **one row per deletion rather than one per deleted thing**
 * (ADR-0096).
 *
 * A cascade stamps one `deleteBatchId` across a whole subtree and the restore is keyed on it, so
 * those rows return together whatever the reader presses. Listing them separately put a Restore
 * button on rows that were never independently actionable, and told two of every three to
 * "Restore its parent first" about work the product already does.
 *
 * What a deletion took is disclosed rather than hidden — the count alone ("+ 2 items") does not
 * say whether a one-press restore is welcome, so the summary names kinds and the panel names rows.
 *
 * Restore is non-destructive, so it still acts directly with no confirmation.
 */
export function RecentlyDeletedTable({
  orgSlug,
  canWrite,
}: {
  orgSlug: string;
  canWrite: boolean;
}): React.ReactElement {
  const deleted = useDeletedItems(orgSlug);
  const restore = useRestoreItem(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  // A set (not a single id) so two rows restored back-to-back each keep their own
  // pending state — there's no confirm dialog serialising them like delete has.
  const [restoringIds, setRestoringIds] = useState<ReadonlySet<string>>(new Set());
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  /** The blocked group whose ancestor confirmation is open, by key. */
  const [ancestorFor, setAncestorFor] = useState<string | null>(null);
  /**
   * The button that opened the ancestor confirmation.
   *
   * The dialog is **unmounted** when it closes rather than toggled to `open={false}`, because its
   * content is derived from a group that can vanish under a refetch. That bypasses the native
   * `<dialog>`'s own close algorithm — focus restoration is a step of `close()`, not of removing
   * the node — so Cancel, ✕ and a failed restore all dropped focus to `<body>` with nothing to
   * bring it back. Third instance of the class in this repository (ADR-0080, ADR-0095 M6), and the
   * codebase's own answer to an unmount-close is `HierarchyTree.tsx`'s: re-home focus by hand.
   */
  const ancestorInvokerRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Close the confirmation and put focus back where it came from.
   *
   * Called on every close path, including confirm — where it is deliberately NOT the last word: a
   * successful restore then moves focus to the region, because the invoker it just returned to is
   * about to unmount with the row.
   */
  const closeAncestor = (): void => {
    setAncestorFor(null);
    ancestorInvokerRef.current?.focus();
  };

  // Grouping is a pure transform over the array already held — `useDeletedItems` pages to
  // exhaustion, which is what makes a group complete and therefore honest (TECH_DEBT #57).
  const groups = useMemo(() => groupDeletions(deleted.data?.rows ?? []), [deleted.data]);
  // The SERVER's period, never a constant here: it is an operator override, so a hardcoded copy
  // would make every sentence below wrong on any host that changed it (ADR-0096 D2).
  const retentionDays = deleted.data?.meta?.retentionDays ?? null;
  const retentionActive = deleted.data?.meta?.retentionActive ?? false;
  const groupQuery = useMemo(
    () => ({ ...deleted, data: groups }) as unknown as typeof deleted & { data: DeletionGroup[] },
    [deleted, groups],
  );

  /**
   * The blocker's own group, found in the list the client already holds — no extra request, and no
   * second source of truth about what a restore brings back.
   *
   * Null when the blocker is not in the fetched set. That is not expected (the list pages to
   * exhaustion) but it is possible mid-refetch, and the caller shades rather than opening a dialog
   * it cannot populate — an empty confirmation is worse than none.
   */
  const ancestorGroupFor = (group: DeletionGroup): DeletionGroup | null => {
    const batch = group.root.blockedBy?.deleteBatchId;
    if (batch === undefined || batch === null) return null;
    return groups.find((candidate) => candidate.key === batch) ?? null;
  };

  const toggle = (key: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** Named for the whole deletion, so a screen-reader user hears what one press brings back. */
  const restoreLabel = (group: DeletionGroup): string => {
    const summary = describeMembers(group.members);
    const subject = `${KIND_LABEL[group.root.kind].toLowerCase()} ${group.root.name}`;
    return summary === null ? `Restore ${subject}` : `Restore ${subject} and ${summary}`;
  };

  const onRestore = (group: DeletionGroup): void => {
    const item = group.root;
    if (restoringIds.has(item.id)) return; // guard: aria-disabled doesn't block clicks
    setRestoreError(null);
    setRestoringIds((prev) => new Set(prev).add(item.id));
    restore.mutate(
      { kind: item.kind, id: item.id },
      {
        onSuccess: () => {
          // The restored row unmounts when the list refetches; move focus to the
          // region so keyboard/SR users aren't dropped to <body>.
          // Announced INSIDE the focus frame: the restored rows unmount on refetch, so focus has
          // to move or it drops to <body> — and a message spoken before that move is overwritten by
          // whatever the focus lands on (ADR-0080 records both halves of this shipping wrong).
          const summary = describeMembers(group.members);
          announce(
            summary === null
              ? `${KIND_LABEL[item.kind]} “${item.name}” restored.`
              : `${KIND_LABEL[item.kind]} “${item.name}” and ${summary} restored.`,
          );
          regionRef.current?.focus();
        },
        // On error the row stays; the button (aria-disabled, not natively
        // disabled) keeps focus, so the user can retry. The error is surfaced by
        // the role="alert" below — no extra announce (that would double-speak it).
        onError: (error) => setRestoreError(error.message),
        onSettled: () =>
          setRestoringIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          }),
      },
    );
  };

  const columns: Column<DeletionGroup>[] = [
    {
      header: 'Type',
      cell: (group) => <span className="text-muted-foreground">{KIND_LABEL[group.root.kind]}</span>,
    },
    {
      header: 'Name',
      cell: (group) => {
        const summary = describeMembers(group.members);
        const open = expanded.has(group.key);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{group.root.name}</span>
            {summary === null ? null : (
              <button
                type="button"
                // A real button with `aria-expanded`, controlling the panel by id — the APG
                // Disclosure pattern. Not a `treegrid`: nothing inside the panel is separately
                // actionable, so the roving-tabindex machinery would be overhead solving a problem
                // this screen does not have.
                aria-expanded={open}
                aria-controls={`deletion-${group.key}`}
                // **Self-contained, and it has to contain the visible text.** Read serially the
                // visible "and 1 project, 1 plan" is clear, because the root's name is the line
                // above — but a reader arriving by rotor or by Tab hears it with no antecedent,
                // and it is a strict substring of the Restore button's own name one cell along
                // (which is how the journey first found this: two controls matched one query).
                // Prefixing the subject fixes both without breaking WCAG 2.5.3, which requires
                // the accessible name to contain the visible label rather than replace it.
                aria-label={`${group.root.name}: and ${summary}`}
                onClick={() => toggle(group.key)}
                className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs"
              >
                {open ? (
                  <ChevronDown aria-hidden="true" className="size-3" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-3" />
                )}
                {/* The kinds, not a bare count: "+ 2 items" does not tell a reader whether a
                    one-press restore is welcome, and that is the only question this row asks. */}
                and {summary}
              </button>
            )}
          </div>
        );
      },
    },
    {
      header: 'Deleted',
      cell: (group) => {
        const expiry =
          retentionDays === null
            ? null
            : expirySentence(group.root.deletedAt, retentionDays, retentionActive);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">{formatTimestamp(group.root.deletedAt)}</span>
            {/* Urgency is in the WORDING, never a colour (WCAG 1.4.1) — "Expires tomorrow" reads
                the same to a colour-blind reader, in a print, and to a screen reader. */}
            {expiry === null ? null : (
              <span className="text-muted-foreground text-xs">{expiry}</span>
            )}
          </div>
        );
      },
    },
  ];
  if (canWrite) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (group) =>
        group.canRestore ? (
          <Button
            variant="ghost"
            size="sm"
            aria-disabled={restoringIds.has(group.root.id)}
            aria-busy={restoringIds.has(group.root.id)}
            onClick={() => onRestore(group)}
            aria-label={restoreLabel(group)}
          >
            {restoringIds.has(group.root.id) ? 'Restoring…' : 'Restore'}
          </Button>
        ) : ancestorGroupFor(group) !== null ? (
          // Blocked by a deletion OUTSIDE this one — the only case grouping cannot dissolve. The
          // control is a real button rather than a sentence: the reader can act from here, in two
          // deliberate presses, instead of being told to go and find the row themselves.
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              ancestorInvokerRef.current = event.currentTarget;
              setAncestorFor(group.key);
            }}
            aria-haspopup="dialog"
          >
            Restore {group.root.blockedBy?.name} first…
          </Button>
        ) : (
          // The blocker is not in the fetched set — possible mid-refetch. Say what is true rather
          // than offering a button that would open an empty confirmation.
          <span className="text-muted-foreground text-sm">
            {group.root.blockedBy === null
              ? 'Restore its parent first'
              : `Restore ${group.root.blockedBy.name} first`}
          </span>
        ),
    });
  }

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      {restoreError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {restoreError}
        </p>
      ) : null}
      {/* **The rule, stated — not left to be inferred from a countdown.** Without this the first
          time a member learns deletions expire is a "expires tomorrow" on something they came here
          to check on. The number is the server's, so this sentence is true on every host. */}
      {retentionDays === null || !retentionActive ? null : (
        // Linked to the table by `describedById` below, not merely placed above it: a reader
        // navigating by landmark lands INSIDE the table's region and never passes this sentence.
        // The precedent is ADR-0073 C2.5, where the same caveat was reachable only by reading
        // serially — and this one is the safety caveat for a screen about permanent deletion.
        <p id={RETENTION_RULE_ID} className="text-muted-foreground text-sm">
          Deleted items are kept for {retentionDays} days, then permanently removed.
        </p>
      )}
      {(() => {
        const summary =
          retentionDays === null ? null : expirySummary(groups, retentionDays, retentionActive);
        // A subset, said as a subset: "1 of 3" rather than a bare count that reads as though the
        // whole list is imminent and sends a reader restoring things with months left.
        return summary === null ? null : (
          <p role="status" className="text-muted-foreground text-sm">
            {summary}
          </p>
        );
      })()}
      <DataTable
        caption="Recently deleted items"
        {...(retentionDays === null || !retentionActive
          ? {}
          : { describedById: RETENTION_RULE_ID })}
        columns={columns}
        query={groupQuery}
        getRowKey={(group) => group.key}
        renderDetail={(group) =>
          !expanded.has(group.key) || group.members.length === 0 ? null : (
            <div id={`deletion-${group.key}`} className="bg-muted/40 px-4 py-2">
              <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
                {group.members.map((member) => (
                  <li key={`${member.kind}:${member.id}`}>
                    <span className="text-muted-foreground">{KIND_LABEL[member.kind]}</span>{' '}
                    <span className="text-foreground">{member.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        loadingLabel="Loading recently deleted…"
        errorLabel="Couldn’t load recently deleted items. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            Nothing has been deleted. Deleted clients, projects and plans appear here so you can
            restore them.
          </div>
        }
      />
      {(() => {
        if (ancestorFor === null) return null;
        const blocked = groups.find((g) => g.key === ancestorFor);
        const ancestor = blocked ? ancestorGroupFor(blocked) : null;
        // Both can vanish under a refetch between opening and rendering; closing is the honest
        // response, not rendering a dialog about rows that are no longer there.
        if (!blocked || !ancestor) return null;
        return (
          <RestoreAncestorDialog
            open
            onClose={closeAncestor}
            blocked={blocked}
            ancestor={ancestor}
            onConfirm={() => {
              // Close FIRST, then restore. Closing re-homes focus onto the invoker, which is
              // where it must end up if the restore FAILS — the row is still there and the reader
              // can try again. On success `onRestore` moves it on to the region, because that
              // invoker unmounts with the row it belongs to.
              closeAncestor();
              onRestore(ancestor);
            }}
          />
        );
      })()}
    </div>
  );
}
