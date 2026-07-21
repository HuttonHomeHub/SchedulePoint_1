// Global test setup for Vitest (jsdom environment).
// Extends `expect` with Testing Library's DOM matchers and clears the DOM
// between tests to keep them isolated.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom doesn't implement the native <dialog> modal methods our Dialog primitive
// relies on; stub them so components that open a dialog can be unit-tested.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: (this: HTMLDialogElement) => void;
    show?: (this: HTMLDialogElement) => void;
    close?: (this: HTMLDialogElement) => void;
  };
  if (!proto.showModal) {
    proto.showModal = function showModal(this: HTMLDialogElement): void {
      this.open = true;
    };
  }
  if (!proto.show) {
    proto.show = function show(this: HTMLDialogElement): void {
      this.open = true;
    };
  }
  if (!proto.close) {
    proto.close = function close(this: HTMLDialogElement): void {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
}

// jsdom doesn't implement the 2D canvas context (getContext returns null and logs
// "Not implemented"). Stub it with a no-op 2D context so canvas-backed components (the
// TSLD painter) can be unit-tested — the painter only calls these drawing methods and
// mutable style properties; it never reads pixels back.
if (typeof HTMLCanvasElement !== 'undefined') {
  const noop = (): void => undefined;
  HTMLCanvasElement.prototype.getContext = function getContext(
    contextId: string,
  ): CanvasRenderingContext2D | null {
    if (contextId !== '2d') return null;
    return {
      clearRect: noop,
      fillRect: noop,
      strokeRect: noop,
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      stroke: noop,
      fill: noop,
      setTransform: noop,
      setLineDash: noop,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;
  } as typeof HTMLCanvasElement.prototype.getContext;
}

// jsdom implements neither ResizeObserver nor Element.scrollTo, which the navigator
// tree's virtualizer (@tanstack/react-virtual) relies on. Stub them: the observer
// delivers one measurement (from getBoundingClientRect) on observe so the virtualizer
// sizes its viewport and renders the windowed rows; scrollToIndex becomes a no-op.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    constructor(_callback: ResizeObserverCallback) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo(): void {};
}

afterEach(() => {
  cleanup();
});
