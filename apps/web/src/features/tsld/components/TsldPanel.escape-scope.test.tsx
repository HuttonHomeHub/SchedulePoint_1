import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_LENSES_ENABLED: true,
  CANVAS_SEARCH_NAV_ENABLED: true,
  CANVAS_AUTHORING_ENABLED: true,
  CANVAS_AUTHORING_FLOW_ENABLED: true,
  TSLD_EDITING_ENABLED: true,
}));

/**
 * **An Escape typed into a text field belongs to that field**
 * (`docs/specs/canvas-search-navigation/` §4.5, M1-T4).
 *
 * The canvas's Escape handler is a native `window` listener (ADR-0064), so before this guard it
 * fired wherever focus was — and a planner refining a search query with the Link tool armed lost the
 * tool to a keystroke they aimed at the text. That is the exact defect class ADR-0064 was opened on,
 * and it was **live**: the flag-on journey found it on its first run, which is why these assertions
 * exist as unit tests only after the fact.
 *
 * Verified red against the pre-fix listener: every "still armed" case below reported `select`.
 *
 * The sibling half — that Escape on the canvas itself still disarms — is `TsldPanel.disarm.test.tsx`,
 * which passes **unchanged**. Asserting the amendment without asserting what it must not break
 * proves half a contract.
 */
function makeActivity(over: Partial<ActivitySummary> & { id: string }): ActivitySummary {
  return {
    name: 'Task',
    code: null,
    type: 'TASK',
    durationDays: 5,
    laneIndex: 0,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
    isCritical: false,
    ...over,
  } as ActivitySummary;
}

const A = makeActivity({ id: '11111111-1111-4111-8111-111111111111', name: 'Pile A' });
const B = makeActivity({
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Pile B',
  laneIndex: 1,
});
const NO_DEPS: DependencySummary[] = [];

function Harness(): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode('link');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arm once on mount
  }, []);
  return (
    <>
      <span data-testid="mode">{canvasUi.mode}</span>
      {/* Stand-ins for the real toolbar controls: this suite is about WHERE the key was typed, and
          mounting the whole portalled toolbar would make it about the toolbar instead. */}
      <input data-testid="text-field" type="search" aria-label="Search or filter activities" />
      <button data-testid="plain-button" type="button">
        Not a text field
      </button>
      <TsldPanel
        activities={[A, B]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        canvasUi={canvasUi}
        onCreate={() => Promise.resolve({ recalcConflict: null })}
        fill
      />
    </>
  );
}

function mode(): string {
  return screen.getByTestId('mode').textContent ?? '';
}

describe('the canvas Escape listener ignores keys typed into a text control', () => {
  it('leaves an armed tool armed when Escape comes from the search field', () => {
    render(<Harness />);
    expect(mode()).toBe('link');
    fireEvent.keyDown(screen.getByTestId('text-field'), { key: 'Escape', bubbles: true });
    expect(mode()).toBe('link');
  });

  it('still disarms when Escape comes from a button', () => {
    // The guard is about text ENTRY, not about "anything that is not the canvas". A toolbar button
    // is not somewhere Escape means "undo my typing", so the tool contract still applies there —
    // and a guard written as `target !== canvas` would silently have taken this away too.
    render(<Harness />);
    fireEvent.keyDown(screen.getByTestId('plain-button'), { key: 'Escape', bubbles: true });
    expect(mode()).toBe('select');
  });

  it('still disarms when Escape comes from the document', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mode()).toBe('select');
  });
});
