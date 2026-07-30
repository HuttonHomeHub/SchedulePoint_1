import type { ActivitySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The **rollback contract** for the canvas WBS band (ADR-0063). With `VITE_WBS_IMPROVEMENTS` off
 * the canvas is byte-for-byte what it was: no band canvas, no reservation, the scene flush under
 * the ruler, and every summary still painted in the scene.
 *
 * The toggle is deliberately forced ON here while the flag is off. A user cannot reach it in that
 * state — the `View▾` registry gates the item on the same flag — but a persisted preference from a
 * flag-on build could arrive after a rollback, and "you cannot get there from the menu" is not the
 * same promise as "the code refuses". This suite asserts the second one.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: false,
}));

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import { RULER_HEIGHT } from './TsldCanvas';
import { TsldPanel } from './TsldPanel';

import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';
import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';
import { anActivity } from '@/test/activity-fixture';

const ALL: ActivitySummary[] = [
  anActivity({
    id: 'sum',
    name: 'Substructure',
    type: 'WBS_SUMMARY',
    laneIndex: 0,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-03-31',
  }),
  anActivity({
    id: 'child',
    name: 'Piling',
    parentId: 'sum',
    laneIndex: 1,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
  }),
];

function Harness(): React.ReactElement {
  const ui = useTsldCanvasUiState();
  return (
    <TsldPanel
      activities={ALL}
      dependencies={[]}
      dataDate="2026-01-01"
      canvasUi={{ ...ui, viewToggles: { ...DEFAULT_VIEW_TOGGLES, wbsBand: true } }}
    />
  );
}

describe('TsldPanel — VITE_WBS_IMPROVEMENTS off (canvas parity)', () => {
  it('mounts no band canvas, even with the toggle forced on', () => {
    render(<Harness />);
    expect(screen.queryByTestId('tsld-wbs-band')).not.toBeInTheDocument();
  });

  it('leaves the scene flush under the ruler — nothing is reserved', () => {
    render(<Harness />);
    const scene = document.querySelector('canvas[style*="top"]:not([data-testid])');
    expect((scene as HTMLElement).style.top).toBe(`${String(RULER_HEIGHT)}px`);
  });

  // Scene exclusion rides the same gate: with the flag off a summary is still an ordinary bar, so
  // a rollback cannot leave the phases missing from the picture with nothing drawing them.
  it('keeps every activity in the listbox, summaries included', () => {
    render(<Harness />);
    const names = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(names).toHaveLength(ALL.length);
    expect(names.join(' ')).toContain('Substructure');
  });
});
