import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { useDeletedItems, useRestoreItem } from '../api/use-deleted-items';
import { expirySentence, expirySummary } from '../model/expiry-copy';
import { describeMembers, groupDeletions, type DeletionGroup } from '../model/group-deletions';
import { blockerNoun, nounOf, sentenceNounOf, typeLabel } from '../model/kind-label';
import { describeRestoreFailure, type RestoreFailure } from '../model/restore-failure';
import {
  DEFAULT_SHOW,
  emptyFilterSentence,
  filterGroups,
  SHOW_OPTIONS,
  type ShowFilter,
} from '../model/show-filter';

import { RestoreBlockerDialog } from './RestoreBlockerDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { SectionCard } from '@/components/ui/page';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { textLinkVariants } from '@/components/ui/text-link';
import { formatTimestamp } from '@/lib/format-date';

/** The retention caveat's id, so the table can point at it rather than merely sit under it. */
const RETENTION_RULE_ID = 'recently-deleted-retention-rule';

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
  show: controlledShow,
  onShowChange,
}: {
  orgSlug: string;
  canWrite: boolean;
  /**
   * Which kind of deletion to show (ADR-0195 D8). The route owns it, because it lives in the URL
   * (`?show=`) — but the table is also mounted directly by its unit tests, outside a router, so an
   * omitted `show` falls back to local state: the controlled/uncontrolled idiom
   * `useUrlFilterState` documents.
   */
  show?: ShowFilter;
  onShowChange?: (next: ShowFilter) => void;
}): React.ReactElement {
  const showLabelId = useId();
  const [localShow, setLocalShow] = useState<ShowFilter>(DEFAULT_SHOW);
  const show = controlledShow ?? localShow;
  const changeShow = (next: ShowFilter): void => {
    setLocalShow(next);
    onShowChange?.(next);
  };
  const deleted = useDeletedItems(orgSlug);
  const restore = useRestoreItem(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  // A set (not a single id) so two rows restored back-to-back each keep their own
  // pending state — there's no confirm dialog serialising them like delete has.
  const [restoringIds, setRestoringIds] = useState<ReadonlySet<string>>(new Set());
  const [restoreError, setRestoreError] = useState<RestoreFailure | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  /** The blocked group whose ancestor confirmation is open, by key. */
  const [blockerFor, setBlockerFor] = useState<string | null>(null);
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
  const blockerInvokerRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Close the confirmation and put focus back where it came from.
   *
   * Called on every close path, including confirm — where it is deliberately NOT the last word: a
   * successful restore then moves focus to the region, because the invoker it just returned to is
   * about to unmount with the row.
   */
  const closeBlocker = (): void => {
    setBlockerFor(null);
    blockerInvokerRef.current?.focus();
  };

  // Grouping is a pure transform over the array already held — `useDeletedItems` pages to
  // exhaustion, which is what makes a group complete and therefore honest (TECH_DEBT #57).
  const groups = useMemo(() => groupDeletions(deleted.data?.rows ?? []), [deleted.data]);
  // The SERVER's period, never a constant here: it is an operator override, so a hardcoded copy
  // would make every sentence below wrong on any host that changed it (ADR-0096 D2).
  const retentionDays = deleted.data?.meta?.retentionDays ?? null;
  const retentionActive = deleted.data?.meta?.retentionActive ?? false;
  // What is on screen. `groups` (all of them) stays the lookup for a blocker's own deletion, which
  // may sit under another filter: restoring "the group first" must still find it.
  const visible = useMemo(() => filterGroups(groups, show), [groups, show]);
  // The table's query is the list's loading and error state with the NARROWED groups as its data.
  // Built field by field rather than spread and cast, so a change to what `DataTable` reads from it
  // is a type error here and not a silent `undefined`.
  const groupQuery = useMemo(
    () => ({
      isPending: deleted.isPending,
      isError: deleted.isError,
      data: deleted.data === undefined ? undefined : visible,
      refetch: deleted.refetch,
    }),
    [deleted.isPending, deleted.isError, deleted.data, deleted.refetch, visible],
  );

  /**
   * The blocker's own group, found in the list the client already holds — no extra request, and no
   * second source of truth about what a restore brings back.
   *
   * Null when the blocker is not in the fetched set. That is not expected (the list pages to
   * exhaustion) but it is possible mid-refetch, and the caller shades rather than opening a dialog
   * it cannot populate — an empty confirmation is worse than none.
   */
  const blockerGroupFor = (group: DeletionGroup): DeletionGroup | null => {
    const batch = group.root.blockedBy?.deleteBatchId;
    if (batch === undefined || batch === null) return null;
    return groups.find((candidate) => candidate.key === batch) ?? null;
  };

  /**
   * A group's row, as the label functions read it. `empty` is what a restore would bring back — a
   * resource group and nothing else — which the deletion's own members say and the row cannot.
   */
  const labelled = (group: DeletionGroup) => ({
    ...group.root,
    empty: group.members.length === 0,
  });

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
    const subject = `${nounOf(labelled(group))} ${group.root.name}`;
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
              ? `${sentenceNounOf(labelled(group))} “${item.name}” restored.`
              : `${sentenceNounOf(labelled(group))} “${item.name}” and ${summary} restored.`,
          );
          regionRef.current?.focus();
        },
        // On error the row stays; the button (aria-disabled, not natively
        // disabled) keeps focus, so the user can retry. The error is surfaced by
        // the role="alert" below — no extra announce (that would double-speak it).
        onError: (error) => setRestoreError(describeRestoreFailure(error, item.kind)),
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
      cell: (group) => <span className="text-muted-foreground">{typeLabel(labelled(group))}</span>,
    },
    {
      header: 'Name',
      cell: (group) => {
        const summary = describeMembers(group.members);
        const open = expanded.has(group.key);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{group.root.name}</span>
            {group.root.canRestore || group.root.blockedBy === null ? null : (
              /*
                **The blocker is named HERE, under the row it blocks, and not inside the button.**

                It used to be the button's visible label: `Restore ddde first…`, with the variable
                part in the MIDDLE of the sentence, so the trailing ellipsis — the conventional
                "this opens a dialog" suffix — read as a sentence cut off instead. That was the
                product owner's report, and M0 established the control is not clipped at any width:
                the `…` is literal text in the source. So the remedy is copy, not CSS.

                A blocker is a fact about this row, and a fact about a row belongs under it (D4).
                Moving it here also bounds the button, which sits in a `whitespace-nowrap` cell: a
                long client name used to widen the whole Actions column and take that width off the
                names beside it.
              */
              <span className="text-muted-foreground text-xs">
                {group.root.blockedBy.relation === 'calendar'
                  ? // A dependency, not a parent: "blocked by a deleted calendar" would read as though
                    // the calendar contained this, and it is the other way round (ADR-0195 D3).
                    `Uses deleted calendar “${group.root.blockedBy.name}”`
                  : `Blocked by a deleted ${blockerNoun(group.root.blockedBy.kind)}, “${group.root.blockedBy.name}”`}
              </span>
            )}
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
        // The row's own instant, served by the API — a resource and an organisation calendar have
        // none, and a project calendar counts from its project's deletion (ADR-0195 D4).
        const expiry = expirySentence(group.root.expiresAt, retentionActive);
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
      // Every label in this cell is now bounded (see the blocker sub-line in `Name`), so the column
      // can take its minimum width and hand the surplus to the names — which is what `fit` is for.
      width: 'fit',
      headClassName: 'pr-0',
      cellClassName: 'pr-0 text-right whitespace-nowrap',
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
        ) : blockerGroupFor(group) !== null ? (
          // Blocked by a deletion OUTSIDE this one — the only case grouping cannot dissolve. The
          // control is a real button rather than a sentence: the reader can act from here, in two
          // deliberate presses, instead of being told to go and find the row themselves.
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              blockerInvokerRef.current = event.currentTarget;
              setBlockerFor(group.key);
            }}
            aria-haspopup="dialog"
            aria-label={`Restore ${blockerNoun(group.root.blockedBy?.kind ?? 'client')} first…: ${group.root.blockedBy?.name ?? ''}`}
          >
            {/* The visible label is contiguous at the START of the accessible name, which is what
                WCAG 2.5.3 requires — the name may add to the label, never replace or reorder it. */}
            Restore {blockerNoun(group.root.blockedBy?.kind ?? 'client')} first…
          </Button>
        ) : (
          // The blocker is not in the fetched set — possible mid-refetch. Say what is true rather
          // than offering a button that would open an empty confirmation.
          <span className="text-muted-foreground text-sm">
            {group.root.blockedBy?.relation === 'calendar'
              ? 'Restore its calendar first'
              : `Restore its ${group.root.blockedBy === null ? 'parent' : blockerNoun(group.root.blockedBy.kind)} first`}
          </span>
        ),
    });
  }

  return (
    /**
     * **The rows sit in a named section that states how many there are** (ADR-0146 D2). The name is
     * what the section HOLDS rather than a repeat of the page's own `<h1>`: two headings saying one
     * word is the defect ADR-0143 records on the plan workspace's foot.
     *
     * `count` is honest here because this query loads every page (`apiFetchAllPages`), so the
     * length IS the total. The audit screens deliberately pass none — behind a "Load more" the same
     * expression means "how many are loaded", which would read as a total and be wrong.
     */
    <SectionCard
      title="Deleted items"
      count={deleted.data === undefined ? undefined : visible.length}
      flush
    >
      <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
        {restoreError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {restoreError.message}
            {restoreError.library === null ? null : (
              <>
                {' '}
                <Link
                  to={
                    restoreError.library === 'resources'
                      ? '/orgs/$orgSlug/resources'
                      : '/orgs/$orgSlug/calendars'
                  }
                  params={{ orgSlug }}
                  className={textLinkVariants()}
                >
                  {restoreError.library === 'resources'
                    ? 'Open the resources library'
                    : 'Open the calendars library'}
                </Link>
              </>
            )}
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
            Deleted clients, projects and plans are kept for {retentionDays} days, then permanently
            removed, and a project’s own calendars go with it. Deleted resources and organisation
            calendars are kept until you restore them.
          </p>
        )}
        {(() => {
          const summary = expirySummary(visible, retentionActive);
          // A subset, said as a subset: "1 of 3" rather than a bare count that reads as though the
          // whole list is imminent and sends a reader restoring things with months left.
          return summary === null ? null : (
            <p role="status" className="text-muted-foreground text-sm">
              {summary}
            </p>
          );
        })()}
        {deleted.data === undefined ? null : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* Labelled by its own visible caption, so a serial reader hears "Show" once (ADR-0119):
                these are alternatives, not toggles. */}
            <span id={showLabelId} className="text-muted-foreground text-sm">
              Show
            </span>
            <SegmentedControl
              label="Show"
              labelledById={showLabelId}
              value={show}
              onChange={changeShow}
              options={SHOW_OPTIONS}
            />
          </div>
        )}
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
                      <span className="text-muted-foreground">{typeLabel(member)}</span>{' '}
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
            // Only a NARROWED view of a bin that has something in it says what is missing; an empty
            // bin says so whatever the URL asks for, or "No deleted resources." would be a half-truth.
            groups.length > 0 ? (
              emptyFilterSentence(show)
            ) : (
              <>
                Nothing has been deleted. Deleted clients, projects, plans, resources and calendars
                appear here so you can restore them.
              </>
            )
          }
        />
        {(() => {
          if (blockerFor === null) return null;
          const blocked = groups.find((g) => g.key === blockerFor);
          const blockerGroup = blocked ? blockerGroupFor(blocked) : null;
          // Both can vanish under a refetch between opening and rendering; closing is the honest
          // response, not rendering a dialog about rows that are no longer there.
          if (!blocked || !blockerGroup) return null;
          return (
            <RestoreBlockerDialog
              open
              onClose={closeBlocker}
              blocked={blocked}
              blockerGroup={blockerGroup}
              onConfirm={() => {
                // Close FIRST, then restore. Closing re-homes focus onto the invoker, which is
                // where it must end up if the restore FAILS — the row is still there and the reader
                // can try again. On success `onRestore` moves it on to the region, because that
                // invoker unmounts with the row it belongs to.
                closeBlocker();
                onRestore(blockerGroup);
              }}
            />
          );
        })()}
      </div>
    </SectionCard>
  );
}
