import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplorerColumn } from './explorer-column';
import { explorerCeiling, useExplorerPrefs } from './use-explorer-prefs';

import type { UseExpansionState } from '@/features/navigator';

// Honours `landmark` as the real rail does, so a column that forgot `landmark={false}` shows up as
// two navigations rather than passing against a stub that never had a second one.
vi.mock('./navigator-rail', () => ({
  NavigatorRail: ({ landmark = true }: { landmark?: boolean }) =>
    landmark ? <nav aria-label="Project Explorer" /> : <div data-testid="rail" />,
}));
vi.mock('./org-destinations', () => ({ OrgDestinationsCollapsed: () => null }));

function Probe(): React.ReactElement {
  const prefs = useExplorerPrefs();
  return <ExplorerColumn orgSlug="acme" expansion={{} as UseExpansionState} prefs={prefs} />;
}

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('ExplorerColumn splitter', () => {
  it('announces the ceiling as its maximum, and follows a viewport shrink', () => {
    setViewport(1024);
    render(<Probe />);
    const separator = screen.getByRole('separator', { name: 'Resize Project Explorer' });
    expect(separator).toHaveAttribute('aria-valuemax', String(explorerCeiling(1024)));

    act(() => {
      setViewport(900);
      window.dispatchEvent(new Event('resize'));
    });
    expect(separator).toHaveAttribute('aria-valuemax', String(explorerCeiling(900)));
    expect(explorerCeiling(900)).toBeLessThan(explorerCeiling(1024));
  });
});

describe('ExplorerColumn landmark', () => {
  /**
   * The splitter sits INSIDE the one "Project Explorer" navigation (`docs/TECH_DEBT.md` #473): it was
   * the rail's sibling, outside every region, and axe's `region` rule flagged its wrapper on every
   * page. Exactly one such landmark, or the panel announces itself twice.
   */
  it('holds the splitter inside the single Project Explorer navigation', () => {
    render(<Probe />);
    const landmarks = screen.getAllByRole('navigation', { name: 'Project Explorer' });
    expect(landmarks).toHaveLength(1);
    const separator = screen.getByRole('separator', { name: 'Resize Project Explorer' });
    expect(landmarks[0]).toContainElement(separator);
    expect(landmarks[0]).toContainElement(screen.getByTestId('rail'));
  });

  it('keeps the tab order: the rail, then the splitter', () => {
    render(<Probe />);
    const rail = screen.getByTestId('rail');
    const separator = screen.getByRole('separator', { name: 'Resize Project Explorer' });
    expect(rail.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('ExplorerColumn spine', () => {
  it('takes its width from what it holds, and its expand button follows the pointer', () => {
    localStorage.setItem('schedulepoint-explorer', JSON.stringify({ collapsed: true }));
    render(<Probe />);
    const show = screen.getByRole('button', { name: 'Show Project Explorer' });
    // `w-fit`: the 45 px (mouse) and 53 px (finger) widths are arithmetic over the links, not
    // constants, so there is nothing to keep in step (measured at e2e-workspace-fit).
    expect(show.closest('[data-panel-border]')).toHaveClass('w-fit');
    // `icon-row`, not `icon-sm`: 28 px with a mouse, 44 on touch.
    expect(show).toHaveClass('pointer-coarse:size-(--control-h)');
  });
});
