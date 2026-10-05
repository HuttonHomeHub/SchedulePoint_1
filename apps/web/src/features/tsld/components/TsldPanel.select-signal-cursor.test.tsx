import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Multi-select ON, because that is what separates the keyboard cursor from the selection: flag-off,
// `aria-activedescendant` IS the selection and this defect cannot exist.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_NAV_ENABLED: true,
    CANVAS_MULTI_SELECT_ENABLED: true,
    TSLD_EDITING_ENABLED: false,
    CANVAS_AUTHORING_ENABLED: false,
  };
});
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import { useTsldCanvasUiState, type TsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

const ACTIVITIES = [
  anActivity({ id: 'a1', name: 'Survey', laneIndex: 0 }),
  anActivity({ id: 'a2', name: 'Excavate', laneIndex: 1 }),
  anActivity({ id: 'a3', name: 'Pour', laneIndex: 2 }),
];

/** The select signal fired without taking focus — the way an undo reveals what it changed. */
function QuietSelectHarness(): React.ReactElement {
  const canvasUi: TsldCanvasUiState = useTsldCanvasUiState();
  return (
    <>
      <button
        type="button"
        onClick={() => canvasUi.requestSelectActivity('a1', { focusListbox: false })}
      >
        reveal
      </button>
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={[]}
        dataDate="2026-01-01"
        canvasUi={canvasUi}
      />
    </>
  );
}

describe('TsldPanel — a select signal moves the keyboard cursor with the selection', () => {
  it('names the revealed row as the active descendant after the cursor had walked elsewhere', () => {
    render(<QuietSelectHarness />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(listbox.getAttribute('aria-activedescendant')).toMatch(/-opt-a3$/);

    const reveal = screen.getByRole('button', { name: 'reveal' });
    reveal.focus();
    fireEvent.click(reveal);

    // The exposed cursor is on a1 with the selection, and focus stayed on the button that asked.
    expect(listbox.getAttribute('aria-activedescendant')).toMatch(/-opt-a1$/);
    expect(reveal).toHaveFocus();
  });
});
