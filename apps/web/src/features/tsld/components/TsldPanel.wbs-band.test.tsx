import type { ActivitySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The pinned WBS band on the canvas (ADR-0063), with `VITE_WBS_IMPROVEMENTS` forced on.
 *
 * Three things are pinned here, and only the first is about the band itself:
 *
 * 1. The band mounts when its toggle is on, and only then.
 * 2. **The a11y count is invariant across the toggle.** Summaries leave the *scene* when the band
 *    is on; if they left the parallel listbox with it, an AT user would lose rows while the picture
 *    still looked right. This is the epic's quietest possible regression.
 * 3. **`sceneTopOffset` is the one definition of the scene's top.** Every canvas layer moves down
 *    by the band's height together; a layer left on the bare `RULER_HEIGHT` would sit a band's
 *    height out of place, which looks like nothing at all until a pointer lands in the wrong row.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import { RULER_HEIGHT, sceneTopOffset } from './TsldCanvas';
import { TsldPanel } from './TsldPanel';

import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';
import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';
import { anActivity } from '@/test/activity-fixture';

const SUMMARY: ActivitySummary = anActivity({
  id: 'sum',
  name: 'Substructure',
  type: 'WBS_SUMMARY',
  laneIndex: 0,
  earlyStart: '2026-01-01',
  earlyFinish: '2026-03-31',
});
const CHILD: ActivitySummary = anActivity({
  id: 'child',
  name: 'Piling',
  parentId: 'sum',
  laneIndex: 1,
  earlyStart: '2026-01-05',
  earlyFinish: '2026-01-09',
});
const LOOSE: ActivitySummary = anActivity({
  id: 'loose',
  name: 'Loose end',
  laneIndex: 2,
  earlyStart: '2026-02-02',
  earlyFinish: '2026-02-06',
});

const ALL = [SUMMARY, CHILD, LOOSE];

/**
 * The band toggle lives in the shared canvas UI state, so a harness drives it the way the toolbar
 * does rather than by a prop that does not exist. `useTsldCanvasUiState` is called for its other
 * state; only `viewToggles` is overridden.
 */
function Harness({ band }: { band: boolean }): React.ReactElement {
  const ui = useTsldCanvasUiState();
  return (
    <TsldPanel
      activities={ALL}
      dependencies={[]}
      dataDate="2026-01-01"
      canvasUi={{ ...ui, viewToggles: { ...DEFAULT_VIEW_TOGGLES, wbsBand: band } }}
    />
  );
}

const optionNames = (): string[] => screen.getAllByRole('option').map((o) => o.textContent ?? '');

describe('TsldPanel — the pinned WBS band (flag on)', () => {
  it('mounts the band layer only when the toggle is on', () => {
    const { rerender } = render(<Harness band={false} />);
    expect(screen.queryByTestId('tsld-wbs-band')).not.toBeInTheDocument();

    rerender(<Harness band />);
    expect(screen.getByTestId('tsld-wbs-band')).toBeInTheDocument();
  });

  /**
   * ADR-0063 §4's invariant, and the reason the "move them to a band DOM group" draft was dropped:
   * the listbox reads the plan's activities, not what the scene paints, so a summary cannot fall
   * out of the accessibility tree when it leaves the picture. Asserted on the SET, not just the
   * count, so a swap would fail as loudly as a drop.
   */
  it('keeps every activity reachable in the listbox across the toggle', () => {
    const { rerender } = render(<Harness band={false} />);
    const before = optionNames();

    rerender(<Harness band />);
    expect(optionNames()).toEqual(before);
    expect(optionNames().join(' ')).toContain('Substructure');
  });

  it('moves every canvas layer down by the band, together', () => {
    render(<Harness band />);
    const band = screen.getByTestId('tsld-wbs-band');
    const bandHeight = Number.parseFloat(band.style.height);
    expect(bandHeight).toBeGreaterThan(0);

    // The band sits directly under the ruler…
    expect(band.style.top).toBe(`${String(RULER_HEIGHT)}px`);
    // …and the scene starts below both, at the ONE derived offset.
    const scene = document.querySelector('canvas[style*="top"]:not([data-testid])');
    expect(scene).not.toBeNull();
    expect((scene as HTMLElement).style.top).toBe(`${String(sceneTopOffset(bandHeight))}px`);
  });

  it('leaves the scene at the ruler alone when the band is off', () => {
    render(<Harness band={false} />);
    const scene = document.querySelector('canvas[style*="top"]:not([data-testid])');
    expect((scene as HTMLElement).style.top).toBe(`${String(RULER_HEIGHT)}px`);
    // Which is exactly `sceneTopOffset(0)` — the flag-off path is the same expression, not a
    // second one that happens to agree today.
    expect(sceneTopOffset(0)).toBe(RULER_HEIGHT);
  });
});
