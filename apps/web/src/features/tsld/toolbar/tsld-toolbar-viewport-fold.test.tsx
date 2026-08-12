import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import {
  resolveItems,
  type ToolbarItemRenderApi,
  type ToolbarLayoutMode,
} from '@/components/ui/toolbar/toolbar-registry';

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  TOOLBAR_QUICK_WINS_ENABLED: true,
}));

/**
 * **The viewport fold** (ADR-0090 M3-T2): below 1280 px, zoom out/in, Fit and Go to today leave the
 * bar and appear inside `Zoom ▾` instead.
 *
 * **Why this is asserted at the registry and not by rendering a narrow `<Toolbar>`.** jsdom has no
 * layout — `clientWidth` is 0 — so the primitive holds `comfortable` forever and a component test
 * could never reach the folded bands at all. That is the same blind spot that let the original
 * overflow defect ship past ~25 suites, and the honest response is to test the layer that *is*
 * decidable here (which items a band resolves, and what the menu renders when handed one) and leave
 * the geometry to `e2e-toolbar-fit`. Neither half is sufficient alone, and this docblock says so
 * rather than letting a green file imply otherwise.
 */

/**
 * **`compact` folds too, and the measurement is why.** M3-T2 was drafted as "condensed and below";
 * the harness then reported that at a 1352 px container (a 1440 px window — Surface Pro landscape,
 * the milestone's own headline target) all four already sat in the anonymous `⋯`, because Row 1's
 * pinned controls alone are 1113 px and the four cost 430 more. The choice at that width was never
 * "inline or folded" — it was "in `⋯ More toolbar actions` or in `Zoom ▾` under a Viewport heading",
 * and only one of those names the subject. See `docs/specs/workspace-layout/m3-narrow-widths.md`.
 */
const FOLDED: ToolbarLayoutMode[] = ['compact', 'condensed', 'collapsed'];
const UNFOLDED: ToolbarLayoutMode[] = ['comfortable'];
/** The four commands the fold moves. `zoom-preset` is the trigger and never moves. */
const VIEWPORT_IDS = ['zoom-out', 'zoom-in', 'fit', 'today'];

const spies = { goToDate: vi.fn(), fit: vi.fn(), stepZoom: vi.fn() };

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({ hasDiagram: true, canvasActive: true, ...spies, ...over });
}

function inlineIds(context: TsldToolbarContext, layout: ToolbarLayoutMode): string[] {
  return resolveItems(buildTsldToolbarItems(), context, true, layout).map((r) => r.item.id);
}

/** Open the zoom menu as the primitive would at `layout`, and return it. */
function openZoomMenu(context: TsldToolbarContext, layout: ToolbarLayoutMode): HTMLElement {
  const item = buildTsldToolbarItems().find((i) => i.id === 'zoom-preset')!;
  const api: ToolbarItemRenderApi = {
    disabled: false,
    disabledReason: undefined,
    active: false,
    layout,
    itemProps: { tabIndex: 0, 'data-toolbar-item': 'zoom-preset' },
  };
  render(<>{item.render!(context, api)}</>);
  fireEvent.click(screen.getByRole('button', { name: /Zoom level/ }));
  return screen.getByRole('menu', { name: 'Zoom level' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the viewport fold', () => {
  for (const layout of UNFOLDED) {
    it(`keeps all four viewport commands on the bar at ${layout}`, () => {
      const ids = inlineIds(ctx(), layout);
      for (const id of VIEWPORT_IDS) expect(ids).toContain(id);
    });
  }

  for (const layout of FOLDED) {
    it(`takes all four off the bar at ${layout}`, () => {
      const ids = inlineIds(ctx(), layout);
      for (const id of VIEWPORT_IDS) expect(ids).not.toContain(id);
      // The trigger that now holds them must itself still be there, or the fold is a deletion.
      expect(ids).toContain('zoom-preset');
    });

    it(`offers all four inside Zoom ▾ at ${layout}`, () => {
      const menu = openZoomMenu(ctx(), layout);
      expect(within(menu).getByRole('separator', { name: 'Viewport' })).toBeInTheDocument();
      for (const name of ['Zoom out', 'Zoom in', 'Fit to plan', 'Go to today']) {
        expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
      }
    });
  }

  it('offers none of them inside Zoom ▾ while they are on the bar', () => {
    const menu = openZoomMenu(ctx(), 'comfortable');
    expect(within(menu).queryByRole('separator', { name: 'Viewport' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Go to today' })).toBeNull();
  });

  /**
   * **The invariant, stated as a sweep rather than as four cases** (the ADR-0063 M6 shape: a
   * capability that is in neither place is exactly what a fold gets wrong, and it is invisible
   * because each band looks right on its own).
   */
  it('leaves every viewport command reachable in every band — inline or folded', () => {
    for (const layout of [...UNFOLDED, ...FOLDED]) {
      // One band per iteration, each from a clean DOM: the auto-cleanup runs per `it`, not per
      // `render`, so a sweep that renders four triggers into one document finds them all.
      cleanup();
      const ids = inlineIds(ctx(), layout);
      const menu = openZoomMenu(ctx(), layout);
      const folded = within(menu)
        .queryAllByRole('menuitem')
        .map((n) => n.textContent ?? '');
      for (const id of VIEWPORT_IDS) {
        const label = {
          'zoom-out': 'Zoom out',
          'zoom-in': 'Zoom in',
          fit: 'Fit to plan',
          today: 'Go to today',
        }[id]!;
        const reachable = ids.includes(id) || folded.some((t) => t.includes(label));
        expect(reachable, `${id} is reachable at ${layout}`).toBe(true);
      }
      fireEvent.keyDown(menu, { key: 'Escape' });
    }
  });

  it('runs the command from the folded row', () => {
    const menu = openZoomMenu(ctx(), 'condensed');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Go to today' }));
    expect(spies.goToDate).toHaveBeenCalledTimes(1);
  });

  /**
   * Shaded with the reason, never dropped (ADR-0082). The wording is asserted because the four
   * inline buttons and the four folded rows are two renderings of one command, and the drift they
   * are most likely to develop is a sentence — this suite's own first draft gave Go-to-today the
   * zoom message.
   */
  it('shades a folded command with its own reason rather than hiding it', () => {
    const menu = openZoomMenu(ctx({ hasDiagram: false }), 'condensed');
    const today = within(menu).getByRole('menuitem', { name: 'Go to today' });
    expect(today).toHaveAttribute('aria-disabled', 'true');
    expect(today).toHaveAccessibleDescription('Add an activity to go to today');
    expect(within(menu).getByRole('menuitem', { name: 'Fit to plan' })).toHaveAccessibleDescription(
      'Add an activity to fit the view',
    );
  });

  it('says "Only in the diagram view" in the Gantt, matching the inline buttons', () => {
    const menu = openZoomMenu(ctx({ canvasActive: false }), 'condensed');
    expect(within(menu).getByRole('menuitem', { name: 'Zoom in' })).toHaveAccessibleDescription(
      'Only in the diagram view',
    );
  });
});
