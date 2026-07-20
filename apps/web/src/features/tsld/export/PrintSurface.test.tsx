import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrintSurface, printDiagramImage, PRINT_TEARDOWN_FALLBACK_MS } from './PrintSurface';

/**
 * The TSLD Browser-Print surface + its mount/teardown lifecycle (spec `docs/specs/export-print/`
 * §Milestone 4, feature-spec §4 **CQ-4** — the image path). Two concerns:
 *
 * 1. `PrintSurface` renders the whole-diagram image + a plan-name · date title inside the print-only
 *    container (the element the co-located print stylesheet reveals only in `@media print` and hides on
 *    screen — asserted via its `tsld-print-root` class, since jsdom applies no print CSS).
 * 2. `printDiagramImage` mounts the surface, opens the print dialog, and tears everything down again on
 *    the `afterprint` event AND on the fallback timeout (whichever fires first), restoring focus.
 */

const MOCK_URL = 'blob:mock-print-url';

describe('PrintSurface (component)', () => {
  it('renders the whole-diagram image and the plan-name · date title in the print-only container', () => {
    render(
      <PrintSurface
        imageUrl={MOCK_URL}
        title="North Tower"
        subtitle="As of 2026-01-01"
        alt="Diagram of North Tower"
      />,
    );
    const image = screen.getByRole('img', { name: 'Diagram of North Tower' });
    expect(image).toHaveAttribute('src', MOCK_URL);
    expect(screen.getByRole('heading', { name: 'North Tower' })).toBeInTheDocument();
    expect(screen.getByText('As of 2026-01-01')).toBeInTheDocument();
    // The container is the print-only element (the stylesheet keys its screen `display:none` + the
    // `@media print` reveal on this class), not a normally-visible node.
    expect(screen.getByTestId('tsld-print-surface')).toHaveClass('tsld-print-root');
  });
});

describe('printDiagramImage (mount / teardown lifecycle)', () => {
  const createObjectURL = vi.fn(() => MOCK_URL);
  const revokeObjectURL = vi.fn();
  const print = vi.fn();

  beforeEach(() => {
    // jsdom implements neither `URL.createObjectURL`/`revokeObjectURL` nor `window.print`; stub them.
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
      writable: true,
    });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    print.mockClear();
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
    // Clear any surface a test left mounted (a teardown that didn't run).
    document.querySelector('.tsld-print-container')?.remove();
    vi.useRealTimers();
  });

  const blob = new Blob(['png'], { type: 'image/png' });

  function container(): HTMLElement | null {
    return document.querySelector('.tsld-print-container');
  }

  it('mounts the surface, opens the print dialog, then tears down on `afterprint` and restores focus', () => {
    // A control that "held focus" when Print was activated — focus must return to it after printing.
    const trigger = document.createElement('button');
    trigger.textContent = 'Print';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    act(() => {
      printDiagramImage({ blob, title: 'North Tower', subtitle: 'As of 2026-01-01' }, { print });
    });

    // Mounted: the container is in the DOM with the image, the object URL was created, and the dialog
    // was opened exactly once.
    expect(container()).not.toBeNull();
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(container()?.querySelector('img')).toHaveAttribute('src', MOCK_URL);
    expect(print).toHaveBeenCalledTimes(1);

    // The browser signals the dialog closed → the surface tears down, the URL is revoked, focus returns.
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(container()).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it('tears down on the fallback timeout when `afterprint` never fires', () => {
    vi.useFakeTimers();
    act(() => {
      printDiagramImage({ blob, title: 'North Tower', subtitle: 'As of 2026-01-01' }, { print });
    });
    expect(container()).not.toBeNull();

    // No `afterprint` — only the fallback timer elapses.
    act(() => {
      vi.advanceTimersByTime(PRINT_TEARDOWN_FALLBACK_MS);
    });
    expect(container()).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
  });

  it('tears down only once — `afterprint` then the fallback timer do not double-revoke', () => {
    vi.useFakeTimers();
    act(() => {
      printDiagramImage({ blob, title: 'North Tower', subtitle: 'As of 2026-01-01' }, { print });
    });
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(container()).toBeNull();
    // The fallback timer was cleared by the `afterprint` teardown, so advancing time is inert.
    act(() => {
      vi.advanceTimersByTime(PRINT_TEARDOWN_FALLBACK_MS * 2);
    });
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('honours an injected fallback delay', () => {
    vi.useFakeTimers();
    act(() => {
      printDiagramImage(
        { blob, title: 'North Tower', subtitle: 'As of 2026-01-01' },
        { print, fallbackMs: 500 },
      );
    });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(container()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container()).toBeNull();
  });
});
