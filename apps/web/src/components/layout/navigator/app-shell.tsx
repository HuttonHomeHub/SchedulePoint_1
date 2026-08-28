import { Outlet, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ExplorerColumn } from './explorer-column';
import { NavigatorCrud } from './navigator-crud';
import { NavigatorRail } from './navigator-rail';
import { ShellContext } from './shell-context';
import { useExplorerPrefs } from './use-explorer-prefs';

/**
 * Width kept for the stage when the drawer's stored width would otherwise eat it. The plan
 * workspace reserves the same 360 px for the diagram (`CANVAS_MIN_WIDTH`), and this is the shell's
 * equivalent one layer out — the shell cannot import that constant without learning what a plan is
 * (ADR-0029), so it is named here and the two are deliberately the same number.
 */
const STAGE_MIN_WIDTH = 360;

import { ChromeBandRow, ChromeSlotHost } from '@/components/layout/chrome/chrome-band';
import { ChromeSlot } from '@/components/layout/chrome/chrome-slot';
import { ContextDrawer } from '@/components/layout/drawer/context-drawer';
import {
  DrawerSubjectProvider,
  DrawerSubjectShowingProvider,
  useDrawerSubjectRegistration,
  useProvideDrawerSubjectControls,
} from '@/components/layout/drawer/drawer-subject';
import {
  CONTEXT_DRAWER_MIN_WIDTH,
  useContextDrawerPrefs,
} from '@/components/layout/drawer/use-context-drawer-prefs';
import { AnnouncerProvider, useAnnounce } from '@/components/ui/announcer';
import { Sheet } from '@/components/ui/sheet';
import { Surface } from '@/components/ui/surface';
import { useMediaQuery } from '@/components/ui/use-media-query';
import { useExpansionState } from '@/features/navigator';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';
import { aNativeModalIsOpen } from '@/lib/escape-rungs';

/** `lg` breakpoint (64rem) as a media query — the pinned rail takes over at/above it. */
const LG_QUERY = '(min-width: 64rem)';

/**
 * The persistent app-shell (ADR-0029): a top bar + Project Explorer rail + a single
 * workspace region that stay **mounted once**, so navigating between plans swaps only
 * the `<Outlet/>` and the rail keeps its state and warm cache. On `lg`+ the rail is
 * pinned (collapsible + resizable); below `lg` it is an off-canvas drawer opened from
 * the header. **Unconditional** since `VITE_NAV_TREE` retired (2026-08-18): {@link AuthedLayout}
 * is now this component and nothing else.
 */
export function AppShell(): React.ReactElement {
  return (
    <AnnouncerProvider>
      {/* Above `ShellFrame`, because the rail reads the registration to decide whether to render a
          button and the drawer reads it for its heading — and the route that WRITES it renders
          inside `<Outlet/>`, below both. */}
      <DrawerSubjectProvider>
        <ShellFrame />
      </DrawerSubjectProvider>
    </AnnouncerProvider>
  );
}

/** Inner frame — inside {@link AnnouncerProvider} so it can announce layout changes. */
function ShellFrame(): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Only steal focus onto the (re)mounted rail toggle after a *user* collapse/expand,
  // never on first paint.
  const drawer = useContextDrawerPrefs();
  const explorer = useExplorerPrefs();
  /**
   * **Whether a route has ASKED for its subject to be shown.**
   *
   * Registration and display are two different statements — "I have something to put here" and
   * "put it there now" — and collapsing them is a defect rather than a simplification. This was
   * carried by `subject === 'context'` while the drawer had two subjects; when M3-T2 removed the
   * second, dropping the state with it made a mere registration open the panel, so navigating to a
   * plan would swap the workspace's trailing column before the planner had pressed anything. Caught
   * by `drawer-entry-point.test.tsx`, which is the suite named for exactly this seam.
   */
  const [showRequested, setShowRequested] = useState(false);
  const announce = useAnnounce();
  const contextSubject = useDrawerSubjectRegistration();
  /**
   * **A registration that goes away takes its subject with it.**
   *
   * Navigating off a plan unregisters, and without this the drawer would keep showing the
   * `'context'` subject — an empty portal target under a heading naming something no longer on
   * screen, with no rail button beside it to change. Derived rather than corrected in an effect:
   * an effect would paint the stale panel for a frame first, and setting state from one is the
   * cascading-render pattern the lint rule rejects (the same argument `ActivityEditorDialog` makes
   * about its landing tab).
   */
  /**
   * **There is no drawer below `lg`**, and that has to reach the route rather than only the CSS.
   *
   * The drawer's wrapper is `hidden lg:flex`, so below 1024 it occupies no space — but
   * `showingContext` had no viewport term, so a planner who narrowed the window with the editor in
   * the drawer portalled it into a `display: none` slot and the editor vanished with no fallback and
   * no message. Their work was not lost (the component stays mounted above the portal), and that is
   * precisely why it read as breakage: nothing on screen said where it had gone. Found by the M10
   * gate pass; the same "hidden, not shaded" class ADR-0082 exists to name.
   *
   * With the viewport in the term, narrowing hands the editor back to `modalShell` — the chrome
   * every width below `lg` has used all along (M6-T5's finding that the modal is not a legacy path).
   */
  const isDesktop = useMediaQuery(LG_QUERY, true);
  const showingContext = isDesktop && showRequested && contextSubject !== null;

  /**
   * **The drawer's effective maximum, clamped against the live shell width.**
   *
   * `useContextDrawerPrefs` clamps to a static 224–420, and the grid gives the drawer's column
   * `auto` — so without this the drawer takes its stored width whatever is left and the stage
   * (`minmax(0,1fr)`) absorbs the shortfall: 676 px of stage at 1024, 420 px at 768. The rule is
   * `use-notes-panel-prefs.ts`'s, stated there and missing here — the effective maximum reserves
   * room for the stage, because the static one can exceed the space available.
   *
   * It is a **best-effort floor, not a guarantee**, exactly as the notes dock records: below about
   * 750 px the reservation and the drawer's own minimum cannot both hold, and the minimum wins.
   * The alternative — letting the drawer shrink under its minimum — is a different defect wearing
   * the same clothes, because 224 px is where its content stops being readable at all.
   */
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellWidth, setShellWidth] = useState(0);
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setShellWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const drawerWidth = Math.min(
    drawer.size,
    Math.max(
      CONTEXT_DRAWER_MIN_WIDTH,
      (shellWidth || drawer.size + STAGE_MIN_WIDTH) - STAGE_MIN_WIDTH,
    ),
  );
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

  /**
   * **Whether the drawer has anything to put in it**, and then whether one is on screen.
   *
   * **One subject now, not two** (workspace redesign M3-T2). The Project Explorer used to be the
   * drawer's other subject, reached by a button on the icon rail; it is a docked column on the
   * leading edge since M3-T1, so the drawer holds only what a route registers. The `subject` state,
   * the switcher and the "pressing the lit button closes it" rule went with the second subject —
   * a switcher over one thing is a control that cannot switch.
   *
   * That leaves the drawer with **no production registrant at all** today (`docs/TECH_DEBT.md`
   * #156, opened by ADR-0101 when the activity editor returned to a modal). The mechanism is kept
   * rather than deleted, because it is what a route uses to host something beside the work, and an
   * `auto` grid column with no child is zero wide — an unused drawer costs the stage nothing. It is
   * recorded here as unused rather than left to read as live.
   *
   * `drawerVisible` gates the Escape rung and `drawerHasContent` the render, and that split
   * survives the collapse: the rung guards on `drawer.collapsed`, which
   * `use-resizable-panel-prefs.ts` persists through an effect, so firing it with nothing on screen
   * would silently write a collapse a reader never asked for and announce a panel closing that was
   * never open.
   */
  const drawerHasContent = !drawer.collapsed && showingContext;

  /**
   * **Whether a drawer is actually on screen** (`docs/TECH_DEBT.md` #168).
   *
   * The viewport term rides on `showingContext` above, so this is now the same fact; it is kept as
   * a separate name because the two questions are different — "is there content" and "can the
   * reader see it" — and collapsing them is how #168 happened in the first place.
   */
  const drawerVisible = drawerHasContent;

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

  /**
   * **Where focus goes when the drawer's contents leave under it.**
   *
   * Closing the drawer unmounts its whole subtree — including the "Close context drawer" button the
   * reader has just pressed — and a browser drops focus from a removed element to `<body>`. That is
   * WCAG 2.4.3, and this repository has now shipped it four times (ADR-0080 M2, ADR-0099 M10,
   * TECH_DEBT #64/#67).
   *
   * **The destination used to be the rail button that opened it, and there is no longer one**
   * (M3-T2). The drawer is no longer a switcher over two subjects: its content is whatever a route
   * registers, and a route that registers something owns the control that opened it. So the honest
   * destination is `<main>`, which is `tabIndex={-1}` for the skip link and therefore always exists
   * — the same last rung the old map fell back to, promoted from unreachable guard to the rule.
   *
   * The name is kept because it is exposed on `DrawerSubjectControls` and a route's own Close
   * button calls it; renaming it would be a change to a seam that has no registrant to test it
   * against (TECH_DEBT #156).
   */
  const focusRailButton = useCallback(() => {
    document.getElementById('main')?.focus();
  }, []);

  const closeDrawerPanel = useCallback(() => {
    // Both, and the pair is the contract: `showRequested` is the ask a route made and `collapsed`
    // is the preference a reader set. Clearing only the ask would leave a closed panel that the
    // next registration reopens; collapsing only the preference would leave the ask standing, so
    // expanding any panel later would bring this subject back unbidden.
    setShowRequested(false);
    drawer.collapse();
    announce(`${contextSubject?.label ?? 'Details'} closed.`);
    focusRailButton();
  }, [drawer, announce, contextSubject, focusRailButton]);

  /**
   * **The route's entry point into the drawer** — what M6-T4 said it had built and had not.
   *
   * A route calls this when it opens something the drawer should host (the three ADR-0060 activity
   * intents). The shell decides what "show" means, so it stays ignorant of plans: point the drawer at
   * the registered subject and expand it if the planner had it closed.
   *
   * **Silent below `lg`** by construction rather than by a guard — `showingContext` carries the
   * viewport term, so the subject is set, nothing is shown, and the route keeps its modal. Widening
   * the window then reveals the editor in the drawer, which is the same transition in the other
   * direction and needs no second rule.
   */
  const showContextSubject = useCallback(() => {
    /**
     * **Announced when it OPENS, and only then.**
     *
     * The manual path (`selectSubject`) has always said "… opened."; this one said nothing, and the
     * gap mattered more than the symmetry suggests: before ADR-0099 every one of these entry points
     * opened a native `<dialog>`, which the platform announces as a dialog and moves focus into. The
     * drawer does neither — deliberately, since the subject follows the canvas selection and
     * stealing focus each time would make the canvas unusable — so without this a planner pressing
     * **Edit** from a row menu got a silent swap of the workspace's trailing column. WCAG 4.1.3, on
     * the capability this fallout patch exists to add.
     *
     * The `opening` test is what keeps it from becoming noise: the same call fires on every
     * selection change once the drawer is already on this subject, and announcing there would talk
     * over the canvas's own `describeActivity`. It says "opened" when something opened.
     */
    const opening = drawer.collapsed || !showRequested;
    setShowRequested(true);
    if (drawer.collapsed) drawer.expand();
    if (opening) announce(`${contextSubject?.label ?? 'Details'} opened.`);
  }, [drawer, announce, contextSubject, showRequested]);

  const drawerControls = useMemo(
    () => ({ show: showContextSubject, focusRailButton }),
    [showContextSubject, focusRailButton],
  );
  useProvideDrawerSubjectControls(drawerControls);

  /**
   * **Escape closes the drawer — as the OUTERMOST rung of the existing ladder, never a new
   * listener** (plan.md §A16).
   *
   * ADR-0080's ladder is tool → open pick → selection, enforced by guards rather than by hoping two
   * listeners fire in a helpful order. The drawer is the rung after those, and three things make it
   * one rather than a competitor:
   *
   * - **A React handler on the shell root, not a `window` listener.** A native listener follows the
   *   DOM tree, and the toolbar is portalled into the chrome band (ADR-0055 S2), so it is not a DOM
   *   descendant of the workspace. React events follow the React tree, which is the reason
   *   `use-plan-workspace-key-scope.ts` exists in that shape.
   * - **`defaultPrevented` defers to every inner rung.** The workspace's rungs call
   *   `preventDefault()` when they act, so one press cannot take a planner's tool AND their
   *   drawer — the ADR-0064 defect class, arriving through a door that decision did not have.
   * - **ADR-0079's target guard**, the fourth consumer of the same selector: an Escape typed into a
   *   text field belongs to that field. Deliberately about text ENTRY and not "anything that is not
   *   the drawer" — Escape on a toolbar button still means Escape.
   *
   * An open native modal is skipped whole: `Dialog` and `Sheet` are `showModal()`, so the browser
   * closes them on Escape and the keydown still bubbles. Without this, dismissing a dialog would
   * also close the drawer behind it — one press, two dismissals, and the second invisible until the
   * first finishes animating.
   */
  const onShellKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !drawerVisible) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      if (aNativeModalIsOpen()) return;
      event.preventDefault();
      closeDrawerPanel();
    },
    [drawerVisible, closeDrawerPanel],
  );

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
          {({ rowsSlotRef, identitySlotRef, modeSlotRef, drawerSlotRef, statusSlotRef }) => (
            <>
              {/* **The shell is ONE grid** (Graphite M2). It replaces nested flex columns, and the
                  reason is §4a: the command band spans the columns the drawer sits inside, so
                  opening a drawer redistributes width between the stage and the drawer and changes
                  the band by ZERO. No ResizeObserver, no measurement, and no way to break it
                  without changing `grid-column` — which is what four epics of measuring a row
                  against its own leftover width bought.

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
              {/* The shell root is an event DELEGATION root, not a control masquerading as one: no
                  role, no tabIndex, no click handler, never focusable itself. It only observes
                  keydowns bubbling from the real controls inside it — the case jsx-a11y cannot tell
                  from a fake button. Making it focusable to satisfy the rule would add a meaningless
                  tab stop, so the accessible answer is the disable, not the fix. Same reasoning, and
                  the same words, as the workspace root one layer in. */}
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div
                ref={shellRef}
                className="relative grid h-dvh grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
                onKeyDown={onShellKeyDown}
              >
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

                {/* Row 1, ALL THREE COLUMNS — the command band. §4a solved by geometry, and now
                    trivially: every column that can change width is inside the span, so resizing
                    the Explorer, opening the drawer and folding either one redistribute width
                    *within* the band and change it by exactly zero. Under the icon rail this had to
                    be `2–3` and rely on column 1 being a fixed 48 px; the docked Explorer is
                    resizable, so the span widened rather than the argument getting a caveat.

                    **Full-bleed** (workspace visual polish, 2026-08-28): the `mt-3 mr-3 mb-2 ml-3`
                    that floated the band as a card on the gradient is a knowing reversal — the
                    product owner who approved the frame asked for it back, edge to edge. The 12 px
                    the margins spent on ground now belongs to the surfaces. */}
                <ChromeBandRow
                  rowsSlotRef={rowsSlotRef}
                  identitySlotRef={identitySlotRef}
                  modeSlotRef={modeSlotRef}
                  className="col-span-3 col-start-1 row-start-1"
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
                  {/* The route learns whether the shell is showing what it registered, because
                      that decides the editor's chrome — a drawer portal or a modal — and one
                      activity must never have two of them. */}
                  <DrawerSubjectShowingProvider
                    showing={showingContext}
                    canShow={isDesktop && contextSubject !== null}
                  >
                    <Outlet />
                  </DrawerSubjectShowingProvider>
                </main>

                {/* Row 2, column 3 — **the context drawer** (ADR-0099 D2). An `auto` column with
                    no child is zero wide, so a closed drawer costs the stage nothing — and because
                    the command band spans columns 2–3, opening it redistributes width between
                    `<main>` and the drawer and changes the band by exactly zero. That is §4a, and
                    it is geometry rather than a measurement anyone has to keep correct.

                    Below `lg` it is not rendered at all: there it would have to overlay, and
                    overlaying means modal, which the `Sheet` below already is. */}
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
                  className="border-border col-span-3 col-start-1 row-start-3 border-t"
                />

                {drawerHasContent ? (
                  <div className="col-start-3 row-start-2 hidden min-h-0 shrink-0 lg:flex">
                    <ContextDrawer
                      // The registered subject names ITSELF ("Excavate"), and says so explicitly
                      // when it has nothing selected rather than keeping the previous subject's
                      // heading over an empty body — the M4 rule ("never the last subject's stale
                      // data") applied to the heading as well as the content.
                      title={contextSubject?.title ?? contextSubject?.label ?? 'Details'}
                      onClose={closeDrawerPanel}
                      width={drawerWidth}
                      onResize={drawer.setSize}
                      className="flex min-h-0"
                    >
                      {/* The route's own markup arrives by portal, so it stays in the plan's React
                          tree and keeps reading the plan's model and gating (ADR-0029). The shell
                          hosts a `<div>` and learns nothing. There is no second arm any more: the
                          Explorer left this panel for its own column in M3-T1, so `drawerHasContent`
                          IS `showingContext` and the fallback it used to guard cannot arise. */}
                      <ChromeSlot slotRef={drawerSlotRef} name="drawer" />
                    </ContextDrawer>
                  </div>
                ) : null}
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
                  // `border-r` as well as the ground: every `panel`-tone consumer pairs the
                  // Surface with a trailing-edge border (`explorer-column.tsx` both states,
                  // `context-drawer.tsx`), and the first version of this fix copied only the
                  // ground half — the panel's trailing edge faded into the scrim with no defined
                  // boundary while the closure note claimed the ExplorerColumn pattern whole
                  // (ux gate, 2026-08-28).
                  <Surface
                    tone="panel"
                    className="border-border flex h-full min-h-0 flex-col border-r"
                  >
                    <NavigatorRail
                      orgSlug={orgSlug}
                      expansion={expansion}
                      onClose={closeDrawer}
                      onNavigate={closeDrawer}
                    />
                  </Surface>
                ) : null}
              </Sheet>
            </>
          )}
        </ChromeSlotHost>
      </NavigatorCrud>
    </ShellContext.Provider>
  );
}
