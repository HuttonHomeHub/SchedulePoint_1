import { Outlet, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { NavigatorCrud } from './navigator-crud';
import { NavigatorRail } from './navigator-rail';
import { ShellContext } from './shell-context';
import { ToolRail, type DrawerSubject } from './tool-rail';

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
  const [subject, setSubject] = useState<DrawerSubject>('explorer');
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
  const showingContext = isDesktop && subject === 'context' && contextSubject !== null;

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

  // Shared, per-org expansion (ADR-0029 Phase 2): both rails and the CRUD coordinator
  // read one set, so revealing a freshly-created node works and pinned/drawer agree.
  const expansion = useExpansionState(orgSlug ?? '');
  // In-tree CRUD is write-RBAC only now that `VITE_NAV_TREE_CRUD` has retired (ADR-0084 batch 1):
  // Contributors/Viewers keep a read-only tree. The API re-checks; this is UX only.
  const role = useOrgRole(orgSlug ?? '');
  const canWrite = canManageHierarchy(role);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const shell = useMemo(() => ({ openDrawer }), [openDrawer]);

  /**
   * **Pressing the button for the subject already showing closes the drawer.** A panel button is a
   * toggle over what the drawer shows, so pressing the lit one has to do something, and re-pointing
   * it at itself does nothing visible — a control that appears inert. Pressing a different
   * subject's button always opens, because that request is unambiguous.
   *
   * The announcement is here rather than in the rail because only the shell knows which of the
   * three outcomes happened; the rail knows only which button was pressed.
   */
  /**
   * What to CALL the drawer when speaking about it.
   *
   * Both announcements said "Project Explorer" unconditionally, which was true while that was the
   * only subject and becomes a false statement the moment a second one exists — a reader who opens
   * the activity panel would be told the Explorer opened. The register keeps recording this exact
   * shape (ADR-0064's confirmation naming the wrong edit, ADR-0060's invented pen message that was
   * false whenever nobody held the pen); it is cheaper to fix while adding the second subject than
   * to find later from a report.
   */
  const subjectName = useCallback(
    (which: DrawerSubject) =>
      which === 'context' ? (contextSubject?.label ?? 'Details') : 'Project Explorer',
    [contextSubject],
  );

  const selectSubject = useCallback(
    (next: DrawerSubject) => {
      const showing = !drawer.collapsed;
      if (showing && next === subject) {
        drawer.collapse();
        announce(`${subjectName(next)} closed.`);
        return;
      }
      setSubject(next);
      if (!showing) drawer.expand();
      announce(`${subjectName(next)} opened.`);
    },
    [drawer, subject, announce, subjectName],
  );

  /**
   * **Where focus goes when the panel's contents leave under it.**
   *
   * Collapsing the drawer unmounts the whole `<ContextDrawer>` subtree — including the "Close
   * context drawer" button the reader has just pressed — and a browser drops focus from a removed
   * element to `<body>`. That is WCAG 2.4.3, and this repository has now shipped it three times
   * (ADR-0080 M2, TECH_DEBT #64/#67), each time in a different control. The rail button is the right
   * destination on the same argument ADR-0080 used: it survives the transition, and it is *about*
   * the panel that went away, so a reader who presses Enter again gets it back.
   *
   * The route needs the same target for the same reason one layer in — the editor's own Close button
   * is inside the portalled subtree — so this is exposed through `DrawerSubjectControls` rather than
   * kept private.
   */
  const railButtons = useRef(new Map<DrawerSubject, HTMLButtonElement | null>());
  const focusRailButton = useCallback(() => {
    const button = railButtons.current.get(subject) ?? railButtons.current.get('explorer');
    button?.focus();
  }, [subject]);

  const closeDrawerPanel = useCallback(() => {
    drawer.collapse();
    announce(`${subjectName(subject)} closed.`);
    focusRailButton();
  }, [drawer, announce, subjectName, subject, focusRailButton]);

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
    const opening = subject !== 'context' || drawer.collapsed;
    setSubject('context');
    if (drawer.collapsed) drawer.expand();
    if (opening) announce(`${subjectName('context')} opened.`);
  }, [drawer, subject, announce, subjectName]);

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
      if (event.key !== 'Escape' || event.defaultPrevented || drawer.collapsed) return;
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
    [drawer.collapsed, closeDrawerPanel],
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
          {({ rowsSlotRef, railSlotRef, drawerSlotRef, statusSlotRef }) => (
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
                    It became load-bearing when the rail took the leading column top to bottom: a
                    keyboard user now tabs brand → switcher → the New-client and collapse controls →
                    a `tree` of however many clients, projects and plans the organisation has → six
                    destinations → the account menu, before reaching any of the thirteen routes'
                    content. That is WCAG 2.4.1 Bypass Blocks.

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

                {/* Column 1 — the tool rail, spanning EVERY row. It is the leading edge top to
                    bottom at a fixed 48 px (Graphite M3 gave it the column, M4 gave it its width):
                    the brand, the organisation switcher, the drawer's panel buttons, the six
                    organisation destinations and the account menu, none of them behind anything.

                    It comes BEFORE the band in the DOM, and that is reading order rather than a
                    preference: the rail's top-left corner is the document's, and the band starts
                    48 px in. plan.md §A4's rule is that DOM order IS visual order — never `order:`,
                    `row-reverse` or `direction: rtl`, each of which decouples focus from reading.
                    The cost is the tab traversal the skip link above exists to answer. */}
                <div className="col-start-1 row-span-3 row-start-1 hidden shrink-0 lg:block">
                  <ToolRail
                    orgSlug={orgSlug}
                    railSlotRef={railSlotRef}
                    subject={subject}
                    drawerOpen={!drawer.collapsed}
                    onSelectSubject={selectSubject}
                    buttonRef={(which, node) => railButtons.current.set(which, node)}
                    contextSubject={
                      contextSubject
                        ? { label: contextSubject.label, icon: contextSubject.icon }
                        : null
                    }
                  />
                </div>

                {/* Row 1, columns 2–3 — the command band. It spans the stage AND the drawer's
                    column, which is §4a solved by geometry: opening the drawer redistributes width
                    between `<main>` and the drawer, both inside this span, so the band changes by
                    zero. The rail is outside the span and is a fixed column, so it cannot affect it
                    either. */}
                <ChromeBandRow
                  rowsSlotRef={rowsSlotRef}
                  className="col-span-2 col-start-2 row-start-1"
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
                {/* Row 3, columns 2–3 — **the plan status bar** (ADR-0099 D5). It mirrors the
                    command band above: same span, so the drawer's width changes it by zero, and the
                    rail is outside the span because it owns column 1 for all three rows.

                    The row is `auto` and the slot is `empty:hidden`, so a screen that portals
                    nothing into it is a zero-height row and keeps exactly the frame it had. That is
                    the same content-driven-height property M2 built this grid for, and it is why
                    twelve non-plan screens need no opt-out. */}
                <ChromeSlot
                  slotRef={statusSlotRef}
                  name="status"
                  className="border-border col-span-2 col-start-2 row-start-3 border-t"
                />

                {drawer.collapsed ? null : (
                  <div className="col-start-3 row-start-2 hidden min-h-0 shrink-0 lg:flex">
                    <ContextDrawer
                      // The registered subject names ITSELF ("Excavate"), and says so explicitly
                      // when it has nothing selected rather than keeping the previous subject's
                      // heading over an empty body — the M4 rule ("never the last subject's stale
                      // data") applied to the heading as well as the content.
                      title={
                        showingContext
                          ? (contextSubject?.title ?? contextSubject?.label ?? 'Details')
                          : 'Project Explorer'
                      }
                      onClose={closeDrawerPanel}
                      width={drawerWidth}
                      onResize={drawer.setSize}
                      className="flex min-h-0"
                    >
                      {showingContext ? (
                        // The route's own markup arrives by portal, so it stays in the plan's React
                        // tree and keeps reading the plan's model and gating (ADR-0029). The shell
                        // hosts a `<div>` and learns nothing.
                        <ChromeSlot slotRef={drawerSlotRef} name="drawer" />
                      ) : (
                        <NavigatorRail orgSlug={orgSlug} expansion={expansion} />
                      )}
                    </ContextDrawer>
                  </div>
                )}
              </div>

              {/* Below lg: the rail as an off-canvas drawer. */}
              <Sheet open={drawerOpen} onClose={closeDrawer} title="Project Explorer">
                <NavigatorRail
                  orgSlug={orgSlug}
                  expansion={expansion}
                  onClose={closeDrawer}
                  onNavigate={closeDrawer}
                />
              </Sheet>
            </>
          )}
        </ChromeSlotHost>
      </NavigatorCrud>
    </ShellContext.Provider>
  );
}
