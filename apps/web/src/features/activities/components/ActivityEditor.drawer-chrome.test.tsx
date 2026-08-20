import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditor, type ActivityEditorShell } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **What the editor owes a host that is not a window** (Graphite M10).
 *
 * Two facts about the drawer that the M10 gate pass found unhonoured, both invisible from inside
 * this component: the drawer is **224–420 px wide at a viewport where every media query says
 * "wide"**, and its contents **unmount when the panel closes** without the component doing so.
 *
 * The first was a real defect — `railFits` asked the viewport, which is the right question for a
 * dialog sized by the window and the wrong one for a panel sized by a splitter, so the 208 px
 * vertical tab rail always rendered inside a 300 px panel. The second is the opposite: a hazard
 * that turns out not to exist, and the assertion below is what establishes that rather than a
 * paragraph asserting it.
 */

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

const A = {
  id: 'a1',
  planId: 'plan-1',
  name: 'Excavate',
  code: 'A1',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 5,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  version: 1,
} as ActivitySummary;

/** The drawer's chrome: the children, and nothing around them. */
const passthrough: ActivityEditorShell = ({ children }) => <>{children}</>;

/**
 * The drawer's chrome **when the panel is closed** — the portal target is gone, so the fields are
 * not rendered. The component itself stays mounted, which is the property under test.
 */
const hidden: ActivityEditorShell = () => <></>;

function mount(props: { shell?: ActivityEditorShell; tabRailAllowed?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (shell: ActivityEditorShell, railAllowed: boolean | undefined) => (
    <QueryClientProvider client={client}>
      <ActivityEditor
        shell={shell}
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        gating={GATING}
        planActivities={[A]}
        activity={A}
        {...(railAllowed === undefined ? {} : { tabRailAllowed: railAllowed })}
      />
    </QueryClientProvider>
  );
  const result = render(ui(props.shell ?? passthrough, props.tabRailAllowed));
  return { ...result, ui };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as unknown as Response),
    ),
  );
  // jsdom has no `matchMedia`; the hook's fallback is the desktop shape, which is what makes the
  // defect reproducible here — a wide viewport is exactly the case where the drawer is narrow.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

describe('the tab rail', () => {
  it('is a rail in a host with room for it', () => {
    mount();
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('is a horizontal strip in a host that says it has no room, whatever the viewport says', () => {
    // `matchMedia` answers `true` above, so this can only pass if the host's answer wins. That is
    // the whole point: the drawer is 224–420 px at `lg`+, and the rail is 208.
    mount({ tabRailAllowed: false });
    expect(screen.getByRole('tablist')).not.toHaveAttribute('aria-orientation', 'vertical');
  });
});

describe('a draft outlives the panel that was showing it', () => {
  it('survives the drawer closing and reopening, so an unguarded close loses nothing', () => {
    /**
     * **This corrects `m6-activity-context.md`'s own acceptance table** (ADR-0058: verify the
     * claim, do not trust the document). That table lists the drawer's Close button and Escape as
     * routes that "must be guarded", by analogy with the modal — where closing unmounts the editor
     * and its three `useScopeForm` results with it.
     *
     * The analogy does not hold, and the same file says why one section earlier about a different
     * route: the hooks live in `ActivityEditor`, **above** the `shell` call, so a portal returning
     * nothing unmounts the rendered fields and not the component. RHF does not unregister fields by
     * default, so the draft is still there when the panel comes back.
     *
     * The requirement was therefore written from an assumption, and the honest resolution is to
     * establish which way round it is rather than to add a confirmation for a loss that cannot
     * happen. If this ever goes red the doc was right and a guard is owed.
     */
    const { rerender, ui } = mount();
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(/^Name/), {
      target: { value: 'Excavate — revised' },
    });

    rerender(ui(hidden, undefined));
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();

    rerender(ui(passthrough, undefined));
    expect(screen.getByLabelText<HTMLInputElement>(/^Name/).value).toBe('Excavate — revised');
  });
});
