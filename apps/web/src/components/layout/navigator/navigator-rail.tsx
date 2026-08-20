import { Plus } from 'lucide-react';

import { OrgDestinations } from './org-destinations';

import { Button } from '@/components/ui/button';
import { SheetHeader } from '@/components/ui/sheet';
import { HierarchyTree, useNavigatorCrud, type UseExpansionState } from '@/features/navigator';
import { AppVersionLine } from '@/features/system';

/**
 * The **Project Explorer** — the persistent home of the Client → Project → Plan tree (ADR-0029).
 * Rendered once in {@link AppShell}, so it survives route changes. When an org is active it hosts
 * the accessible {@link HierarchyTree}; otherwise a brief hint.
 *
 * **It is a drawer subject now, not a rail** (Graphite M4). It was the leading column, resizable
 * and collapsible; the leading edge belongs to the 46 px {@link ToolRail} and this is the first
 * subject of the trailing context drawer, which owns the width and the closed state. What it lost
 * is a `onCollapse` control and a `focusToggleOnMount`, both of which were about a rail toggling
 * itself — a job the drawer's own close control and the rail's panel button now share, and one
 * this component can no longer see either half of.
 *
 * `onClose` is the below-`lg` `Sheet`'s close, and `onNavigate` fires when a plan is opened (the
 * Sheet uses it to close itself).
 */
export function NavigatorRail({
  orgSlug,
  expansion,
  onClose,
  onNavigate,
}: {
  orgSlug?: string | undefined;
  expansion?: UseExpansionState | undefined;
  onClose?: (() => void) | undefined;
  onNavigate?: (() => void) | undefined;
}): React.ReactElement {
  const crud = useNavigatorCrud();

  return (
    // **A plain `<nav>`, not a `Surface`.** It opened a `panel` scope of its own while it WAS the
    // leading column; as drawer content it sits inside the drawer's `panel` scope, and nesting a
    // scope inside an identical one rebinds every name to the value it already has — which
    // `Surface` throws on, correctly (ADR-0097). The container owns the scope: the drawer at `lg`+,
    // and the `Sheet` below it.
    <nav aria-label="Project Explorer" className="border-border flex h-full min-h-0 flex-col">
      {/* **The title belongs to the container, not to this component** — and only below `lg`.
          The context drawer names itself from its active subject, so a `SheetHeader` here put
          "Project Explorer" on screen twice, one line under the other. The `Sheet` below `lg`
          takes no such title from its own chrome, so there it stays. `onClose` is the
          discriminator, as it is for the destinations below: it is the prop the shell already
          passes to tell the two surfaces apart. */}
      {onClose ? (
        <SheetHeader
          title="Project Explorer"
          className="border-border h-12 shrink-0 gap-1 px-4 py-0"
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
            </>
          }
          onClose={onClose}
          closeLabel="Close Project Explorer"
          closeButtonSize={'icon' as const}
        />
      ) : (
        // In the drawer the subject's actions get a row of their own beneath the drawer's header,
        // because the drawer shell is content-agnostic by design: giving it an `actions` slot would
        // make every future subject's toolbar the shell's problem.
        <div className="border-border flex h-10 shrink-0 items-center gap-1 border-b px-3">
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
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {orgSlug ? (
          <HierarchyTree orgSlug={orgSlug} expansion={expansion} onNavigate={onNavigate} />
        ) : (
          <p className="text-muted-foreground p-4 text-sm">Select an organisation to browse.</p>
        )}
      </div>
      {/* **The destinations, below `lg` only.** They are the organisation's six fixed places
          (ADR-0097 Landing D1) and they belong to the persistent navigator — which since Graphite
          M4 is the tool rail, where `OrgDestinationsCollapsed` carries them as icons at every
          moment. Rendering them here as well put "Clients" on screen twice, in two different
          treatments, which is ADR-0093's rule and was caught by a strict-mode locator resolving to
          two elements rather than by anyone looking.

          Below `lg` the rail is hidden and this component is the `Sheet`'s content, so it is the
          only place they can be. `onClose` is the discriminator because it is the one the shell
          already passes to tell the two surfaces apart. */}
      {orgSlug && onClose ? <OrgDestinations orgSlug={orgSlug} /> : null}
      {/* A quiet footer with both service versions — subtle build metadata, not a nav item. */}
      <div className="border-border shrink-0 border-t px-4 py-2">
        <AppVersionLine />
      </div>
    </nav>
  );
}
