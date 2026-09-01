import { Outlet, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ExplorerColumn } from './explorer-column';
import { NavigatorCrud } from './navigator-crud';
import { NavigatorRail } from './navigator-rail';
import { ShellContext } from './shell-context';
import { useExplorerPrefs } from './use-explorer-prefs';

import { ChromeBandRow, ChromeSlotHost } from '@/components/layout/chrome/chrome-band';
import { ChromeSlot } from '@/components/layout/chrome/chrome-slot';
import { AnnouncerProvider } from '@/components/ui/announcer';
import { Sheet } from '@/components/ui/sheet';
import { PanelSurface } from '@/components/ui/surface';
import { useExpansionState } from '@/features/navigator';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/** `lg` breakpoint (64rem) as a media query — the pinned Explorer column takes over at/above it. */
const LG_QUERY = '(min-width: 64rem)';

/**
 * The persistent app-shell (ADR-0029): a header row + a docked Project Explorer + a single
 * workspace region that stay **mounted once**, so navigating between plans swaps only
 * the `<Outlet/>` and the Explorer keeps its state and warm cache. On `lg`+ the Explorer is a
 * pinned column on the leading edge (foldable + resizable, ADR-0109 D2); below `lg` it is an
 * off-canvas `Sheet` opened from the header. **Unconditional** since `VITE_NAV_TREE` retired
 * (2026-08-18): {@link AuthedLayout} is now this component and nothing else.
 *
 * The word "rail" survives here in {@link NavigatorRail} and in `LG_QUERY`'s comment: that
 * component is the Explorer's tree, and it is called a rail because it used to be one. Renaming it
 * is a separate change to a separate file.
 */
export function AppShell(): React.ReactElement {
  return (
    <AnnouncerProvider>
      <ShellFrame />
    </AnnouncerProvider>
  );
}

/** Inner frame — inside {@link AnnouncerProvider}, which every screen below it announces through. */
function ShellFrame(): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const explorer = useExplorerPrefs();
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;

  /**
   * **Whether the Project Explorer has a root to show at all** (`docs/TECH_DEBT.md` #165a).
   *
   * Three of the thirteen `_authed` routes are not organisation-scoped — `/onboarding`, `/account`
   * and `/me/activity` (`app/router.tsx`) — and on all three the shell rendered the Explorer
   * anyway: ~298 px of drawer at 1646 saying "Select an organisation to browse", beside a card on
   * `/onboarding` asking the reader to create their first organisation. There is nothing to select,
   * by definition, on the first screen a new member ever sees.
   *
   * **The rule was never missing; it was applied to two controls and not their third neighbour.**
   * `app-header.tsx`'s below-`lg` Explorer trigger is already `{shell && orgSlug ? …}`, and
   * `tool-rail.tsx` already withholds the six organisation destinations without a slug — whose own
   * test is titled "renders no destinations outside an organisation — there are none to show". The
   * Explorer button sat forty lines from that, ungated. So this is one derived fact rather than a
   * third copy of the same condition, which is the ADR-0064 §7 / ADR-0093 shape: at the third
   * instance, extract.
   *
   * **Omitted, not shaded** (ADR-0082). Its third omit clause is this case verbatim — there is
   * nothing to show at all, rather than an action shut by a state the reader can change. Picking an
   * organisation in the switcher does not make the Explorer available *here*; it navigates
   * elsewhere, and the switcher two rows up the same rail is already that affordance unshaded. A
   * reason sentence would be the very sentence #165a reports as useless, moved somewhere quieter.
   */
  const explorerAvailable = orgSlug !== undefined;

  // Shared, per-org expansion (ADR-0029 Phase 2): both rails and the CRUD coordinator
  // read one set, so revealing a freshly-created node works and pinned/drawer agree.
  const expansion = useExpansionState(orgSlug);
  // In-tree CRUD is write-RBAC only now that `VITE_NAV_TREE_CRUD` has retired (ADR-0084 batch 1):
  // Contributors/Viewers keep a read-only tree. The API re-checks; this is UX only.
  const role = useOrgRole(orgSlug ?? '');
  const canWrite = canManageHierarchy(role);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const shell = useMemo(() => ({ openDrawer }), [openDrawer]);

  // Close the drawer once the viewport reaches `lg`+, where the pinned rail is shown — otherwise a
  // modal drawer lingers behind it (duplicate landmark + stuck focus trap). This is a *transition
  // side-effect* (close on a breakpoint crossing), not a render value, so a `matchMedia` change
  // listener is the right tool here — the shared `useMediaQuery` hook returns a render boolean and
  // would push the close into a setState-in-effect (TECH_DEBT #30a: intentionally left as-is).
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(LG_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      if (event.matches) setDrawerOpen(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return (
    <ShellContext.Provider value={shell}>
      <NavigatorCrud orgSlug={orgSlug} canWrite={canWrite} expansion={expansion}>
        <ChromeSlotHost>
          {({ rowsSlotRef, identitySlotRef, modeSlotRef, statusSlotRef }) => (
            <>
              {/* **The shell is ONE grid** (Graphite M2). It replaces nested flex columns, and the
                  reason is §4a: the command band spans every column that can change width, so
                  resizing or folding the Explorer redistributes width between it and the stage and
                  changes the band by ZERO. No ResizeObserver, no measurement, and no way to break
                  it without changing `grid-column` — which is what four epics of measuring a row
                  against its own leftover width bought.

                  **Two columns since #156** (2026-09-01). The third was the context drawer's; it
                  had no production registrant after ADR-0101 returned the activity editor to a
                  modal, and the whole mechanism is deleted rather than kept as a seam nothing
                  exercises. An `auto` column with no child is zero wide, so this is provably the
                  same layout — which is exactly why it could sit unused without anyone noticing.

                  Rows 1 and 3 are `auto`, so an unfilled band or status bar is a zero-height row
                  and every screen that is not a plan keeps the frame it has. That is the
                  content-driven-height argument the chrome band already made, preserved.

                  `h-dvh`, NOT `min-h-dvh`. A minimum leaves this box's height `auto`, so every
                  `min-h-0` descendant resolves against content instead of the viewport and the
                  workspace region silently becomes unbounded. The canvas could never reveal that —
                  it sizes itself from a ResizeObserver and fills whatever it is given — but the
                  Gantt's virtualizer measured its scroller, found it as tall as its own content,
                  and rendered every row (ADR-0059 §1's premise, falsified by a layout bug rather
                  than by the substrate choice). The shell is therefore exactly the viewport and
                  `<main>` scrolls, rather than the document scrolling. */}
              <div className="relative grid h-dvh grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
                {/* **The skip link** — the first focusable thing in the document, and the only
                    one there is (`apps/web/src` had none at all before Graphite M3, plan.md §A4).
                    It stays load-bearing after the rail's deletion, with a different traversal to
                    bypass: a keyboard user now tabs the band's header row and then the Explorer's
                    heading, collapse control and a `tree` of however many clients, projects and
                    plans the organisation has, before reaching any of the thirteen routes' content.
                    Shorter than the rail's path and still WCAG 2.4.1 Bypass Blocks.

                    `sr-only focus:not-sr-only` rather than an off-screen box that animates in: it
                    must be reachable, not decorative, and `not-sr-only` restores a real box the
                    moment it takes focus. Absolutely positioned so revealing it cannot reflow the
                    grid under the reader's cursor. */}
                <a
                  href="#main"
                  className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only absolute top-2 left-2 z-50 rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus-visible:ring-2 focus-visible:outline-none"
                >
                  Skip to main content
                </a>

                {/* **Row 2, column 1 — the docked Project Explorer** (workspace redesign M3-T1).
                    It replaces the 48 px icon rail that spanned all three rows, and the swap is
                    the milestone: the rail's four jobs were the brand, the organisation switcher,
                    the six destinations and the account chip — all of them identity or navigation,
                    none of them a reason to give the leading edge of every screen to a column of
                    icons. They are back in the band's header row, which now renders at every width
                    rather than below `lg` only.

                    It occupies row 2 ALONE, not all three. The rail spanned every row because it
                    was chrome; a navigator is content beside content, so the band above it and the
                    status bar below it run the full width and the Explorer sits between them —
                    which is also what lets the band's own geometry argument widen from "columns
                    2–3" to "every column" and stay exactly as true.

                    Hidden below `lg`, where the `Sheet` at the foot of this file is the Explorer
                    and always has been. */}
                {explorerAvailable ? (
                  <div className="col-start-1 row-start-2 hidden min-h-0 shrink-0 lg:flex">
                    <ExplorerColumn orgSlug={orgSlug} expansion={expansion} prefs={explorer} />
                  </div>
                ) : null}

                {/* Row 1, BOTH COLUMNS — the command band. §4a solved by geometry, and now
                    trivially: every column that can change width is inside the span, so resizing
                    the Explorer and folding it redistribute width *within* the band and change it
                    by exactly zero. Under the icon rail this had to be `2–3` and rely on column 1
                    being a fixed 48 px; the docked Explorer is resizable, so the span widened
                    rather than the argument getting a caveat.

                    **Full-bleed** (workspace visual polish, 2026-08-28): the `mt-3 mr-3 mb-2 ml-3`
                    that floated the band as a card on the gradient is a knowing reversal — the
                    product owner who approved the frame asked for it back, edge to edge. The 12 px
                    the margins spent on ground now belongs to the surfaces. */}
                <ChromeBandRow
                  rowsSlotRef={rowsSlotRef}
                  identitySlotRef={identitySlotRef}
                  modeSlotRef={modeSlotRef}
                  className="col-span-2 col-start-1 row-start-1"
                />

                {/* Row 2, column 2 — the one `<main>` for the page. `min-h-0` lets it shrink to the
                    shell; `overflow-auto` gives screens taller than the viewport somewhere to go,
                    so the band and the rail stay put while the content moves.

                    `id="main"` is the skip link's target and `tabIndex={-1}` is what makes the jump
                    actually move focus: without it the browser scrolls to the element and leaves
                    focus where it was, so the next Tab resumes inside the rail — the failure the
                    link exists to fix, silently reintroduced. */}
                <main
                  id="main"
                  tabIndex={-1}
                  className="col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col overflow-auto focus-visible:outline-none"
                >
                  <Outlet />
                </main>

                {/* Row 3, all three columns — **the plan status bar** (ADR-0099 D5). It mirrors
                    the command band above: same span, for the same reason and with the same
                    geometry.

                    The row is `auto` and the slot is `empty:hidden`, so a screen that portals
                    nothing into it is a zero-height row and keeps exactly the frame it had. That is
                    the same content-driven-height property M2 built this grid for, and it is why
                    twelve non-plan screens need no opt-out. */}
                <ChromeSlot
                  slotRef={statusSlotRef}
                  name="status"
                  className="border-border col-span-2 col-start-1 row-start-3 border-t"
                />
              </div>

              {/* Below lg: the rail as an off-canvas drawer. Gated on the same fact as the pinned
                  column — not because it is reachable without one today (its only trigger,
                  `app-header.tsx`'s hamburger, has always been guarded) but because gating it here
                  makes an Explorer with no organisation UNREPRESENTABLE rather than something two
                  guards in two files agree about. #165a is what happens when they stop agreeing.

                  **The gate is on `open`, not on the element.** Unmounting a native `showModal()`
                  `<dialog>` while it is open drops focus to `<body>` — the WCAG 2.4.3 class this
                  register has recorded three times (ADR-0099 M10, ADR-0080 M2). `Sheet` keeps its
                  `<dialog>` mounted and drives it from `open`, so closing it runs `dialog.close()`
                  and the browser restores focus to whatever opened it.

                  **The route to it is narrower than the review that found it said, and narrower
                  than this comment first claimed.** The reasoning offered was that the account chip
                  sits outside the sheet and stays live, so a reader could navigate to `/account`
                  from behind an open Explorer — but `Sheet` is `showModal()`, so everything outside
                  it is INERT and that chip cannot be reached (`sheet.tsx` says so in its own
                  docblock: "an inert backdrop for free"). What is left is browser history: Back out
                  of an organisation route with the sheet open. Exotic, and the guard is a line, so
                  it stays — recorded at its real reachability rather than at the one that would
                  make it sound more necessary. */}
              <Sheet
                open={drawerOpen && explorerAvailable}
                onClose={closeDrawer}
                title="Project Explorer"
              >
                {explorerAvailable ? (
                  // **The ground is this call site's job, and it was missing** (#172's first
                  // find, 2026-08-28). `Sheet` is `bg-transparent` by design — its content owns
                  // the panel — and when the workspace redesign moved the rail's own `Surface`
                  // out to its containers, only the docked `ExplorerColumn` got one. Below `lg`
                  // the Explorer painted NOTHING behind its rows: the page showed through the
                  // open drawer (measured in Chromium at 390 px — dialog and nav both
                  // `rgba(0, 0, 0, 0)`), unnoticed because no journey had ever run below `lg`.
                  // The rail's own docblock said "the container owns the scope: the drawer at
                  // `lg`+, and the `Sheet` below it" — describing the intent, not the code.
                  //
                  // `PanelSurface` carries the ground AND the edge border as one primitive: the
                  // first version of this fix copied only the ground half of the then-literal
                  // pairing — the panel's trailing edge faded into the scrim with no defined
                  // boundary while the closure note claimed the ExplorerColumn pattern whole
                  // (ux gate, 2026-08-28; extracted by TECH_DEBT #210).
                  <PanelSurface className="flex h-full min-h-0 flex-col">
                    <NavigatorRail
                      orgSlug={orgSlug}
                      expansion={expansion}
                      onClose={closeDrawer}
                      onNavigate={closeDrawer}
                    />
                  </PanelSurface>
                ) : null}
              </Sheet>
            </>
          )}
        </ChromeSlotHost>
      </NavigatorCrud>
    </ShellContext.Provider>
  );
}
