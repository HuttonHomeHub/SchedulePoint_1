import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { OrgDestinations, OrgDestinationsCollapsed } from './org-destinations';

import { AccountChip } from '@/components/layout/account-chip';
import { BrandLink } from '@/components/layout/brand-mark';
import { Button } from '@/components/ui/button';
import { SheetHeader } from '@/components/ui/sheet';
import { Surface } from '@/components/ui/surface';
import { HierarchyTree, useNavigatorCrud, type UseExpansionState } from '@/features/navigator';
import { OrgSwitcher } from '@/features/organizations';
import { AppVersionLine } from '@/features/system';

/**
 * The **Project Explorer** rail — the persistent home of the Client → Project → Plan
 * tree (ADR-0029). Rendered once in {@link AppShell} (the pinned rail on `lg`+ and the
 * drawer below `lg`), so it survives route changes. When an org is active it hosts the
 * accessible {@link HierarchyTree}; otherwise a brief hint.
 *
 * `onCollapse` (pinned rail) and `onClose` (drawer) are mutually exclusive header
 * affordances — pass whichever fits the surface. `focusToggleOnMount` moves focus to
 * the header control when the rail (re)mounts after a user toggle, so keyboard/AT
 * users don't lose their place on collapse/expand. `onNavigate` fires when a plan is
 * opened (the drawer uses it to close).
 */
export function NavigatorRail({
  orgSlug,
  expansion,
  onCollapse,
  onClose,
  onNavigate,
  focusToggleOnMount,
}: {
  orgSlug?: string | undefined;
  expansion?: UseExpansionState | undefined;
  onCollapse?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onNavigate?: (() => void) | undefined;
  focusToggleOnMount?: boolean | undefined;
}): React.ReactElement {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const crud = useNavigatorCrud();
  useEffect(() => {
    if (focusToggleOnMount) toggleRef.current?.focus();
  }, [focusToggleOnMount]);

  return (
    <Surface
      tone="panel"
      as="nav"
      aria-label="Project Explorer"
      className="border-border flex h-full min-h-0 flex-col border-r"
    >
      {/* **The identity zone, moved here when the top bar was deleted** (Graphite M3, ADR-0099 D1).
          Rendered only for the pinned rail — the drawer below `lg` opens from a top bar that still
          carries all three, and repeating them inside it would put two brand links and two account
          menus in one accessibility tree. `onCollapse` is the pinned rail's own discriminator: the
          drawer passes `onClose` instead. */}
      {onCollapse ? (
        <div className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <BrandLink orgSlug={orgSlug} />
          {/* `min-w-0` and `flex-1`: the switcher is the one thing here that can truncate, and a
              long organisation name must not push the brand out of a 224 px rail. */}
          <OrgSwitcher className="min-w-0 flex-1 truncate" />
        </div>
      ) : null}
      {/* Shared drawer header chrome ({@link SheetHeader}) — class overrides keep this rail's exact look
          (sidebar border, fixed h-12/no padding, semibold title, gap-1, size-`icon` buttons). The
          rail's extra controls (New client / Collapse) ride the `actions` slot; the Close button is the
          SheetHeader's own. */}
      <SheetHeader
        title="Project Explorer"
        className="border-border h-12 shrink-0 gap-1 px-4 py-0"
        titleClassName="font-semibold tracking-tight"
        actionsClassName="gap-1"
        actions={
          <>
            {/* Root create (CQ-2): an empty org has no node to right-click, so writers get
                a "New client" entry point here; hidden for non-writers and flag-off. */}
            {orgSlug && crud.canWrite ? (
              // A labelled primary button rather than a bare `+` icon: creating the first client
              // is the one action an empty Project Explorer exists to offer, and an unlabelled
              // glyph makes the entry point something you have to already know about.
              //
              // The visible label is shortened to "Client" to fit the rail header, so the button
              // needs an explicit accessible name: "Client" on its own names a NOUN, not what
              // pressing it does. WCAG 2.5.3 (Label in Name) is satisfied because the visible
              // text is contained in the accessible name, so voice control still reaches it by
              // the word on screen.
              <Button
                size="sm"
                aria-label="New client"
                onClick={crud.onCreateClient}
                className="h-7 gap-1 px-2"
              >
                <Plus aria-hidden="true" className="size-4" />
                Client
              </Button>
            ) : null}
            {onCollapse ? (
              <Button
                ref={toggleRef}
                variant="ghost"
                size="icon"
                aria-label="Collapse Project Explorer"
                onClick={onCollapse}
              >
                <PanelLeftClose aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </>
        }
        {...(onClose
          ? {
              onClose,
              closeLabel: 'Close Project Explorer',
              closeButtonSize: 'icon' as const,
            }
          : {})}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {orgSlug ? (
          <HierarchyTree orgSlug={orgSlug} expansion={expansion} onNavigate={onNavigate} />
        ) : (
          <p className="text-muted-foreground p-4 text-sm">Select an organisation to browse.</p>
        )}
      </div>
      {/* The organisation's destinations, relocated from the app header (ADR-0097 Landing D1).
          `shrink-0` and outside the scrolling region: these are six fixed places, and a tree that
          scrolled them out of reach would put the product's whole secondary navigation behind an
          interaction. The tree above takes the flexible height, which is the rail's purpose. */}
      {orgSlug ? <OrgDestinations orgSlug={orgSlug} /> : null}
      {/* The account menu, likewise relocated from the deleted top bar. Below the destinations
          because it is about the reader rather than the organisation, and above the version line
          because that is metadata and not a control. */}
      {onCollapse ? (
        <div className="border-border flex shrink-0 items-center border-t px-2 py-1">
          <AccountChip />
        </div>
      ) : null}
      {/* A quiet footer with both service versions — subtle build metadata, not a nav item. */}
      <div className="border-border shrink-0 border-t px-4 py-2">
        <AppVersionLine />
      </div>
    </Surface>
  );
}

/**
 * The collapsed pinned rail: a slim bar with a control to reopen it, and the organisation's
 * destinations as an icon strip.
 *
 * **The strip is owed by ADR-0097 Landing D1, not an embellishment.** Until D1 the six destinations
 * lived in the app header, where they survived a rail collapse. Collapsing the rail is exactly what
 * a planner does to gain canvas width — the thing this epic chases — so relocating them here and
 * leaving this component as one button would have put the product's whole secondary navigation
 * behind a toggle it had never been behind. `migration.md` names this as a state D1 does not ship
 * without.
 *
 * The tree itself stays collapsed: a tree has no icon form, and the toggle above is the affordance
 * for it. Only the fixed destinations survive the collapse, which is what they were doing before.
 */
export function NavigatorRailCollapsed({
  onExpand,
  focusToggleOnMount,
  orgSlug,
}: {
  onExpand: () => void;
  focusToggleOnMount?: boolean;
  /** Absent outside an organisation route, where there are no destinations to show. */
  orgSlug?: string | undefined;
}): React.ReactElement {
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusToggleOnMount) toggleRef.current?.focus();
  }, [focusToggleOnMount]);

  return (
    <Surface
      tone="panel"
      className="border-border flex h-full flex-col items-center gap-1 border-r py-2"
    >
      {/* **The brand, the switcher and the account survive the collapse, and that is the point.**
          Until Graphite M3 they lived in a top bar that a rail collapse could not reach. Relocating
          them into the rail and rendering only the expand toggle here would have put the product's
          identity and account behind a toggle they had never been behind — the same argument
          `OrgDestinationsCollapsed` records for the six destinations one epic earlier, and the
          reason that component exists at all.

          The switcher stays a native `<select>` at 36 px: its visible text truncates, its popup
          does not, and it keeps full keyboard and screen-reader operation with the accessible name
          ("Active organisation") it already had. `title` carries the current organisation for a
          pointer user, since the visible text cannot. */}
      <BrandLink orgSlug={orgSlug} variant="tile" />
      <OrgSwitcher className="w-9 px-1" title={orgSlug} />
      <Button
        ref={toggleRef}
        variant="ghost"
        size="icon"
        aria-label="Show Project Explorer"
        onClick={onExpand}
      >
        <PanelLeftOpen aria-hidden="true" className="size-4" />
      </Button>
      {/* Pinned to the bottom, matching the expanded rail's zone order, so the same things are in
          the same place either way and collapsing does not shuffle them. */}
      <div className="min-h-0 flex-1" />
      {orgSlug ? <OrgDestinationsCollapsed orgSlug={orgSlug} /> : null}
      <AccountChip />
    </Surface>
  );
}
