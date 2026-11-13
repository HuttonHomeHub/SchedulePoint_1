import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **The marquee tool joins the arm/disarm contract** (`docs/specs/canvas-multi-select/` M2-T4).
 *
 * The plan's risk row for this task is "arming a mode nobody can leave", and it was a live
 * possibility rather than a theoretical one: the canvas's Escape branch that returns a tool to
 * `select` is gated on `editing`, and the marquee is deliberately **not** pen-gated because
 * selecting is a read (the ADR-0063 M4b rule). Inheriting that gate would have armed the tool for a
 * Viewer and then trapped them in it — so the ungated branch, and this suite, exist together.
 *
 * `canEdit` is **false** here on purpose. That is the case the other four tools cannot reach and
 * the only one where the bug could have shipped.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

const NO_DEPS: DependencySummary[] = [];

function activity(id: string, name: string, laneIndex: number): ActivitySummary {
  return anActivity({
    id,
    code: null,
    name,
    durationDays: 3,
    durationMinutes: 1440,
    laneIndex,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    accrualType: 'UNIFORM',
  });
}

const A = activity('a', 'Excavate', 0);
const B = activity('b', 'Pour', 1);

function Harness({ canEdit }: { canEdit: boolean }): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode('marquee');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arm once on mount
  }, []);
  return (
    <>
      <span data-testid="mode">{canvasUi.mode}</span>
      <TsldPanel
        activities={[A, B]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit={canEdit}
        canvasUi={canvasUi}
        fill
      />
    </>
  );
}

function mode(): string {
  return screen.getByTestId('mode').textContent ?? '';
}

describe('TsldPanel — the marquee tool mode', () => {
  it.each([true, false])('Escape disarms it with canEdit=%s', (canEdit) => {
    render(<Harness canEdit={canEdit} />);
    expect(mode()).toBe('marquee');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mode()).toBe('select');
  });

  it('announces arming and closing through the one polite region', () => {
    announceSpy.mockClear();
    render(<Harness canEdit={false} />);
    expect(announceSpy).toHaveBeenCalledWith(expect.stringMatching(/^Select · drag across bars/));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(announceSpy).toHaveBeenCalledWith('Tool closed. Select mode.');
  });

  it('states the mode in the band without the add modifier, which the shortcuts sheet carries', () => {
    // The sentence is kept to one line at 1024 wide; "Ctrl to add" moved to the sheet and the
    // Select tooltip (`PlanShortcutsHelp.test.tsx` asserts the row).
    render(<Harness canEdit={false} />);
    expect(screen.getByTestId('canvas-mode-band').textContent).toBe(
      'Select · drag across bars · Esc to stop',
    );
  });
});
