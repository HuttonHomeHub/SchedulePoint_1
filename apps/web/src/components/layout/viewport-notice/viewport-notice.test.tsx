import type * as ReactRouter from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BANNER_DEBOUNCE_MS } from './use-viewport-notice';
import { ViewportBanner, ViewportNotice } from './viewport-notice';
import { resetNoticeMemoryForTests, VIEWPORT_NOTICE_ACK_KEY } from './viewport-notice-ack';

/**
 * The viewport notice (ADR-0179, `docs/specs/minimum-viewport` §2.2–2.6, §4.6).
 *
 * **What jsdom can and cannot say, stated once.** It has no layout, no top layer and no browser
 * focus restoration, so this suite pins the DECISIONS — when the page opens, when the banner shows,
 * what each answer writes, where focus is sent — against a stubbed `matchMedia` and the setup's
 * `showModal`/`close` stubs. What a real browser does with them (inertness, the focus ring, the
 * 320 x 256 fit, forced colours) is `e2e-narrow-shell`'s job, for the reason ADR-0111 gives.
 */

let pathname = '/orgs/acme';
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname } }),
  useParams: () => ({ orgSlug: 'acme' }),
  useNavigate: () => vi.fn(),
}));

const signOut = vi.fn();
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { name: 'Ada Lovelace', email: 'ada@example.test' } } }),
  useSignOut: () => ({ mutate: signOut, isPending: false }),
}));
vi.mock('@/features/organizations', () => ({
  useOrganizations: () => ({ data: [{ slug: 'acme', name: 'Acme Construction' }] }),
}));

// ── A matchMedia that answers the two queries the notice asks, and tells its listeners.
let windowWidth = 1280;
let coarsePointer = false;
const mediaListeners = new Set<() => void>();
const realMatchMedia = window.matchMedia;

function evaluate(query: string): boolean {
  if (query.includes('min-width: 64rem')) return windowWidth >= 1024;
  if (query.includes('pointer: coarse')) return coarsePointer;
  return false;
}

function installMatchMedia(): void {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return evaluate(query);
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
}

function resizeTo(width: number): void {
  windowWidth = width;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  act(() => {
    for (const listener of [...mediaListeners]) listener();
    window.dispatchEvent(new Event('resize'));
  });
}

function Tree(): React.ReactElement {
  return (
    <ViewportNotice>
      <a href="#main">Skip to main content</a>
      <ViewportBanner />
      <label>
        Task name
        <input />
      </label>
      <main id="main" tabIndex={-1}>
        workspace
      </main>
    </ViewportNotice>
  );
}

function pageDialog(): HTMLDialogElement {
  const dialog = document.querySelector('dialog');
  if (!dialog) throw new Error('the notice renders its dialog at all times');
  return dialog;
}

/** Escape / the browser's own close: the dialog is closed without our having asked. */
function closeNatively(): void {
  const dialog = pageDialog();
  dialog.open = false;
  fireEvent(dialog, new Event('close'));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetNoticeMemoryForTests();
  pathname = '/orgs/acme';
  windowWidth = 1280;
  coarsePointer = false;
  mediaListeners.clear();
  signOut.mockClear();
  installMatchMedia();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the full page: when it opens', () => {
  it('stays closed at 1024 and above', () => {
    windowWidth = 1024;
    render(<Tree />);
    expect(pageDialog().open).toBe(false);
  });

  it('treats a missing matchMedia as wide, so nothing ever shows (spec §2.6)', () => {
    // @ts-expect-error -- the environments that lack it are exactly what this pins
    delete window.matchMedia;
    windowWidth = 400;
    render(<Tree />);
    expect(pageDialog().open).toBe(false);
  });

  it('opens on a narrow load, states both widths, and focuses the heading', () => {
    windowWidth = 900;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    render(<Tree />);
    expect(pageDialog().open).toBe(true);
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'SchedulePoint is designed for larger screens',
    });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');
    const dialog = pageDialog();
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(
      within(dialog).getByText(/at least 1024 pixels wide\. Your window is\s+900 pixels wide\./),
    ).toHaveAttribute('id', dialog.getAttribute('aria-describedby'));
  });

  it('opens on a pathname change while narrow, and not on a re-render at the same pathname', () => {
    windowWidth = 900;
    const view = render(<Tree />);
    closeNatively();
    resetNoticeMemoryForTests();
    sessionStorage.clear();
    expect(pageDialog().open).toBe(false);

    // The same pathname (a search-param change leaves it untouched, ADR-0123): still closed.
    view.rerender(<Tree />);
    expect(pageDialog().open).toBe(false);

    pathname = '/orgs/acme/clients';
    view.rerender(<Tree />);
    expect(pageDialog().open).toBe(true);
  });

  it('never opens for a live narrowing: that gets the banner', () => {
    render(<Tree />);
    resizeTo(700);
    expect(pageDialog().open).toBe(false);
  });

  it('puts "Turn your tablet sideways" first on a coarse pointer only', () => {
    windowWidth = 900;
    coarsePointer = true;
    const { unmount } = render(<Tree />);
    const coarse = within(pageDialog()).getAllByRole('listitem');
    expect(coarse.map((item) => item.textContent)).toEqual([
      'Turn your tablet sideways',
      'Zoom out — press Ctrl and minus, or Ctrl and 0 to reset (⌘ on a Mac)',
      'Make the browser window wider',
    ]);
    unmount();

    coarsePointer = false;
    render(<Tree />);
    expect(
      within(pageDialog())
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Zoom out — press Ctrl and minus, or Ctrl and 0 to reset (⌘ on a Mac)',
      'Make the browser window wider',
    ]);
  });

  it('keeps Continue anyway the first tab stop, with Sign out after it and no control in the tips', () => {
    windowWidth = 900;
    render(<Tree />);
    const dialog = pageDialog();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Continue anyway', 'Sign out']);
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
    expect(within(within(dialog).getByRole('list')).queryAllByRole('button')).toHaveLength(0);
  });

  it('says who is signed in, and Sign out signs out', () => {
    windowWidth = 900;
    render(<Tree />);
    expect(
      within(pageDialog()).getByText('Signed in as Ada Lovelace · Acme Construction'),
    ).toBeInTheDocument();
    fireEvent.click(within(pageDialog()).getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('what each answer remembers', () => {
  it('Continue anyway is persistent: it writes the key, closes, and survives a pathname change', () => {
    windowWidth = 900;
    const view = render(<Tree />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));
    expect(localStorage.getItem(VIEWPORT_NOTICE_ACK_KEY)).toBe('1');
    expect(pageDialog().open).toBe(false);

    pathname = '/orgs/acme/clients';
    view.rerender(<Tree />);
    expect(pageDialog().open).toBe(false);
  });

  it('Escape (a close we did not ask for) is for the visit only: nothing persistent is written', () => {
    windowWidth = 900;
    const view = render(<Tree />);
    closeNatively();
    expect(localStorage.getItem(VIEWPORT_NOTICE_ACK_KEY)).toBeNull();
    expect(localStorage.length).toBe(0);

    // The same visit: a navigation does not bring it back.
    pathname = '/orgs/acme/clients';
    view.rerender(<Tree />);
    expect(pageDialog().open).toBe(false);
    view.unmount();

    // A new visit (a fresh tab: no session storage, no module memory) meets it again.
    sessionStorage.clear();
    resetNoticeMemoryForTests();
    render(<Tree />);
    expect(pageDialog().open).toBe(true);
  });

  it('widening closes the page and stores nothing (D-b)', () => {
    windowWidth = 900;
    render(<Tree />);
    expect(pageDialog().open).toBe(true);
    resizeTo(1200);
    expect(pageDialog().open).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // ...and because it recorded no dismissal, narrowing again is a live crossing: a banner.
    vi.useFakeTimers();
    resizeTo(800);
    act(() => {
      vi.advanceTimersByTime(BANNER_DEBOUNCE_MS);
    });
    expect(screen.getByTestId('viewport-banner')).toBeInTheDocument();
    expect(pageDialog().open).toBe(false);
  });

  it('another tab acknowledging closes this one (the storage event)', () => {
    windowWidth = 900;
    render(<Tree />);
    expect(pageDialog().open).toBe(true);
    act(() => {
      localStorage.setItem(VIEWPORT_NOTICE_ACK_KEY, '1');
      window.dispatchEvent(new StorageEvent('storage', { key: VIEWPORT_NOTICE_ACK_KEY }));
    });
    expect(pageDialog().open).toBe(false);
  });
});

describe('the dialog is never unmounted', () => {
  it('is the same DOM node before, during and after it is open, with the shell mounted under it', () => {
    windowWidth = 900;
    const view = render(<Tree />);
    const dialog = pageDialog();
    const shell = screen.getByRole('main', { hidden: true });
    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));
    expect(pageDialog()).toBe(dialog);
    pathname = '/orgs/acme/other';
    view.rerender(<Tree />);
    expect(pageDialog()).toBe(dialog);
    expect(screen.getByRole('main')).toBe(shell);
  });

  it('keeps what was typed under it', () => {
    render(<Tree />);
    const field = screen.getByLabelText('Task name');
    fireEvent.change(field, { target: { value: 'Pour slab' } });
    resizeTo(700);
    resizeTo(1280);
    expect(screen.getByLabelText('Task name')).toHaveValue('Pour slab');
  });
});

describe('focus on close', () => {
  it('leaves focus alone when the browser restored it to the element that held it', () => {
    const view = render(<Tree />);
    const field = screen.getByLabelText('Task name');
    field.focus();
    resizeTo(900);
    pathname = '/orgs/acme/clients';
    view.rerender(<Tree />);
    expect(pageDialog().open).toBe(true);

    // jsdom restores nothing, so stand in for the browser's close steps.
    const close = HTMLDialogElement.prototype.close;
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
      this: HTMLDialogElement,
    ) {
      field.focus();
      close.call(this);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));
    expect(field).toHaveFocus();
  });

  it('sends it to #main when the element that held it is gone', () => {
    const view = render(<Tree />);
    const field = screen.getByLabelText('Task name');
    field.focus();
    resizeTo(900);
    pathname = '/orgs/acme/clients';
    view.rerender(<Tree />);
    field.remove();
    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('sends it to #main when nothing held it, as on a fresh load', () => {
    windowWidth = 900;
    render(<Tree />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('sends it to #main when it is connected but the browser could not restore it', () => {
    const view = render(<Tree />);
    const field = screen.getByLabelText('Task name');
    field.focus();
    resizeTo(900);
    pathname = '/orgs/acme/clients';
    view.rerender(<Tree />);
    // jsdom's close() moves nothing back: focus is on <body>, which is exactly what a browser
    // reports for an element inside a closed, still-mounted Sheet.
    expect(field).toBeInTheDocument();
    closeNatively();
    expect(screen.getByRole('main')).toHaveFocus();
  });
});

describe('the banner: a live narrowing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('mounts its polite live region empty, and only its text changes', () => {
    render(<Tree />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();

    resizeTo(700);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(BANNER_DEBOUNCE_MS);
    });
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('This window is narrower than SchedulePoint is designed for');
  });

  it('waits out the debounce, never takes focus, and hides at once on widening', () => {
    render(<Tree />);
    const field = screen.getByLabelText('Task name');
    field.focus();

    resizeTo(700);
    act(() => {
      vi.advanceTimersByTime(BANNER_DEBOUNCE_MS - 1);
    });
    expect(screen.queryByTestId('viewport-banner')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('viewport-banner')).toBeInTheDocument();
    expect(pageDialog().open).toBe(false);
    expect(field).toHaveFocus();

    resizeTo(1100);
    expect(screen.queryByTestId('viewport-banner')).not.toBeInTheDocument();
  });

  it('does not flicker while the width is dragged across the floor', () => {
    render(<Tree />);
    for (let i = 0; i < 5; i += 1) {
      resizeTo(1000);
      act(() => {
        vi.advanceTimersByTime(BANNER_DEBOUNCE_MS - 50);
      });
      resizeTo(1100);
    }
    expect(screen.queryByTestId('viewport-banner')).not.toBeInTheDocument();
  });

  it('is deferred while a pointer button is down, and appears on release', () => {
    render(<Tree />);
    resizeTo(700);
    fireEvent.pointerDown(window);
    act(() => {
      vi.advanceTimersByTime(BANNER_DEBOUNCE_MS * 3);
    });
    expect(screen.queryByTestId('viewport-banner')).not.toBeInTheDocument();
    act(() => {
      fireEvent.pointerUp(window);
    });
    expect(screen.getByTestId('viewport-banner')).toBeInTheDocument();
  });

  it('Continue anyway on the banner is persistent; Dismiss is for the visit only', () => {
    const first = render(<Tree />);
    resizeTo(700);
    act(() => {
      vi.advanceTimersByTime(BANNER_DEBOUNCE_MS);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('viewport-banner')).not.toBeInTheDocument();
    expect(localStorage.getItem(VIEWPORT_NOTICE_ACK_KEY)).toBeNull();
    first.unmount();

    sessionStorage.clear();
    resetNoticeMemoryForTests();
    render(<Tree />);
    expect(pageDialog().open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));
    expect(localStorage.getItem(VIEWPORT_NOTICE_ACK_KEY)).toBe('1');
  });

  it('gives way to the full page when the pathname next changes while still narrow', () => {
    const view = render(<Tree />);
    resizeTo(700);
    act(() => {
      vi.advanceTimersByTime(BANNER_DEBOUNCE_MS);
    });
    expect(screen.getByTestId('viewport-banner')).toBeInTheDocument();

    pathname = '/orgs/acme/clients';
    view.rerender(<Tree />);
    expect(pageDialog().open).toBe(true);
    expect(screen.queryByTestId('viewport-banner')).not.toBeInTheDocument();
  });
});

describe('where the notice lives', () => {
  it('is mounted by the signed-in layout alone, so /sign-in, /share and /staff can never show it', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const src = resolve(__dirname, '../../..');

    const importers: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) {
          if (/viewport-notice\/viewport-notice['"]/.test(readFileSync(path, 'utf8'))) {
            importers.push(path.slice(src.length + 1));
          }
        }
      }
    };
    walk(src);
    expect(importers).toEqual(['routes/authed-layout.tsx']);

    const router = readFileSync(join(src, 'app/router.tsx'), 'utf8');
    // The layout is the component of exactly one route, the `_authed` one...
    expect(router.match(/component: AuthedLayout/g)).toHaveLength(1);
    expect(router).toMatch(
      /const authedRoute = createRoute\(\{(?:(?!createRoute)[\s\S])*?component: AuthedLayout/,
    );
    // ...and the three screens CQ-3 excludes hang from the root, not from it.
    for (const path of ['/sign-in', '/staff', '/share']) {
      expect(router).toMatch(new RegExp(`getParentRoute: \\(\\) => rootRoute,\\s*path: '${path}'`));
    }
  });
});
