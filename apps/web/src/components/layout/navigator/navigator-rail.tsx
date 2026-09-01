import { PanelLeftClose, Plus } from 'lucide-react';

import { OrgDestinations } from './org-destinations';

import { Button } from '@/components/ui/button';
import { SheetHeader } from '@/components/ui/sheet';
import { HierarchyTree, useNavigatorCrud, type UseExpansionState } from '@/features/navigator';
import { AppVersionLine } from '@/features/system';

/**
 * The Project Explorer's root create (CQ-2): an empty organisation has no node to right-click, so
 * writers get a **New client** entry point in the rail's own header.
 *
 * **One component, rendered by both branches** (`docs/TECH_DEBT.md` #169). It was two verbatim
 * copies — same gate, same button, same four-paragraph comment — in the `SheetHeader` branch and the
 * drawer branch. The reason to remove that is not tidiness: #165a is exactly the defect of a rule
 * applied to one copy and not its neighbour, and this row was raised while fixing it.
 *
 * Withheld entirely for a reader who cannot create a client, on ADR-0082's omit clause: there is no
 * action here to shade, only a container whose contents are absent.
 *
 * A labelled primary button rather than a bare `+` icon: creating the first client is the one action
 * an empty Project Explorer exists to offer, and an unlabelled glyph makes the entry point something
 * you have to already know about. The visible label is shortened to "Client" to fit the rail header,
 * so the button needs an explicit accessible name — "Client" on its own names a NOUN, not what
 * pressing it does. WCAG 2.5.3 (Label in Name) is satisfied because the visible text is contained in
 * the accessible name, so voice control still reaches it by the word on screen.
 */
function NewClientButton({
  canWrite,
  onCreateClient,
}: {
  canWrite: boolean;
  onCreateClient: () => void;
}): React.ReactElement | null {
  if (!canWrite) return null;
  return (
    <Button
      size="sm"
      aria-label="New client"
      onClick={onCreateClient}
      // `h-7` overrides `size="sm"` for the rail's density; the coarse override restores the
      // house rule on touch (ADR-0118 M3 — measured 74 x 28, the last control in the Project
      // Explorer under it).
      className="h-7 gap-1 px-2 pointer-coarse:h-(--control-h)"
    >
      <Plus aria-hidden="true" className="size-4" />
      Client
    </Button>
  );
}

/**
 * The **Project Explorer** — the persistent home of the Client → Project → Plan tree (ADR-0029).
 * Rendered once in {@link AppShell}, so it survives route changes, and **only where there is an
 * organisation to show**: the shell withholds it entirely on the three `_authed` routes that carry
 * no `orgSlug` (`docs/TECH_DEBT.md` #165a). This said "when an org is active it hosts the tree;
 * otherwise a brief hint" until 2026-08-22, and that hint was the defect.
 *
 * **It is the leading column again** (workspace redesign M3-T1), after a spell as a subject of the
 * trailing context drawer (Graphite M4). {@link ExplorerColumn} owns the width, the fold and the
 * splitter; this owns the tree, the create control and the organisation's destinations. `onCollapse`
 * is back — it went when the rail took over the toggling, and the docked column needs it again —
 * but `focusToggleOnMount` did not: focus is now moved explicitly by the column, in both
 * directions, rather than reconstructed by a flag on the control that remounts.
 *
 * `onClose` is the below-`lg` `Sheet`'s close, and `onNavigate` fires when a plan is opened (the
 * Sheet uses it to close itself). `onClose` and `onCollapse` are never both passed: the `Sheet` has
 * a Close, the docked column has a fold, and offering both would be two controls for one dismissal
 * that persist differently.
 */
export function NavigatorRail({
  orgSlug,
  expansion,
  onClose,
  onCollapse,
  collapseRef,
  onNavigate,
}: {
  /**
   * The organisation whose tree this shows. **Required**, since `docs/TECH_DEBT.md` #165a.
   *
   * It was optional, with an `orgSlug ? <HierarchyTree/> : <p>Select an organisation to
   * browse.</p>` fallback — and that sentence is the symptom #165a was raised about: it rendered on
   * `/onboarding`, `/account` and `/me/activity`, where there is no organisation to select and the
   * panel could do nothing about it. Now that the shell withholds this component entirely without a
   * slug, both production call sites structurally guarantee one, so the fallback became unreachable
   * code carrying the exact sentence the fix exists to remove. Requiring the prop makes the shell's
   * guarantee a compiler check rather than a comment — the same argument {@link ExplorerColumn}
   * now makes for its own required slug.
   */
  orgSlug: string;
  expansion?: UseExpansionState | undefined;
  onClose?: (() => void) | undefined;
  /**
   * Fold the docked column to its spine (workspace redesign M3-T1). Present only when this rail IS
   * that column — the `Sheet` below `lg` has a Close instead, and offering both would be two
   * controls for one dismissal with different persistence.
   *
   * It lands in the actions row rather than in a header of the column's own, because this component
   * already carries `<nav aria-label="Project Explorer">`: a wrapper adding a second landmark and a
   * second heading with the same name is how one panel comes to announce itself twice.
   */
  onCollapse?: (() => void) | undefined;
  /**
   * The collapse control, handed back so the column can move focus onto it when the spine's expand
   * button unmounts. Focus is moved explicitly rather than left to the platform, because a browser
   * drops focus from a removed element to `<body>` — the WCAG 2.4.3 class this repository has
   * shipped four times.
   */
  collapseRef?: React.Ref<HTMLButtonElement> | undefined;
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
            <NewClientButton canWrite={crud.canWrite} onCreateClient={crud.onCreateClient} />
          }
          onClose={onClose}
          closeLabel="Close Project Explorer"
          closeButtonSize={'icon' as const}
        />
      ) : (
        // In the drawer the subject's actions get a row of their own beneath the drawer's header,
        // because the drawer shell is content-agnostic by design: giving it an `actions` slot would
        // make every future subject's toolbar the shell's problem.
        //
        // **`pointer-coarse:h-(--control-h)` on the ROW, not just its controls** (ADR-0118 M4).
        // The row is a fixed `h-10` (40 px) and holds a 44 px control under a coarse pointer, so
        // it overflowed 2 px into the border and the tree below — the same shape as `icon-sm`'s
        // reverted floor one file over, and found by the same two reviews. Here the container CAN
        // grow: it is `shrink-0` above a `flex-1 overflow-y-auto` tree, so it costs the tree 4 px
        // of scroll height on touch and nothing at all on a mouse. That is why this one is fixed
        // by growing the row and `icon-sm` is fixed by not growing the control.
        <div className="border-border flex h-10 shrink-0 items-center gap-1 border-b px-3 pointer-coarse:h-(--control-h)">
          <NewClientButton canWrite={crud.canWrite} onCreateClient={crud.onCreateClient} />
          {onCollapse ? (
            <Button
              ref={collapseRef}
              variant="ghost"
              // `icon`, not `icon-sm` (ADR-0118 M4): the row above now grows under a coarse
              // pointer, so this control's container is no longer fixed independently of it and
              // D1's `icon-sm` exception does not apply. It reaches 44 px on touch.
              size="icon"
              className="ml-auto"
              aria-label="Hide Project Explorer"
              aria-expanded
              onClick={onCollapse}
            >
              <PanelLeftClose aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <HierarchyTree orgSlug={orgSlug} expansion={expansion} onNavigate={onNavigate} />
      </div>
      {/* **The destinations, at every width** (workspace redesign M3-T2). They are the
          organisation's six fixed places (ADR-0097 Landing D1) and that decision's argument was
          always that they belong to the persistent navigator: "the tree above says where you are in
          the work, and these say where you are in everything around it. One navigator instead of
          two."

          Graphite M4 then split them across two surfaces — this list below `lg`, an icon strip on
          the tool rail above it — with `onClose` as the discriminator, because the rail was the
          persistent navigator at those widths and rendering both put "Clients" on screen twice.
          M3-T1 makes the Project Explorer the persistent navigator at every width, so the split has
          nothing left to discriminate and the condition goes. One surface, one treatment, and no
          way for a seventh destination to reach one and not the other. */}
      <OrgDestinations orgSlug={orgSlug} />
      {/* A quiet footer with both service versions — subtle build metadata, not a nav item. */}
      <div className="border-border shrink-0 border-t px-4 py-2">
        <AppVersionLine />
      </div>
    </nav>
  );
}
