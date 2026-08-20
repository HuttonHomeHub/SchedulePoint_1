import { Outlet, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { NavigatorCrud } from './navigator-crud';
import { NavigatorRail } from './navigator-rail';
import { ShellContext } from './shell-context';
import { ToolRail, type DrawerSubject } from './tool-rail';

import { ChromeBandRow, ChromeSlotHost } from '@/components/layout/chrome/chrome-band';
import { ContextDrawer } from '@/components/layout/drawer/context-drawer';
import { useContextDrawerPrefs } from '@/components/layout/drawer/use-context-drawer-prefs';
import { AnnouncerProvider, useAnnounce } from '@/components/ui/announcer';
import { Sheet } from '@/components/ui/sheet';
import { useExpansionState } from '@/features/navigator';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

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
      <ShellFrame />
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
  const selectSubject = useCallback(
    (next: DrawerSubject) => {
      const showing = !drawer.collapsed;
      if (showing && next === subject) {
        drawer.collapse();
        announce('Project Explorer closed.');
        return;
      }
      setSubject(next);
      if (!showing) drawer.expand();
      announce('Project Explorer opened.');
    },
    [drawer, subject, announce],
  );

  const closeDrawerPanel = useCallback(() => {
    drawer.collapse();
    announce('Project Explorer closed.');
  }, [drawer, announce]);

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
      if (document.querySelector('dialog[open]')) return;
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
          {({ rowsSlotRef }) => (
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
                    bottom at a fixed 46 px (Graphite M3 gave it the column, M4 gave it its width):
                    the brand, the organisation switcher, the drawer's panel buttons, the six
                    organisation destinations and the account menu, none of them behind anything.

                    It comes BEFORE the band in the DOM, and that is reading order rather than a
                    preference: the rail's top-left corner is the document's, and the band starts
                    46 px in. plan.md §A4's rule is that DOM order IS visual order — never `order:`,
                    `row-reverse` or `direction: rtl`, each of which decouples focus from reading.
                    The cost is the tab traversal the skip link above exists to answer. */}
                <div className="col-start-1 row-span-3 row-start-1 hidden shrink-0 lg:block">
                  <ToolRail
                    orgSlug={orgSlug}
                    subject={subject}
                    drawerOpen={!drawer.collapsed}
                    onSelectSubject={selectSubject}
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
                  <Outlet />
                </main>

                {/* Row 2, column 3 — **the context drawer** (ADR-0099 D2). An `auto` column with
                    no child is zero wide, so a closed drawer costs the stage nothing — and because
                    the command band spans columns 2–3, opening it redistributes width between
                    `<main>` and the drawer and changes the band by exactly zero. That is §4a, and
                    it is geometry rather than a measurement anyone has to keep correct.

                    Below `lg` it is not rendered at all: there it would have to overlay, and
                    overlaying means modal, which the `Sheet` below already is. */}
                {drawer.collapsed ? null : (
                  <div className="col-start-3 row-start-2 hidden min-h-0 shrink-0 lg:flex">
                    <ContextDrawer
                      title="Project Explorer"
                      onClose={closeDrawerPanel}
                      width={drawer.size}
                      onResize={drawer.setSize}
                      className="flex min-h-0"
                    >
                      <NavigatorRail orgSlug={orgSlug} expansion={expansion} />
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
