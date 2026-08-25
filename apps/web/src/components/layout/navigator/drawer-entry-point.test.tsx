import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './app-shell';

import { ChromePortal } from '@/components/layout/chrome/chrome-slot';
import {
  useDrawerSubject,
  useDrawerSubjectControls,
  useDrawerSubjectShowing,
} from '@/components/layout/drawer/drawer-subject';

/**
 * **The drawer's entry point, and where focus goes when its contents leave** (Graphite M10).
 *
 * The M10 gate pass found the M6 milestone's headline capability unreachable: `m6-activity-context.md`
 * T4 says "the three ADR-0060 intents open the drawer", and registering a subject only ever made a
 * rail button appear. Pressing **Edit** opened the modal at every width unless the planner had
 * already discovered that button — ADR-0081's defect exactly, and invisible to every unit suite,
 * because they mount the editor and not the shell.
 *
 * So these tests drive the **whole chain** rather than the callback: a probe route that registers a
 * subject and asks for it, mounted inside the real shell, asserted by what a reader can see. The
 * M6 spec's own words about a different seam apply here — *"testing the callback alone would prove
 * the door opens and nothing about the room"*.
 *
 * The probe stands in for the plan workspace deliberately. Mounting the real one would need the
 * plan's whole query surface, and what is under test is the shell's contract with **any** route.
 */

/**
 * An organisation, because this suite drives the drawer's Explorer subject as well as the
 * registered one — and since `docs/TECH_DEBT.md` #165a the shell withholds the Explorer without a
 * slug. It was `{}` here for the same reason it was `{}` in `app-shell.test.tsx`: the org-less
 * shell was the whole area's default fixture, which is most of why nobody saw that three real
 * routes were living in it.
 */
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Outlet: () => <ProbeRoute />,
  useParams: () => ({ orgSlug: 'acme' }),
  useRouterState: () => '/',
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
    params?: unknown;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof to === 'string' ? to : '/'} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/layout/app-header', () => ({ AppHeaderRow: () => null }));

const PROBE_ICON = <span aria-hidden="true">i</span>;

/** A route that offers the drawer a subject and asks for it, exactly as the plan workspace does. */
function ProbeRoute(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const controls = useDrawerSubjectControls();
  const showing = useDrawerSubjectShowing();
  useDrawerSubject({
    label: 'Activity details',
    icon: PROBE_ICON,
    ...(open ? { title: 'Excavate' } : {}),
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          controls.show();
        }}
      >
        Edit activity
      </button>
      <span data-testid="chrome">{showing ? 'drawer' : 'modal'}</span>
      {showing ? (
        <ChromePortal name="drawer">
          <p>Activity fields</p>
        </ChromePortal>
      ) : null}
    </div>
  );
}

function renderShell(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppShell />
    </QueryClientProvider>,
  );
}

/** `lg`+ unless a test says otherwise — the width at which the drawer exists at all. */
function stubViewport(matchesLg: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('64rem') ? matchesLg : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(() => {
  localStorage.clear();
  stubViewport(true);
});

/**
 * **This mounts a synthetic `ProbeRoute`, not the product — and as of ADR-0101 no production
 * route registers a subject at all.**
 *
 * It stayed green through the removal of the only real registrant (the activity editor, moved
 * back to a modal dialog), which is the honest description of what it covers: the shell
 * MECHANISM works — a registered subject reaches the drawer, announces, expands a closed panel,
 * stays out of the way below `lg`, and returns focus to the rail button on close. It has never
 * proved that anything in the product registers one, and it did not catch that nothing does.
 *
 * That is ADR-0081's shape one level along, and it is written here rather than in a postmortem
 * because the next reader will otherwise take this file as coverage of a live entry point.
 * `docs/TECH_DEBT.md` #156 carries the mechanism's two exits.
 */
describe('a route asking the shell to show its subject', () => {
  it("opens the drawer on the registered subject, which is the route's only entry point", () => {
    renderShell();
    // Before: no drawer at all, and the route in modal chrome. The Explorer used to be the drawer's
    // resting subject; since M3-T1 it is a docked column, so an unregistered drawer is simply
    // absent — an `auto` grid column with no child, costing the stage nothing.
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByTestId('chrome')).toHaveTextContent('modal');
    expect(screen.queryByText('Activity fields')).not.toBeInTheDocument();
    // The docked Explorer is beside it throughout and is NOT what opens or closes here — asserted,
    // because the two panels now live on opposite edges with separate persisted state and a
    // regression that folded one when the other opened would look plausible on screen.
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));

    // After: the drawer names the subject and hosts its markup, and the route knows to render in
    // drawer chrome rather than opening a second copy of itself in a modal.
    expect(screen.getByTestId('chrome')).toHaveTextContent('drawer');
    expect(screen.getByText('Activity fields')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Excavate' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
  });

  it('announces the panel it opened, and only when it opens one', async () => {
    /**
     * **A silent open is a WCAG 4.1.3 regression, not a stylistic gap.** Before ADR-0099 every one
     * of these entry points opened a native `<dialog>`, which the platform announces and moves focus
     * into. The drawer does neither — deliberately, since the subject follows the canvas selection
     * — so without this a planner pressing Edit from a row menu got a silent swap of the workspace's
     * trailing column. The manual rail path had always announced; the programmatic one did not.
     *
     * The second half is what keeps it from becoming noise: the same call fires on every selection
     * change once the drawer is already on this subject, and announcing there would talk over the
     * canvas's own activity announcement.
     */
    renderShell();
    const announcer = () => screen.getByTestId('announcer');

    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));
    // The announcer clears-then-sets on an animation frame, so this polls rather than reads.
    await waitFor(() => expect(announcer()).toHaveTextContent('Activity details opened.'));

    // Already showing this subject: a re-ask is a subject change, not an open.
    announcer().textContent = '';
    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(announcer()).toHaveTextContent('');
  });

  it('expands a drawer the planner had closed', () => {
    renderShell();
    // Close it the way a planner does — from its own control, which is the only one there is now
    // that the rail's subject buttons are gone.
    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close context drawer' }));
    expect(screen.queryByText('Activity fields')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));
    expect(screen.getByText('Activity fields')).toBeInTheDocument();
  });

  it('shows nothing below lg, so the route keeps its modal instead of portalling into a hidden slot', () => {
    // The drawer's wrapper is `hidden lg:flex`. Without the viewport term in `showingContext` the
    // editor portalled into a `display: none` slot and vanished with no fallback and no message —
    // work not lost, but nothing on screen saying where it had gone.
    stubViewport(false);
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));
    expect(screen.getByTestId('chrome')).toHaveTextContent('modal');
    expect(screen.queryByText('Activity fields')).not.toBeInTheDocument();
  });
});

describe('closing the drawer', () => {
  /**
   * **The destination changed and the requirement did not** (M3-T2).
   *
   * WCAG 2.4.3. The Close button lives inside the subtree the collapse unmounts, so the browser
   * drops focus to `<body>` — which also silently disables every keyboard accelerator bound on the
   * workspace root (the ADR-0080 M2 finding, in its third costume).
   *
   * It used to land on the rail button that opened the panel. There is no rail: the drawer is no
   * longer a switcher over two subjects, so the control that opened it belongs to whichever route
   * registered the subject and the shell has no handle on it. `<main>` is the honest destination —
   * always present, `tabIndex={-1}` for the skip link, and the same last rung the old lookup fell
   * back to, promoted from an unreachable guard to the rule.
   */
  it('puts focus on main rather than dropping it to the body', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));

    fireEvent.click(screen.getByRole('button', { name: 'Close context drawer' }));

    expect(screen.queryByText('Activity fields')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('puts focus on main when Escape closes it', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Edit activity' }));

    fireEvent.keyDown(screen.getByRole('main'), { key: 'Escape' });

    expect(screen.queryByText('Activity fields')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
