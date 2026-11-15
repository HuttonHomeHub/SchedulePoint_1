import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { matchesLayoutWindow, useWorkspaceMatches, useWorkspaceMedia } from './workspace-media';
import { WORKSPACE_WINDOW_INSET_HEIGHT_PX } from './workspace-scale';
import * as provider from './workspace-scale-provider';

import { DECK_TAIL_ROOM_QUERY, PROMOTION_STAGES, SHORT_QUERY } from '@/lib/breakpoints';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('matchesLayoutWindow', () => {
  const window1280x800 = { width: 1280, height: 800 };

  it('answers the legacy and the range spellings from the layout window, in rem or px', () => {
    expect(matchesLayoutWindow('(min-width: 64rem)', window1280x800, 16)).toBe(true);
    expect(matchesLayoutWindow('(min-width: 90rem)', window1280x800, 16)).toBe(false);
    expect(matchesLayoutWindow('(max-height: 44rem)', window1280x800, 16)).toBe(false);
    expect(matchesLayoutWindow('(max-height: 800px)', window1280x800, 16)).toBe(true);
    expect(matchesLayoutWindow(DECK_TAIL_ROOM_QUERY, window1280x800, 16)).toBe(true);
    expect(matchesLayoutWindow('(width < 64rem)', window1280x800, 16)).toBe(false);
    expect(matchesLayoutWindow('(height > 800px)', window1280x800, 16)).toBe(false);
  });

  it('reads rem at the root size in force', () => {
    expect(matchesLayoutWindow('(min-width: 80rem)', window1280x800, 16)).toBe(true);
    expect(matchesLayoutWindow('(min-width: 80rem)', window1280x800, 32)).toBe(false);
  });

  it('leaves a query that is not a width or a height to the window', () => {
    expect(matchesLayoutWindow('(pointer: coarse)', window1280x800, 16)).toBeNull();
    expect(matchesLayoutWindow('(prefers-reduced-motion: reduce)', window1280x800, 16)).toBeNull();
  });

  it('says a scaled band has reached the stages its layout width has, not its screen width', () => {
    // 1024 wide at 0.75 is laid out 1365 wide: stage one (80rem) and not stage two (90rem).
    const scaled = { width: 1024 / 0.75, height: 783 };
    const reached = PROMOTION_STAGES.filter(
      (stage) => matchesLayoutWindow(`(min-width: ${String(stage.rem)}rem)`, scaled, 16) === true,
    );
    expect(reached.map((stage) => stage.name)).toEqual(['PROMOTE_80']);
  });

  it('keeps `short` consistent with the stylesheet’s `ws-short` at the designed size', () => {
    // The root's layout height plus what the shell keeps is the window's: 800 is not short, 704 is.
    expect(661 + WORKSPACE_WINDOW_INSET_HEIGHT_PX).toBe(800);
    expect(matchesLayoutWindow(SHORT_QUERY, { width: 1280, height: 661 + 139 }, 16)).toBe(false);
    expect(matchesLayoutWindow(SHORT_QUERY, { width: 1280, height: 565 + 139 }, 16)).toBe(true);
  });
});

function Probe({ queries }: { queries: readonly string[] }): React.ReactElement {
  const answers = useWorkspaceMatches(queries, false);
  const single = useWorkspaceMedia(queries[0] ?? '', false);
  return <p data-testid="answers">{`${answers.map(String).join(',')}|${String(single)}`}</p>;
}

describe('the hooks', () => {
  it('fall back to the window outside a workspace, query by query', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 64rem)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<Probe queries={['(min-width: 64rem)', '(min-width: 80rem)']} />);
    expect(screen.getByTestId('answers').textContent).toBe('true,false|true');
  });

  it('answer false where the window cannot be asked at all (jsdom), as `useMediaQuery` does', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<Probe queries={['(min-width: 64rem)']} />);
    expect(screen.getByTestId('answers').textContent).toBe('false|false');
  });

  it('leave a workspace that is not scaled to the window, which answers it exactly', () => {
    vi.spyOn(provider, 'useWorkspaceScale').mockReturnValue({
      scale: 1,
      wouldScale: false,
      actualSize: false,
      window: { width: 1280, height: 800 },
      frame: { width: 1003, height: 661 },
    });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 90rem)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<Probe queries={['(min-width: 90rem)', '(min-width: 64rem)']} />);
    // The window's answers, not the layout's (which would be false and true).
    expect(screen.getByTestId('answers').textContent).toBe('true,false|true');
  });

  it('answer a size query from the workspace and leave the rest to the window', () => {
    vi.spyOn(provider, 'useWorkspaceScale').mockReturnValue({
      scale: 0.75,
      wouldScale: true,
      actualSize: false,
      window: { width: 1365, height: 783 },
      frame: { width: 747, height: 400 },
    });
    // The real window would say the opposite of the workspace on both counts.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-height: 44rem)' || query === '(pointer: coarse)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<Probe queries={['(max-height: 44rem)', '(min-width: 80rem)', '(pointer: coarse)']} />);
    // 783 is not short and 1365 reaches 80rem; the pointer is the window's.
    expect(screen.getByTestId('answers').textContent).toBe('false,true,true|false');
  });
});
