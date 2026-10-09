import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplorerColumn } from './explorer-column';
import { explorerCeiling, useExplorerPrefs } from './use-explorer-prefs';

import type { UseExpansionState } from '@/features/navigator';

vi.mock('./navigator-rail', () => ({ NavigatorRail: () => <nav aria-label="Project Explorer" /> }));
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
