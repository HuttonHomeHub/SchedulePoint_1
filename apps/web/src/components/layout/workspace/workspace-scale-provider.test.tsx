import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetActualSizeForTests, setActualSize } from './workspace-scale-pref';
import {
  useWorkspaceScale,
  WorkspaceScaleBand,
  WorkspaceScaleFrame,
  WorkspaceScaleProvider,
} from './workspace-scale-provider';

/**
 * jsdom has no layout, so the boxes are handed in by `sizeBoxes`, and a `ResizeObserver` that reports once,
 * on `observe`, makes the provider read them. What is under test is the arithmetic around them: the scale
 * the box asks for, the guards, the floor, the pointer hold, and the attributes and sizes the two wrappers
 * carry.
 */
beforeEach(() => {
  vi.stubGlobal('CSS', { supports: () => true });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe(): void {
        this.callback();
      }
      disconnect(): void {}
    },
  );
  localStorage.clear();
  resetActualSizeForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Reader(): React.ReactElement {
  const state = useWorkspaceScale();
  return (
    <p data-testid="state">
      {`${String(state.scale)}|${String(state.wouldScale)}|${String(state.actualSize)}`}
    </p>
  );
}

function Harness(): React.ReactElement {
  return (
    <WorkspaceScaleProvider>
      <Reader />
      {/* The wrappers measure their OWN boxes, so a `data-box` on the frame's wrapper is not enough:
          `WorkspaceScaleFrame` renders its outer box itself. The harness reaches it through the DOM. */}
      <WorkspaceScaleFrame>
        <span>root</span>
      </WorkspaceScaleFrame>
      <WorkspaceScaleBand label="Band">
        <span>band</span>
      </WorkspaceScaleBand>
    </WorkspaceScaleProvider>
  );
}

/**
 * Give the two wrappers their layout sizes. Each wrapper has an outer box (what the grid gives it) and an
 * inner one (laid out at box ÷ scale), and the provider reads the outer ones; the band's inner box carries
 * its natural height. Elements are told apart by what they hold, the way the component builds them.
 */
function sizeBoxes(
  frame: { width: number; height: number },
  band: { width: number; height: number },
): void {
  const boxOf = (element: HTMLElement): { width: number; height: number } => {
    if (element.querySelector(':scope > .workspace-container')) return frame;
    if (element.classList.contains('workspace-container')) return frame;
    if (element.classList.contains('workspace-band-container')) return band;
    if (element.querySelector(':scope > .workspace-band-container')) return band;
    return { width: 0, height: 0 };
  };
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return boxOf(this).width;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return boxOf(this).height;
  });
}

describe('the scale provider', () => {
  it('is 1 where the workspace has not been measured, as in a unit test', () => {
    render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('1|false|false');
  });

  it('scales a small window by what the box asks, lays the wrapper out at box ÷ scale, and says so', () => {
    sizeBoxes({ width: 1089, height: 497 }, { width: 1366, height: 88 });
    const { container } = render(<Harness />);
    // 1366 x 636 (M0 §1): the unit is 497 + 88 = 585 high and the root 1089 wide.
    expect(screen.getByTestId('state').textContent).toBe('0.781|true|false');
    const scaled = container.querySelectorAll<HTMLElement>('[data-workspace-scale]');
    expect(scaled).toHaveLength(2);
    for (const wrapper of scaled) {
      expect(wrapper.getAttribute('data-workspace-scale')).toBe('0.781');
      expect(wrapper.hasAttribute('data-workspace-scaled')).toBe(true);
      expect(wrapper.style.transformOrigin).toBe('0 0');
      expect(wrapper.style.transform).toBe('scale(0.781)');
    }
    const [rootWrapper, bandWrapper] = [...scaled];
    expect(Number.parseFloat(rootWrapper!.style.width)).toBeCloseTo(1089 / 0.781, 3);
    expect(Number.parseFloat(rootWrapper!.style.height)).toBeCloseTo(497 / 0.781, 3);
    expect(Number.parseFloat(bandWrapper!.style.width)).toBeCloseTo(1366 / 0.781, 3);
    // The band's row shrinks with it: its outer box is the layout height × the scale.
    expect(Number.parseFloat(bandWrapper!.parentElement!.style.height)).toBeCloseTo(88 * 0.781, 3);
  });

  it('adds nothing to a window that fits: no scale, no transform, no explicit size', () => {
    sizeBoxes({ width: 1003, height: 661 }, { width: 1280, height: 88 });
    const { container } = render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('1|false|false');
    expect(container.querySelector('[data-workspace-scale]')).toBeNull();
    expect(container.querySelector('[style*="transform"]')).toBeNull();
  });

  it('holds the floor under a window smaller than it', () => {
    sizeBoxes({ width: 600, height: 300 }, { width: 877, height: 88 });
    render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('0.75|true|false');
  });

  it('is 1 when the reader chose actual size, and still says the window would scale', () => {
    sizeBoxes({ width: 1089, height: 497 }, { width: 1366, height: 88 });
    setActualSize(true);
    render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('1|true|true');
  });

  it('is 1 under enlarged text and under browser zoom, and does not offer the switch there', () => {
    sizeBoxes({ width: 1089, height: 497 }, { width: 1366, height: 88 });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontSize: '32px',
    } as CSSStyleDeclaration);
    const { unmount } = render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('1|false|false');
    unmount();

    vi.restoreAllMocks();
    sizeBoxes({ width: 1089, height: 497 }, { width: 1366, height: 88 });
    vi.stubGlobal('outerWidth', 1280);
    vi.stubGlobal('innerWidth', 1067);
    render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('1|false|false');
  });

  it('follows a change of the root text size made while it is open', async () => {
    sizeBoxes({ width: 1089, height: 497 }, { width: 1366, height: 88 });
    render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('0.781|true|false');
    document.documentElement.style.fontSize = '32px';
    try {
      await waitFor(() => {
        expect(screen.getByTestId('state').textContent).toBe('1|false|false');
      });
    } finally {
      document.documentElement.style.fontSize = '';
    }
  });

  it('follows the window when the zoom changes under it', () => {
    sizeBoxes({ width: 1089, height: 497 }, { width: 1366, height: 88 });
    vi.stubGlobal('outerWidth', 1280);
    vi.stubGlobal('innerWidth', 1280);
    render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('0.781|true|false');
    vi.stubGlobal('innerWidth', 1067);
    act(() => {
      fireEvent(window, new Event('resize'));
    });
    expect(screen.getByTestId('state').textContent).toBe('1|false|false');
  });

  it('never changes while a pointer button is down, and catches up on release', () => {
    sizeBoxes({ width: 1089, height: 497 }, { width: 1366, height: 88 });
    render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('0.781|true|false');

    act(() => {
      fireEvent.pointerDown(window, { buttons: 1 });
    });
    // The reader's choice of actual size arrives mid-drag (another tab): the scale waits.
    act(() => {
      setActualSize(true);
    });
    expect(screen.getByTestId('state').textContent).toBe('0.781|true|true');

    act(() => {
      fireEvent.pointerUp(window, { buttons: 0 });
    });
    expect(screen.getByTestId('state').textContent).toBe('1|true|true');
  });

  it('keeps holding while a second button is still down', () => {
    sizeBoxes({ width: 1089, height: 497 }, { width: 1366, height: 88 });
    render(<Harness />);
    act(() => {
      fireEvent.pointerDown(window, { buttons: 1 });
      setActualSize(true);
      fireEvent.pointerUp(window, { buttons: 2 });
    });
    expect(screen.getByTestId('state').textContent).toBe('0.781|true|true');
    act(() => {
      fireEvent.pointerUp(window, { buttons: 0 });
    });
    expect(screen.getByTestId('state').textContent).toBe('1|true|true');
  });
});

describe('outside a provider', () => {
  it('reads as unscaled', () => {
    render(<Reader />);
    expect(screen.getByTestId('state').textContent).toBe('1|false|false');
  });

  it('renders the band as its bare landmark', () => {
    const { container } = render(
      <WorkspaceScaleBand label="Band" className="flex">
        <span>band</span>
      </WorkspaceScaleBand>,
    );
    expect(container.innerHTML).toBe(
      '<section aria-label="Band" class="flex"><span>band</span></section>',
    );
  });
});
